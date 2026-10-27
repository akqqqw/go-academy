// Package api реализует локальный REST API Go Academy.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"goacademy/internal/cards"
	"goacademy/internal/config"
	"goacademy/internal/course"
	"goacademy/internal/database"
	"goacademy/internal/practice"
	"goacademy/internal/progress"
	"goacademy/internal/runner"
	"goacademy/internal/static"
	"goacademy/internal/storage"
)

// Server хранит зависимости HTTP-слоя и собранный роутер.
type Server struct {
	cfg        config.Config
	log        *slog.Logger
	db         *database.DB
	settings   *storage.Settings
	activity   *storage.Activity
	lessons    *storage.Lessons
	history    *storage.History
	backups    *storage.Backups
	drafts     *storage.Drafts
	notes      *storage.Notes
	flashcards *storage.Flashcards
	exAttempts *storage.ExerciseProgress
	stats      *progress.Service
	course     *course.Store
	cardDecks  *cards.Store
	exercises  *practice.Store
	runner     *runner.Runner
	static     *static.Handler
	started    time.Time
	handler    http.Handler
	// routeMethods хранит методы для каждого пути: нужно, чтобы отвечать 405,
	// а не 404, когда маршрут существует, но метод неверный.
	routeMethods map[string][]string
}

// New собирает сервер и маршруты.
func New(cfg config.Config, db *database.DB, logger *slog.Logger) *Server {
	activity := storage.NewActivity(db)
	settings := storage.NewSettings(db)

	s := &Server{
		cfg:        cfg,
		log:        logger,
		db:         db,
		settings:   settings,
		activity:   activity,
		lessons:    storage.NewLessons(db),
		history:    storage.NewHistory(db),
		backups:    storage.NewBackups(db, cfg.DataDir),
		drafts:     storage.NewDrafts(db),
		notes:      storage.NewNotes(db),
		exAttempts: storage.NewExerciseProgress(db),
		stats:      progress.New(db, activity, settings),
		course:     course.NewStore(cfg.ContentDir),
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
	s.exercises = practice.NewStore(cfg.ContentDir, s.course)
	// Колоды карточек читаются из контента, прогресс повторений — в SQLite.
	s.cardDecks = cards.NewStore(cfg.ContentDir)
	if err := s.cardDecks.Reload(); err != nil {
		s.log.Warn("колоды карточек не загружены", "error", err)
	}
	s.flashcards = storage.NewFlashcards(db, s.cardDecks)
	if _, err := s.flashcards.Sync(context.Background()); err != nil {
		s.log.Warn("карточки не синхронизированы с базой", "error", err)
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

	// Практика: задания и проверка решений настоящими тестами.
	s.handle(mux, http.MethodGet, "/api/exercises", s.handleExercisesList)
	s.handle(mux, http.MethodGet, "/api/exercises/{id}", s.handleExerciseGet)
	s.handle(mux, http.MethodPost, "/api/exercises/{id}/submit", s.handleExerciseSubmit)
	s.handle(mux, http.MethodGet, "/api/exercises/{id}/solution", s.handleExerciseSolution)

	// Заметки и папки.
	s.handle(mux, http.MethodGet, "/api/notes", s.handleNotesList)
	s.handle(mux, http.MethodPost, "/api/notes", s.handleNoteCreate)
	s.handle(mux, http.MethodGet, "/api/notes/tags", s.handleNoteTags)
	s.handle(mux, http.MethodGet, "/api/notes/{id}", s.handleNoteGet)
	s.handle(mux, http.MethodPut, "/api/notes/{id}", s.handleNoteUpdate)
	s.handle(mux, http.MethodDelete, "/api/notes/{id}", s.handleNoteDelete)
	s.handle(mux, http.MethodGet, "/api/note-folders", s.handleFoldersList)
	s.handle(mux, http.MethodPost, "/api/note-folders", s.handleFolderCreate)
	s.handle(mux, http.MethodPut, "/api/note-folders/{id}", s.handleFolderRename)
	s.handle(mux, http.MethodDelete, "/api/note-folders/{id}", s.handleFolderDelete)

	// Карточки: SM-2, повторения и свои карточки.
	s.handle(mux, http.MethodGet, "/api/flashcards", s.handleFlashcardsOverview)
	s.handle(mux, http.MethodPost, "/api/flashcards", s.handleFlashcardCreate)
	s.handle(mux, http.MethodGet, "/api/flashcards/queue", s.handleFlashcardsQueue)
	s.handle(mux, http.MethodGet, "/api/flashcards/stats", s.handleFlashcardsStats)
	s.handle(mux, http.MethodGet, "/api/flashcards/{id}", s.handleFlashcardGet)
	s.handle(mux, http.MethodDelete, "/api/flashcards/{id}", s.handleFlashcardDelete)
	s.handle(mux, http.MethodPost, "/api/flashcards/{id}/review", s.handleFlashcardReview)
	s.handle(mux, http.MethodPost, "/api/flashcards/decks/{id}/reset", s.handleDeckReset)

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
	if methods := s.allowedMethods(path); len(methods) > 0 {
		sort.Strings(methods)
		w.Header().Set("Allow", strings.Join(methods, ", "))
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed",
			"метод "+r.Method+" не поддерживается для "+path)
		return
	}
	writeError(w, http.StatusNotFound, "not_found", "эндпоинт не найден: "+r.URL.Path)
}

// allowedMethods возвращает методы, зарегистрированные для пути. Шаблоны вида
// /api/exercises/{id} сравниваются по сегментам, поэтому неверный метод на
// таком маршруте тоже получает 405, а не 404.
func (s *Server) allowedMethods(path string) []string {
	if methods, ok := s.routeMethods[path]; ok {
		return methods
	}
	for pattern, methods := range s.routeMethods {
		if matchesRoute(pattern, path) {
			return methods
		}
	}
	return nil
}

// matchesRoute сравнивает путь с шаблоном, где сегмент в фигурных скобках
// соответствует любому непустому значению.
func matchesRoute(pattern, path string) bool {
	patternParts := strings.Split(strings.Trim(pattern, "/"), "/")
	pathParts := strings.Split(strings.Trim(path, "/"), "/")
	if len(patternParts) != len(pathParts) {
		return false
	}
	for index, part := range patternParts {
		if strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}") {
			if pathParts[index] == "" {
				return false
			}
			continue
		}
		if part != pathParts[index] {
			return false
		}
	}
	return true
}
