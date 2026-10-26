// Package api реализует локальный REST API Go Academy.
package api

import (
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"goacademy/internal/config"
	"goacademy/internal/course"
	"goacademy/internal/database"
	"goacademy/internal/progress"
	"goacademy/internal/runner"
	"goacademy/internal/static"
	"goacademy/internal/storage"
)

// Server хранит зависимости HTTP-слоя и собранный роутер.
type Server struct {
	cfg      config.Config
	log      *slog.Logger
	db       *database.DB
	settings *storage.Settings
	activity *storage.Activity
	lessons  *storage.Lessons
	history  *storage.History
	backups  *storage.Backups
	drafts   *storage.Drafts
	stats    *progress.Service
	course   *course.Store
	runner   *runner.Runner
	static   *static.Handler
	started  time.Time
	handler  http.Handler
	// routeMethods хранит методы для каждого пути: нужно, чтобы отвечать 405,
	// а не 404, когда маршрут существует, но метод неверный.
	routeMethods map[string][]string
}

// New собирает сервер и маршруты.
func New(cfg config.Config, db *database.DB, logger *slog.Logger) *Server {
	activity := storage.NewActivity(db)
	settings := storage.NewSettings(db)

	s := &Server{
		cfg:      cfg,
		log:      logger,
		db:       db,
		settings: settings,
		activity: activity,
		lessons:  storage.NewLessons(db),
		history:  storage.NewHistory(db),
		backups:  storage.NewBackups(db, cfg.DataDir),
		drafts:   storage.NewDrafts(db),
		stats:    progress.New(db, activity, settings),
		course:   course.NewStore(cfg.ContentDir),
		runner: runner.New(runner.Config{
			GoBinary:  cfg.GoBinary,
			WorkRoot:  cfg.WorkDir(),
			CacheDir:  cfg.BuildCacheDir(),
			Timeout:   cfg.RunTimeout,
			MaxOutput: cfg.RunMaxOutput,
			MaxCode:   cfg.RunMaxCode,
		}),
		static:       static.New(cfg.FrontendDir),
		started:      time.Now(),
		routeMethods: map[string][]string{},
	}
	s.handler = s.routes()
	return s
}

// Handler возвращает готовый http.Handler.
func (s *Server) Handler() http.Handler { return s.handler }

// FrontendReady сообщает, найдена ли сборка интерфейса.
func (s *Server) FrontendReady() bool { return s.static.Available() }

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	// Система.
	s.handle(mux, http.MethodGet, "/api/health", s.handleHealth)
	s.handle(mux, http.MethodGet, "/api/meta", s.handleMeta)

	// Главная страница.
	s.handle(mux, http.MethodGet, "/api/dashboard", s.handleDashboard)

	// Уроки: содержимое и прогресс.
	s.handle(mux, http.MethodGet, "/api/lessons/{id}/content", s.handleLessonContent)
	s.handle(mux, http.MethodPost, "/api/lessons/{id}/opened", s.handleLessonOpened)
	s.handle(mux, http.MethodPost, "/api/lessons/{id}/completed", s.handleLessonComplete)
	s.handle(mux, http.MethodGet, "/api/lessons/{id}", s.handleLessonGet)

	// Редактор кода: запуск, форматирование и черновики.
	s.handle(mux, http.MethodGet, "/api/editor/status", s.handleEditorStatus)
	s.handle(mux, http.MethodPost, "/api/editor/run", s.handleRunCode)
	s.handle(mux, http.MethodPost, "/api/editor/check", s.handleCheckCode)
	s.handle(mux, http.MethodPost, "/api/editor/format", s.handleFormatCode)
	s.handle(mux, http.MethodGet, "/api/drafts", s.handleDraftsList)
	s.handle(mux, http.MethodGet, "/api/drafts/{key}", s.handleDraftGet)
	s.handle(mux, http.MethodPut, "/api/drafts/{key}", s.handleDraftSave)
	s.handle(mux, http.MethodDelete, "/api/drafts/{key}", s.handleDraftDelete)

	// Программа курса и контент.
	s.handle(mux, http.MethodGet, "/api/course", s.handleCourse)
	s.handle(mux, http.MethodPost, "/api/content/reload", s.handleReloadContent)

	// Настройки.
	s.handle(mux, http.MethodGet, "/api/settings", s.handleSettingsGet)
	s.handle(mux, http.MethodPatch, "/api/settings", s.handleSettingsPatch)

	// Прогресс и активность.
	s.handle(mux, http.MethodGet, "/api/progress", s.handleProgress)
	s.handle(mux, http.MethodGet, "/api/activity", s.handleActivity)
	s.handle(mux, http.MethodPost, "/api/activity/study", s.handleStudyPing)
	s.handle(mux, http.MethodGet, "/api/activity/recent", s.handleRecent)

	// Поиск.
	s.handle(mux, http.MethodGet, "/api/search", s.handleSearch)

	// Резервные копии.
	s.handle(mux, http.MethodGet, "/api/backups", s.handleBackupsList)
	s.handle(mux, http.MethodGet, "/api/backup", s.handleBackupDownload)

	// Неизвестные API-маршруты — JSON 404/405, а не index.html.
	mux.HandleFunc("/api/", s.handleUnknownAPI)

	// Всё остальное — статика SPA.
	mux.Handle("/", s.static)

	return withSecurityHeaders(s.withRecover(s.withCORS(s.withLogging(mux))))
}

// handle регистрирует маршрут и запоминает допустимые методы.
func (s *Server) handle(mux *http.ServeMux, method, path string, handler http.HandlerFunc) {
	mux.HandleFunc(method+" "+path, handler)
	s.routeMethods[path] = append(s.routeMethods[path], method)
}

func (s *Server) handleUnknownAPI(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSuffix(r.URL.Path, "/")
	if path == "" {
		path = r.URL.Path
	}
	if methods, ok := s.routeMethods[path]; ok {
		sort.Strings(methods)
		w.Header().Set("Allow", strings.Join(methods, ", "))
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed",
			"метод "+r.Method+" не поддерживается для "+path)
		return
	}
	writeError(w, http.StatusNotFound, "not_found", "эндпоинт не найден: "+r.URL.Path)
}
