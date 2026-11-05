// Команда coderunner — изолированный сервис запуска пользовательского Go-кода.
//
// Он вынесен из основного API, чтобы код учеников выполнялся не в процессе
// бэкенда: у сервиса нет доступа к базе, ключам Supabase и сети контейнера.
// Запускать его нужно в контейнере с ограничениями (см. docs/CODE_RUNNER.md):
// во внутренней сети без выхода в интернет, с read-only корневой файловой
// системой и лимитами CPU/RAM.
//
// Протокол совпадает с клиентом backend/internal/runner.RemoteRunner:
//
//	GET  /status  → runner.Status
//	POST /run     → runner.Result       {"code": "…"}
//	POST /build   → runner.Result       {"code": "…"}
//	POST /format  → {"code","diagnostics"}
//	POST /test    → runner.TestResult   {"code": "…", "tests": "…"}
//	GET  /healthz → {"status":"ok"}
//
// Аутентификация — общий секрет CODERUNNER_TOKEN в заголовке Authorization.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"goacademy/internal/runner"
)

const (
	// maxBody — потолок тела запроса. Исходник ограничен 256 КиБ, но тесты
	// задания приходят тем же запросом, поэтому запас есть.
	maxBody = 2 << 20
	// isolatedWarning — текст, который видит интерфейс, когда сервис запущен
	// в контейнере: отдельный процесс без доступа к базе и секретам API,
	// без выхода в интернет, с лимитами по времени, памяти и размеру вывода.
	isolatedWarning = "Код выполняется в отдельном контейнере без выхода в интернет, с лимитами по времени, памяти и размеру вывода."
)

type server struct {
	exec     runner.Executor
	token    string
	isolated bool
	log      *slog.Logger
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "ошибка:", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	token := envOr("CODERUNNER_TOKEN", "")
	if token == "" {
		return errors.New("не задан CODERUNNER_TOKEN: без общего секрета сервис не должен быть доступен")
	}

	addr := envOr("CODERUNNER_ADDR", "")
	if addr == "" {
		port := envOr("PORT", "8090")
		if _, err := strconv.Atoi(port); err != nil {
			return fmt.Errorf("некорректный PORT %q", port)
		}
		addr = ":" + port
	}

	timeout := time.Duration(envIntOr("CODERUNNER_TIMEOUT_SEC", 10)) * time.Second
	if timeout < time.Second || timeout > time.Minute {
		return fmt.Errorf("CODERUNNER_TIMEOUT_SEC должен быть 1..60, получено %s", timeout)
	}

	exec := runner.New(runner.Config{
		GoBinary:    envOr("CODERUNNER_GO_BIN", ""),
		WorkRoot:    envOr("CODERUNNER_WORK_DIR", ""),
		CacheDir:    envOr("CODERUNNER_CACHE_DIR", ""),
		Timeout:     timeout,
		MaxOutput:   envIntOr("CODERUNNER_MAX_OUTPUT", runner.DefaultMaxOutput),
		MaxCode:     envIntOr("CODERUNNER_MAX_CODE", runner.DefaultMaxCode),
		Concurrency: envIntOr("CODERUNNER_CONCURRENCY", runner.DefaultConcurrency),
	})

	s := &server{
		exec:     exec,
		token:    token,
		isolated: envOr("CODERUNNER_ISOLATED", "1") != "0",
		log:      logger,
	}

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           s.routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// Ответ может ждать сборку и выполнение, поэтому WriteTimeout выше
		// суммы серверных лимитов (40 с сборки + 10 с запуска + запас).
		WriteTimeout: 90 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()

	logger.Info("сервис запуска кода слушает", "addr", addr, "timeout", timeout.String(), "isolated", s.isolated)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /status", s.authorize(s.handleStatus))
	mux.HandleFunc("POST /run", s.authorize(s.handleRun))
	mux.HandleFunc("POST /build", s.authorize(s.handleBuild))
	mux.HandleFunc("POST /format", s.authorize(s.handleFormat))
	mux.HandleFunc("POST /test", s.authorize(s.handleTest))
	return mux
}

// authorize пропускает только запросы с валидным Bearer-токеном.
func (s *server) authorize(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		presented := strings.TrimPrefix(header, "Bearer ")
		// Постоянное время сравнения: токен не должен «протекать» по таймингам.
		if header == presented || subtle.ConstantTimeCompare([]byte(presented), []byte(s.token)) != 1 {
			writeError(w, http.StatusUnauthorized, "требуется токен сервиса")
			return
		}
		next(w, r)
	}
}

func (s *server) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := s.exec.Status(r.Context())
	if s.isolated {
		status.Warning = isolatedWarning
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *server) handleRun(w http.ResponseWriter, r *http.Request) {
	payload, ok := readPayload(w, r)
	if !ok {
		return
	}
	result, err := s.exec.Run(r.Context(), payload.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) handleBuild(w http.ResponseWriter, r *http.Request) {
	payload, ok := readPayload(w, r)
	if !ok {
		return
	}
	result, err := s.exec.Build(r.Context(), payload.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) handleFormat(w http.ResponseWriter, r *http.Request) {
	payload, ok := readPayload(w, r)
	if !ok {
		return
	}
	code, diagnostics, err := s.exec.Format(payload.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if diagnostics == nil {
		diagnostics = []runner.Diagnostic{}
	}
	writeJSON(w, http.StatusOK, runner.WireFormatResponse{Code: code, Diagnostics: diagnostics})
}

func (s *server) handleTest(w http.ResponseWriter, r *http.Request) {
	payload, ok := readPayload(w, r)
	if !ok {
		return
	}
	if strings.TrimSpace(payload.Tests) == "" {
		writeError(w, http.StatusBadRequest, "не передан файл тестов задания")
		return
	}
	result, err := s.exec.Test(r.Context(), payload.Code, payload.Tests)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func readPayload(w http.ResponseWriter, r *http.Request) (runner.WireRequest, bool) {
	var payload runner.WireRequest
	body := http.MaxBytesReader(w, r.Body, maxBody)
	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный JSON: "+err.Error())
		return runner.WireRequest{}, false
	}
	if strings.TrimSpace(payload.Code) == "" {
		writeError(w, http.StatusBadRequest, "пустой исходник")
		return runner.WireRequest{}, false
	}
	return payload, true
}

func writeJSON(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, code int, message string) {
	writeJSON(w, code, map[string]string{"error": message})
}

func envOr(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return fallback
}
