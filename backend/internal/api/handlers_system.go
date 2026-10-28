package api

import (
	"net/http"
	"os"
	"runtime"
	"time"

	"goacademy/internal/config"
	"goacademy/internal/course"
)

// Stage описывает текущий этап разработки приложения. Значение выводится в
// разделе «Настройки», чтобы было понятно, какие разделы уже работают.
const Stage = 8

// StageLabel — человекочитаемое название этапа.
const StageLabel = "Этап 8 — достижения, цели и расширенная статистика"

type appInfo struct {
	Name       string `json:"name"`
	Version    string `json:"version"`
	Stage      int    `json:"stage"`
	StageLabel string `json:"stage_label"`
}

type runtimeInfo struct {
	Go            string `json:"go"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	StartedAt     string `json:"started_at"`
	UptimeSeconds int64  `json:"uptime_seconds"`
}

type storageInfo struct {
	DataDir       string `json:"data_dir"`
	DBPath        string `json:"db_path"`
	Driver        string `json:"driver"`
	Remote        bool   `json:"remote"`
	DBSizeBytes   int64  `json:"db_size_bytes"`
	SchemaVersion int    `json:"schema_version"`
	Backups       int    `json:"backups"`
}

type contentInfo struct {
	Title         string `json:"title"`
	Modules       int    `json:"modules"`
	Lessons       int    `json:"lessons"`
	ReadyLessons  int    `json:"ready_lessons"`
	Exercises     int    `json:"exercises"`
	Flashcards    int    `json:"flashcards"`
	Decks         int    `json:"decks"`
	Quizzes       int    `json:"quizzes"`
	Questions     int    `json:"questions"`
	ContentDir    string `json:"content_dir"`
	FrontendReady bool   `json:"frontend_ready"`
}

type serverInfo struct {
	Addr        string   `json:"addr"`
	CORSOrigins []string `json:"cors_origins"`
}

type metaResponse struct {
	App     appInfo     `json:"app"`
	Runtime runtimeInfo `json:"runtime"`
	Storage storageInfo `json:"storage"`
	Content contentInfo `json:"content"`
	Server  serverInfo  `json:"server"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	status := "ok"
	code := http.StatusOK
	if err := s.db.PingContext(r.Context()); err != nil {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}
	writeJSON(w, code, map[string]any{
		"status":  status,
		"version": config.Version,
		"time":    time.Now().Format(time.RFC3339),
	})
}

func (s *Server) handleMeta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	schemaVersion, err := s.db.SchemaVersion(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "не удалось прочитать версию схемы")
		return
	}
	catalog, err := s.course.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	extras := s.course.Extras()
	backups, _ := s.backups.List()

	response := metaResponse{
		App: appInfo{
			Name:       "Go Academy",
			Version:    config.Version,
			Stage:      Stage,
			StageLabel: StageLabel,
		},
		Runtime: runtimeInfo{
			Go:            runtime.Version(),
			OS:            runtime.GOOS,
			Arch:          runtime.GOARCH,
			StartedAt:     s.started.Format(time.RFC3339),
			UptimeSeconds: int64(time.Since(s.started).Seconds()),
		},
		Storage: storageInfo{
			DataDir:       s.cfg.DataDir,
			DBPath:        s.db.Path,
			Driver:        s.db.Driver(),
			Remote:        s.db.IsPostgres(),
			DBSizeBytes:   s.db.Size(),
			SchemaVersion: schemaVersion,
			Backups:       len(backups),
		},
		Content: contentInfo{
			Title:         catalog.Title,
			Modules:       len(catalog.Modules),
			Lessons:       catalog.LessonCount,
			ReadyLessons:  catalog.ReadyCount,
			Exercises:     extras.Exercises,
			Flashcards:    extras.Flashcards,
			Decks:         extras.Decks,
			Quizzes:       extras.Quizzes,
			Questions:     extras.Questions,
			ContentDir:    s.cfg.ContentDir,
			FrontendReady: s.FrontendReady(),
		},
		Server: serverInfo{Addr: s.cfg.Addr, CORSOrigins: s.cfg.AllowedOrigins},
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleCourse(w http.ResponseWriter, r *http.Request) {
	catalog, err := s.course.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	extras := s.course.Extras()
	completed, err := s.moduleProgressMap(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_error", err.Error())
		return
	}
	states, err := s.lessonStates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_error", err.Error())
		return
	}
	// Копируем модули и уроки, чтобы заполнить прогресс и статусы, не меняя кэш.
	modules := make([]course.Module, len(catalog.Modules))
	copy(modules, catalog.Modules)
	for i := range modules {
		modules[i].Progress = percentOf(completed[modules[i].ID], len(modules[i].Lessons))
		lessons := make([]course.Lesson, len(modules[i].Lessons))
		copy(lessons, modules[i].Lessons)
		for j := range lessons {
			status := states[lessons[j].ID].Status
			if status == "" {
				status = "not_started"
			}
			lessons[j].Status = status
		}
		modules[i].Lessons = lessons
	}
	view := *catalog
	view.Modules = modules

	writeJSON(w, http.StatusOK, map[string]any{
		"course":       view,
		"extras":       extras,
		"first_lesson": firstLessonRoute(catalog),
	})
}

func (s *Server) handleReloadContent(w http.ResponseWriter, r *http.Request) {
	catalog, err := s.course.Reload()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	// Задания ссылаются на модули курса, поэтому перечитываются после него.
	exercises, err := s.exercises.Reload()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "exercise_catalog_invalid", err.Error())
		return
	}
	// Колоды карточек тоже живут в content/: после перечитывания прогресс
	// существующих карточек сохраняется, новые добавляются.
	if err := s.cardDecks.Reload(); err != nil {
		writeError(w, http.StatusInternalServerError, "deck_catalog_invalid", err.Error())
		return
	}
	synced, err := s.flashcards.Sync(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "flashcards_sync_failed", err.Error())
		return
	}
	if err := s.quizStore.Reload(); err != nil {
		writeError(w, http.StatusInternalServerError, "quiz_catalog_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "reloaded",
		"modules":    len(catalog.Modules),
		"lessons":    catalog.LessonCount,
		"ready":      catalog.ReadyCount,
		"exercises":  len(exercises.Exercises),
		"decks":      len(s.cardDecks.Decks()),
		"flashcards": synced,
		"quizzes":    len(s.quizStore.All()),
		"questions":  s.quizStore.TotalQuestions(),
	})
}

func (s *Server) handleBackupsList(w http.ResponseWriter, r *http.Request) {
	backups, err := s.backups.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": backups, "count": len(backups)})
}

func (s *Server) handleBackupDownload(w http.ResponseWriter, r *http.Request) {
	if s.db.IsPostgres() {
		writeError(w, http.StatusNotImplemented, "backup_unsupported",
			"в Supabase резервные копии делаются автоматически в панели проекта")
		return
	}
	backup, err := s.backups.CreateBackup(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup_error", err.Error())
		return
	}
	file, err := os.Open(backup.Path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup_error", err.Error())
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+backup.Name+`"`)
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, backup.Name, time.Now(), file)
}

type lessonRef struct {
	ID        string `json:"id"`
	ModuleID  string `json:"module_id"`
	Title     string `json:"title"`
	Available bool   `json:"available"`
}
