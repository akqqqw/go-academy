// Команда server запускает backend Go Academy: REST API, база данных и
// раздачу собранного фронтенда.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"goacademy/internal/api"
	"goacademy/internal/config"
	"goacademy/internal/contentfs"
	"goacademy/internal/database"
	"goacademy/internal/storage"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "ошибка:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	config.LoadDotEnv()
	cfg, err := config.Load(args)
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	// На Vercel корневой content/ не попадает в сервис backend: контент встроен
	// в бинарник и распаковывается в каталог данных (/tmp). Локально шаг
	// пропускается — Materialize вернёт false.
	extractedDir := filepath.Join(cfg.DataDir, "content")
	if extracted, err := contentfs.Materialize(extractedDir); err != nil {
		return fmt.Errorf("подготовить встроенный контент: %w", err)
	} else if extracted {
		cfg.ContentDir = extractedDir
		logger.Info("контент распакован из бинарника", "dir", extractedDir)
	}

	db, err := openDatabase(cfg)
	if err != nil {
		return fmt.Errorf("база данных: %w", err)
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Резервная копия при каждом запуске: обновление приложения не должно
	// привести к потере пользовательских данных. Для Supabase бэкапы делает
	// сама платформа, локальный VACUUM INTO там недоступен.
	if !db.IsPostgres() {
		backupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		if backup, err := storage.BackupOnStart(backupCtx, db, cfg.DataDir, 5); err != nil {
			logger.Warn("не удалось создать резервную копию", "err", err)
		} else {
			logger.Info("резервная копия создана", "file", backup.Name, "size_kb", backup.SizeBytes/1024)
		}
		cancel()
	}

	// Каталоги для запусков кода создаются заранее: раннер не должен падать на
	// первом запуске из-за отсутствующей папки.
	for _, dir := range []string{cfg.WorkDir(), cfg.BuildCacheDir()} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			logger.Warn("не удалось создать каталог запусков", "dir", dir, "err", err)
		}
	}

	server := api.New(cfg, db, logger)

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("Go Academy backend запущен",
			"addr", "http://"+cfg.Addr,
			"db", db.Path,
			"content", cfg.ContentDir,
			"frontend_ready", server.FrontendReady(),
		)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("http-сервер: %w", err)
	case <-ctx.Done():
		logger.Info("остановка сервера")
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("корректное завершение: %w", err)
	}
	logger.Info("сервер остановлен")
	return nil
}

// openDatabase выбирает Supabase Postgres, если задана строка подключения.
// SQLite остаётся только для тестов и режима без авторизации.
func openDatabase(cfg config.Config) (*database.DB, error) {
	if cfg.DatabaseURL != "" {
		return database.OpenPostgres(cfg.DatabaseURL)
	}
	if cfg.RequireAuth {
		return nil, errors.New("не задана строка подключения SUPABASE_DB_URL")
	}
	return database.Open(cfg.DBPath())
}
