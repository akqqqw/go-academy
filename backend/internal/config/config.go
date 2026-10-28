// Package config собирает настройки запуска сервера из флагов и переменных
// окружения. Приложение локальное, поэтому конфигурация намеренно простая.
package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Version — версия приложения, подставляется при сборке через -ldflags.
var Version = "0.1.0"

// Config — все параметры запуска.
type Config struct {
	// Addr — адрес, на котором слушает HTTP-сервер.
	Addr string
	// DataDir — каталог с базой данных и резервными копиями.
	DataDir string
	// ContentDir — каталог с учебным контентом (JSON/Markdown).
	ContentDir string
	// FrontendDir — каталог собранного фронтенда. Может отсутствовать в dev-режиме.
	FrontendDir string
	// AllowedOrigins — origin'ы, которым разрешены CORS-запросы (dev-сервер Vite).
	AllowedOrigins []string
	// ShutdownTimeout — сколько ждём корректного завершения сервера.
	ShutdownTimeout time.Duration
	// GoBinary — путь к go. Пустая строка означает автопоиск в PATH и GOROOT.
	GoBinary string
	// RunTimeout — лимит времени выполнения пользовательской программы.
	RunTimeout time.Duration
	// RunMaxOutput — лимит вывода на поток (stdout/stderr).
	RunMaxOutput int
	// RunMaxCode — лимит размера исходника.
	RunMaxCode int
}

// DBPath возвращает путь к файлу базы данных.
func (c Config) DBPath() string { return filepath.Join(c.DataDir, "academy.db") }

// WorkDir — каталог для временных папок запуска кода. Живёт внутри каталога
// данных, чтобы не засорять систему и удаляться вместе с ним.
func (c Config) WorkDir() string { return filepath.Join(c.DataDir, "tmp") }

// BuildCacheDir — общий кеш сборки Go для запусков из редактора. Отдельный от
// пользовательского GOCACHE, чтобы не зависеть от окружения.
func (c Config) BuildCacheDir() string { return filepath.Join(c.DataDir, "gocache") }

// Load читает конфигурацию из аргументов командной строки и окружения.
func Load(args []string) (Config, error) {
	fs := flag.NewFlagSet("go-academy", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	host := fs.String("host", envOr("GOACADEMY_HOST", "127.0.0.1"), "хост HTTP-сервера")
	port := fs.Int("port", envIntOr("GOACADEMY_PORT", 8080), "порт HTTP-сервера")
	dataDir := fs.String("data", envOr("GOACADEMY_DATA_DIR", ""), "каталог данных (по умолчанию ./data)")
	contentDir := fs.String("content", envOr("GOACADEMY_CONTENT_DIR", ""), "каталог контента (по умолчанию ./content)")
	frontendDir := fs.String("frontend", envOr("GOACADEMY_FRONTEND_DIR", ""), "каталог собранного фронтенда (по умолчанию ./frontend/dist)")
	goBinary := fs.String("go", envOr("GOACADEMY_GO_BIN", ""), "путь к go (по умолчанию ищется в PATH)")
	runTimeout := fs.Int("run-timeout", envIntOr("GOACADEMY_RUN_TIMEOUT_SEC", 10), "лимит выполнения кода, секунды")
	origins := fs.String("cors", envOr("GOACADEMY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"), "разрешённые origin'ы через запятую")

	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if *port < 1 || *port > 65535 {
		return Config{}, fmt.Errorf("некорректный порт: %d", *port)
	}
	if *runTimeout < 1 || *runTimeout > 60 {
		return Config{}, fmt.Errorf("некорректный лимит выполнения: %d секунд (допустимо 1–60)", *runTimeout)
	}

	cfg := Config{
		Addr:            fmt.Sprintf("%s:%d", *host, *port),
		DataDir:         defaultDir(*dataDir, "data"),
		ContentDir:      defaultDir(*contentDir, "content"),
		FrontendDir:     defaultDir(*frontendDir, filepath.Join("frontend", "dist")),
		ShutdownTimeout: 10 * time.Second,
		GoBinary:        strings.TrimSpace(*goBinary),
		RunTimeout:      time.Duration(*runTimeout) * time.Second,
		RunMaxOutput:    256 << 10,
		RunMaxCode:      256 << 10,
	}
	for _, origin := range strings.Split(*origins, ",") {
		if trimmed := strings.TrimSpace(origin); trimmed != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, trimmed)
		}
	}
	return cfg, nil
}

func defaultDir(value, fallback string) string {
	if value == "" {
		value = fallback
	}
	if abs, err := filepath.Abs(value); err == nil {
		return abs
	}
	return value
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if parsed, err := strconv.Atoi(v); err == nil {
			return parsed
		}
	}
	return fallback
}
