package api

import (
	"net/http"

	"goacademy/internal/storage"
)

// handleAchievements отдаёт каталог достижений с прогрессом.
func (s *Server) handleAchievements(w http.ResponseWriter, r *http.Request) {
	extras, err := s.achievementExtras(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "achievements_read_failed", err.Error())
		return
	}
	list, stats, err := s.achievements.List(r.Context(), extras)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "achievements_read_failed", err.Error())
		return
	}
	if list == nil {
		list = []storage.Achievement{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"achievements": list,
		"stats":        stats,
	})
}

// achievementExtras добавляет метрики, которые считаются вне storage.
func (s *Server) achievementExtras(r *http.Request) (map[string]int, error) {
	extras := map[string]int{}
	catalog, err := s.course.Load()
	if err != nil {
		return extras, err
	}
	states, err := s.lessonStates(r.Context())
	if err != nil {
		return extras, err
	}
	modulesDone := 0
	for _, module := range catalog.Modules {
		available, completed := 0, 0
		for _, lesson := range module.Lessons {
			if !lesson.Available {
				continue
			}
			available++
			if states[lesson.ID].Status == "completed" {
				completed++
			}
		}
		if available > 0 && completed == available {
			modulesDone++
		}
	}
	extras[storage.MetricModules] = modulesDone
	return extras, nil
}
