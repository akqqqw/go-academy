package api

import (
	"errors"
	"net/http"

	"goacademy/internal/storage"
)

// handleLessonOpened фиксирует открытие урока и учитывает его в дневной активности.
func (s *Server) handleLessonOpened(w http.ResponseWriter, r *http.Request) {
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

	record, err := s.lessons.Open(r.Context(), module.ID, lesson.ID, lesson.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "lesson_error", err.Error())
		return
	}

	day, err := s.activity.AddCounter(r.Context(), "lessons_opened", 1)
	if err != nil {
		// Прогресс урока уже сохранён; ошибка счётчика не должна ломать ответ.
		s.log.Warn("не удалось учесть открытие урока", "err", err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"lesson": record,
		"today":  day,
	})
}

// handleLessonGet возвращает сохранённый прогресс урока.
func (s *Server) handleLessonGet(w http.ResponseWriter, r *http.Request) {
	lessonID := r.PathValue("id")
	record, err := s.lessons.Get(r.Context(), lessonID)
	if err != nil {
		if errors.Is(err, storage.ErrLessonNotFound) {
			writeJSON(w, http.StatusOK, map[string]any{
				"lesson": map[string]any{
					"id":     lessonID,
					"status": "not_started",
				},
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "lesson_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"lesson": record})
}
