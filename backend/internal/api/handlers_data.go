package api

import (
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"goacademy/internal/course"
	"goacademy/internal/progress"
	"goacademy/internal/storage"
)

func (s *Server) handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	values, err := s.settings.All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"settings":    values,
		"definitions": settingsDefinitions(),
	})
}

// settingDefinition — описание настройки для автоматической отрисовки формы.
type settingDefinition struct {
	Key     string   `json:"key"`
	Kind    string   `json:"kind"`
	Enum    []string `json:"enum,omitempty"`
	Min     int      `json:"min,omitempty"`
	Max     int      `json:"max,omitempty"`
	Group   string   `json:"group"`
	Label   string   `json:"label"`
	Default any      `json:"default"`
}

func settingsDefinitions() []settingDefinition {
	out := make([]settingDefinition, 0, len(storage.Definitions))
	for _, def := range storage.Definitions {
		if def.Group == "system" {
			continue
		}
		out = append(out, settingDefinition{
			Key:     def.Key,
			Kind:    string(def.Kind),
			Enum:    def.Enum,
			Min:     def.Min,
			Max:     def.Max,
			Group:   def.Group,
			Label:   def.Label,
			Default: def.Default,
		})
	}
	return out
}

func (s *Server) handleSettingsPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := decodeJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	values, err := s.settings.Patch(r.Context(), body)
	if err != nil {
		var validation *storage.SettingsValidationError
		if errors.As(err, &validation) {
			writeErrorDetails(w, http.StatusUnprocessableEntity, "validation_error",
				"некорректные значения настроек", validation.Issues)
			return
		}
		writeError(w, http.StatusInternalServerError, "settings_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": values})
}

func (s *Server) courseTotals() (progress.Totals, *course.Catalog, course.Extras, error) {
	catalog, err := s.course.Load()
	if err != nil {
		return progress.Totals{}, nil, course.Extras{}, err
	}
	extras := s.course.Extras()
	return progress.Totals{
		Lessons:    catalog.LessonCount,
		Exercises:  extras.Exercises,
		Flashcards: extras.Flashcards,
		Quizzes:    extras.Quizzes,
	}, catalog, extras, nil
}

func (s *Server) handleProgress(w http.ResponseWriter, r *http.Request) {
	totals, _, _, err := s.courseTotals()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	snapshot, err := s.stats.Snapshot(r.Context(), totals)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"snapshot": snapshot, "totals": totals})
}

// activityResponse — календарь активности и производные показатели.
type activityResponse struct {
	Days         []storage.Day   `json:"days"`
	TotalSeconds int             `json:"total_seconds"`
	Streak       progress.Streak `json:"streak"`
	Today        storage.Day     `json:"today"`
	Range        int             `json:"range_days"`
}

func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request) {
	days, err := queryInt(r, "days", 182, 7, 366)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	list, err := s.activity.Range(r.Context(), days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity_error", err.Error())
		return
	}
	total, err := s.activity.TotalStudySeconds(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity_error", err.Error())
		return
	}
	activeDays, err := s.activity.ActiveDays(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity_error", err.Error())
		return
	}
	current, longest, todayActive := progress.CalcStreak(activeDays, time.Now())

	response := activityResponse{
		Days:         list,
		TotalSeconds: total,
		Streak:       progress.Streak{Current: current, Longest: longest, TodayActive: todayActive},
		Range:        days,
	}
	if len(list) > 0 {
		response.Today = list[len(list)-1]
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleStudyPing(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Seconds int    `json:"seconds"`
		Source  string `json:"source"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	if body.Seconds < 1 || body.Seconds > storage.MaxStudySecondsPerPing {
		writeError(w, http.StatusUnprocessableEntity, "validation_error",
			"seconds должен быть в диапазоне 1–900")
		return
	}
	if body.Source != "" && body.Source != "heartbeat" && body.Source != "visible" && body.Source != "editor" {
		writeError(w, http.StatusUnprocessableEntity, "validation_error", "неизвестный источник активности")
		return
	}
	day, err := s.activity.AddStudy(r.Context(), body.Seconds)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity_error", err.Error())
		return
	}
	total, err := s.activity.TotalStudySeconds(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"today":         day,
		"total_seconds": total,
	})
}

func (s *Server) handleRecent(w http.ResponseWriter, r *http.Request) {
	limit, err := queryInt(r, "limit", 8, 1, 50)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	items, err := s.history.Recent(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "history_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "count": len(items)})
}

// searchResult — результат глобального поиска.
type searchResult struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Title     string `json:"title"`
	Subtitle  string `json:"subtitle"`
	Route     string `json:"route"`
	Available bool   `json:"available"`
	Score     int    `json:"score"`
}

// sections — навигационные разделы, участвующие в поиске.
var sections = []searchResult{
	{Type: "section", ID: "dashboard", Title: "Главная", Subtitle: "Сводка обучения", Route: "/", Available: true},
	{Type: "section", ID: "learning", Title: "Обучение", Subtitle: "Программа курса", Route: "/learning", Available: true},
	{Type: "section", ID: "practice", Title: "Практика", Subtitle: "Задачи и проверка кода", Route: "/practice", Available: true},
	{Type: "section", ID: "editor", Title: "Редактор", Subtitle: "Свободный запуск Go-кода", Route: "/editor", Available: true},
	{Type: "section", ID: "notes", Title: "Заметки", Subtitle: "Личные записи", Route: "/notes", Available: true},
	{Type: "section", ID: "flashcards", Title: "Карточки", Subtitle: "Интервальное повторение", Route: "/flashcards", Available: true},
	{Type: "section", ID: "quizzes", Title: "Тесты", Subtitle: "Викторины по модулям", Route: "/quizzes", Available: true},
	{Type: "section", ID: "progress", Title: "Прогресс", Subtitle: "Статистика и достижения", Route: "/progress", Available: true},
	{Type: "section", ID: "settings", Title: "Настройки", Subtitle: "Тема, цели, данные", Route: "/settings", Available: true},
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 100 {
		query = query[:100]
	}
	results := make([]searchResult, 0, 24)
	if query != "" {
		catalog, err := s.course.Load()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "content_error", err.Error())
			return
		}
		lowered := strings.ToLower(query)
		for _, section := range sections {
			if strings.Contains(strings.ToLower(section.Title+" "+section.Subtitle), lowered) {
				results = append(results, searchResult{
					Type:      section.Type,
					ID:        section.ID,
					Title:     section.Title,
					Subtitle:  section.Subtitle,
					Route:     section.Route,
					Available: section.Available,
					Score:     5,
				})
			}
		}
		for _, match := range course.SearchCatalog(catalog, query) {
			results = append(results, searchResult{
				Type:      match.Type,
				ID:        match.ID,
				Title:     match.Title,
				Subtitle:  match.Subtitle,
				Route:     match.Route,
				Available: match.Available,
				Score:     match.Score,
			})
		}
		sort.SliceStable(results, func(i, j int) bool { return results[i].Score > results[j].Score })
		if len(results) > 30 {
			results = results[:30]
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"query":   query,
		"results": results,
		"count":   len(results),
	})
}

// firstLessonRoute возвращает ссылку на первый доступный урок программы.
func firstLessonRoute(catalog *course.Catalog) *lessonRef {
	module, lesson, ok := catalog.FirstLesson()
	if !ok {
		return nil
	}
	_ = module
	return &lessonRef{
		ID:        lesson.ID,
		ModuleID:  lesson.ModuleID,
		Title:     lesson.Title,
		Available: lesson.Available,
	}
}
