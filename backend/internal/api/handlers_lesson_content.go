package api

import (
	"errors"
	"net/http"

	"goacademy/internal/course"
	"goacademy/internal/storage"
)

// lessonNav — ссылка на соседний урок.
type lessonNav struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Available bool   `json:"available"`
	Status    string `json:"status"`
}

// lessonDetailMeta — шапка урока с контекстом модуля и прогрессом.
type lessonDetailMeta struct {
	ID              string   `json:"id"`
	ModuleID        string   `json:"module_id"`
	ModuleNumber    int      `json:"module_number"`
	ModuleTitle     string   `json:"module_title"`
	ModuleLevel     string   `json:"module_level"`
	Number          int      `json:"number"`
	Title           string   `json:"title"`
	Summary         string   `json:"summary"`
	Minutes         int      `json:"minutes"`
	Objectives      []string `json:"objectives"`
	Status          string   `json:"status"`
	Available       bool     `json:"available"`
	ModuleCompleted int      `json:"module_completed"`
	ModuleTotal     int      `json:"module_total"`
	Position        int      `json:"position"`
	Total           int      `json:"total"`
}

type lessonDetailResponse struct {
	Lesson   lessonDetailMeta `json:"lesson"`
	Markdown string           `json:"markdown"`
	// StarterCode — стартовый код задания для встроенного редактора.
	StarterCode string     `json:"starter_code"`
	Prev        *lessonNav `json:"prev"`
	Next        *lessonNav `json:"next"`
}

func (s *Server) handleLessonContent(w http.ResponseWriter, r *http.Request) {
	lessonID := r.PathValue("id")
	catalog, err := s.course.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	module, lesson, ok := catalog.Lesson(lessonID)
	if !ok {
		writeError(w, http.StatusNotFound, "lesson_not_found", "урок не найден в программе курса")
		return
	}

	content, err := s.course.Content(lessonID)
	if err != nil {
		switch {
		case errors.Is(err, course.ErrContentMissing):
			writeError(w, http.StatusNotFound, "content_not_ready", "материал урока ещё не опубликован")
		case errors.Is(err, course.ErrContentInvalid):
			s.log.Error("некорректный файл урока", "lesson", lessonID, "err", err)
			writeError(w, http.StatusInternalServerError, "content_invalid",
				"файл урока заполнен неверно — проверьте front matter и Markdown")
		default:
			writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		}
		return
	}

	states, err := s.lessonStates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_error", err.Error())
		return
	}

	flat := flatLessons(catalog)
	position := 0
	for index, item := range flat {
		if item.ID == lessonID {
			position = index + 1
			break
		}
	}
	moduleCompleted := 0
	for _, item := range module.Lessons {
		if states[item.ID].Status == "completed" {
			moduleCompleted++
		}
	}
	status := states[lesson.ID].Status
	if status == "" {
		status = "not_started"
	}

	response := lessonDetailResponse{
		Lesson: lessonDetailMeta{
			ID:              lesson.ID,
			ModuleID:        module.ID,
			ModuleNumber:    module.Number,
			ModuleTitle:     module.Title,
			ModuleLevel:     module.Level,
			Number:          lesson.Number,
			Title:           content.Title,
			Summary:         content.Summary,
			Minutes:         content.Minutes,
			Objectives:      content.Objectives,
			Status:          status,
			Available:       true,
			ModuleCompleted: moduleCompleted,
			ModuleTotal:     len(module.Lessons),
			Position:        position,
			Total:           len(flat),
		},
		Markdown:    content.Markdown,
		StarterCode: content.StarterCode,
		Prev:        neighbor(flat, states, lessonID, -1),
		Next:        neighbor(flat, states, lessonID, +1),
	}
	writeJSON(w, http.StatusOK, response)
}

type completionResponse struct {
	Lesson           storage.LessonProgress `json:"lesson"`
	AlreadyCompleted bool                   `json:"already_completed"`
	Today            storage.Day            `json:"today"`
}

// handleLessonComplete отмечает урок пройденным и обновляет дневную активность.
func (s *Server) handleLessonComplete(w http.ResponseWriter, r *http.Request) {
	lessonID := r.PathValue("id")
	catalog, err := s.course.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	module, lesson, ok := catalog.Lesson(lessonID)
	if !ok {
		writeError(w, http.StatusNotFound, "lesson_not_found", "урок не найден в программе курса")
		return
	}
	if !lesson.Available {
		writeError(w, http.StatusConflict, "content_not_ready",
			"нельзя отметить пройденным урок без материала")
		return
	}

	before, err := s.lessons.Get(r.Context(), lessonID)
	already := err == nil && before.Status == "completed"
	if err != nil && !errors.Is(err, storage.ErrLessonNotFound) {
		writeError(w, http.StatusInternalServerError, "lesson_error", err.Error())
		return
	}

	record, err := s.lessons.Complete(r.Context(), module.ID, lesson.ID, lesson.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "lesson_error", err.Error())
		return
	}

	today, counterErr := s.activity.Today(r.Context())
	if !already {
		today, counterErr = s.activity.AddCounter(r.Context(), "lessons_done", 1)
	}
	if counterErr != nil {
		s.log.Warn("не удалось учесть завершение урока", "err", counterErr)
	}

	writeJSON(w, http.StatusOK, completionResponse{
		Lesson:           record,
		AlreadyCompleted: already,
		Today:            today,
	})
}

// flatLessons возвращает уроки в порядке прохождения курса.
func flatLessons(catalog *course.Catalog) []course.Lesson {
	var flat []course.Lesson
	for _, module := range catalog.Modules {
		flat = append(flat, module.Lessons...)
	}
	return flat
}

// neighbor ищет предыдущий или следующий урок относительно текущего.
func neighbor(lessons []course.Lesson, states map[string]lessonState, current string, direction int) *lessonNav {
	index := -1
	for i, lesson := range lessons {
		if lesson.ID == current {
			index = i
			break
		}
	}
	if index < 0 {
		return nil
	}
	target := index + direction
	if target < 0 || target >= len(lessons) {
		return nil
	}
	lesson := lessons[target]
	status := states[lesson.ID].Status
	if status == "" {
		status = "not_started"
	}
	return &lessonNav{
		ID:        lesson.ID,
		Title:     lesson.Title,
		Available: lesson.Available,
		Status:    status,
	}
}
