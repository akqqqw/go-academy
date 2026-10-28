package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"goacademy/internal/auth"
	"goacademy/internal/database"
	"goacademy/internal/storage"
)

// statusRecorder запоминает код ответа для логов.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(data []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(data)
	r.bytes += n
	return n, err
}

// withLogging пишет строку в лог на каждый запрос к API.
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/health" {
			s.log.Info("http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", recorder.status,
				"duration_ms", time.Since(start).Milliseconds(),
			)
		}
	})
}

// withRecover превращает панику в 500 без остановки сервера.
func (s *Server) withRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.log.Error("panic", "err", recovered, "path", r.URL.Path, "stack", string(debug.Stack()))
				writeError(w, http.StatusInternalServerError, "internal_error", "внутренняя ошибка сервера")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// withAuth требует валидный Supabase access-токен для всех API-запросов,
// кроме healthcheck. Статика и SPA остаются публичными: без них не загрузится
// даже страница входа.
func (s *Server) withAuth(next http.Handler) http.Handler {
	if !s.cfg.RequireAuth {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}
		if s.verifier == nil {
			writeError(w, http.StatusServiceUnavailable, "auth_not_configured",
				"вход не настроен: задайте SUPABASE_URL и SUPABASE_ANON_KEY")
			return
		}

		token := auth.BearerToken(r)
		if token == "" {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeError(w, http.StatusUnauthorized, "unauthorized", "требуется вход в аккаунт")
			return
		}

		user, err := s.verifier.Verify(r.Context(), token)
		if err != nil {
			if errors.Is(err, auth.ErrInvalidToken) {
				w.Header().Set("WWW-Authenticate", "Bearer error=\"invalid_token\"")
				writeError(w, http.StatusUnauthorized, "invalid_token", "сессия истекла, войдите снова")
				return
			}
			s.log.Warn("проверка токена Supabase не удалась", "err", err)
			writeError(w, http.StatusServiceUnavailable, "auth_unavailable",
				"сервис авторизации временно недоступен")
			return
		}

		s.withUserDB(next).ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), user)))
	})
}

// withUserDB открывает транзакцию Postgres от имени пользователя: роль
// authenticated + JWT-claims, поэтому RLS автоматически фильтрует данные.
// Для SQLite (тесты и режим без входа) middleware ничего не делает.
func (s *Server) withUserDB(next http.Handler) http.Handler {
	if !s.db.IsPostgres() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := auth.UserFromContext(r.Context())
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		claims, err := json.Marshal(map[string]string{
			"sub":   user.ID,
			"email": user.Email,
			"role":  "authenticated",
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "auth_error", "не удалось сформировать claims")
			return
		}

		tx, err := s.db.RequestTx(r.Context(), string(claims))
		if err != nil {
			s.log.Error("не удалось открыть транзакцию пользователя", "err", err)
			writeError(w, http.StatusServiceUnavailable, "db_error", "база данных временно недоступна")
			return
		}
		ctx := database.WithTx(r.Context(), tx)

		created, err := storage.BootstrapUser(ctx, s.db, user.Email)
		if err != nil {
			_ = tx.Rollback()
			s.log.Error("не удалось подготовить профиль пользователя", "err", err, "user", user.ID)
			writeError(w, http.StatusInternalServerError, "bootstrap_error", "не удалось подготовить аккаунт")
			return
		}
		if created {
			if _, err := s.flashcards.Sync(ctx); err != nil {
				_ = tx.Rollback()
				s.log.Error("не удалось синхронизировать карточки пользователя", "err", err, "user", user.ID)
				writeError(w, http.StatusInternalServerError, "bootstrap_error", "не удалось подготовить карточки")
				return
			}
		}

		recorder := &statusRecorder{ResponseWriter: w}
		completed := false
		defer func() {
			if !completed {
				_ = tx.Rollback()
			}
		}()

		next.ServeHTTP(recorder, r.WithContext(ctx))
		completed = true

		if recorder.status >= http.StatusBadRequest {
			_ = tx.Rollback()
			return
		}
		if err := tx.Commit(); err != nil {
			s.log.Error("не удалось зафиксировать транзакцию пользователя", "err", err, "user", user.ID)
		}
	})
}

// withSecurityHeaders добавляет базовые заголовки безопасности.
// X-Frame-Options намеренно не выставляется: приложение должно открываться
// во встроенном preview-окне и локальных iframe-панелях.
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "no-referrer")
		header.Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "+
				"style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "+
				"worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co")
		next.ServeHTTP(w, r)
	})
}

// withCORS разрешает запросы с dev-сервера Vite (другой порт).
func (s *Server) withCORS(next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(s.cfg.AllowedOrigins))
	for _, origin := range s.cfg.AllowedOrigins {
		allowed[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
