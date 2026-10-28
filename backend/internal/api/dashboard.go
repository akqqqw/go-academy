package api

import (
	"context"
	"net/http"

	"goacademy/internal/course"
	"goacademy/internal/progress"
	"goacademy/internal/storage"
)

// moduleStat — прогресс по одному модулю курса.
type moduleStat struct {
	Completed int `json:"completed"`
	Total     int `json:"total"`
	Percent   int `json:"percent"`
}

// continueCard — блок «Продолжить обучение» на главной странице.
type continueCard struct {
	LessonID     string     `json:"lesson_id"`
	LessonNumber int        `json:"lesson_number"`
	LessonTitle  string     `json:"lesson_title"`
	LessonStatus string     `json:"lesson_status"`
	Minutes      int        `json:"minutes"`
	ModuleID     string     `json:"module_id"`
	ModuleNumber int        `json:"module_number"`
	ModuleTitle  string     `json:"module_title"`
	ModuleStat   moduleStat `json:"module_stat"`
	Route        string     `json:"route"`
}

type courseSummary struct {
	Title        string `json:"title"`
	Subtitle     string `json:"subtitle"`
	Modules      int    `json:"modules"`
	Lessons      int    `json:"lessons"`
	ReadyLessons int    `json:"ready_lessons"`
	Percent      int    `json:"percent"`
}

type dashboardResponse struct {
	Snapshot     progress.Snapshot     `json:"snapshot"`
	Recent       []storage.RecentItem  `json:"recent"`
	Continue     *continueCard         `json:"continue_lesson"`
	Course       courseSummary         `json:"course"`
	Totals       progress.Totals       `json:"totals"`
	Achievements []storage.Achievement `json:"achievements"`
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	totals, catalog, _, err := s.courseTotals()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "content_error", err.Error())
		return
	}
	snapshot, err := s.stats.Snapshot(ctx, totals)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_error", err.Error())
		return
	}
	recent, err := s.history.Recent(ctx, 6)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "history_error", err.Error())
		return
	}
	states, err := s.lessonStates(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_error", err.Error())
		return
	}

	response := dashboardResponse{
		Snapshot: snapshot,
		Recent:   recent,
		Continue: buildContinueCard(catalog, states),
		Course: courseSummary{
			Title:        catalog.Title,
			Subtitle:     catalog.Subtitle,
			Modules:      len(catalog.Modules),
			Lessons:      catalog.LessonCount,
			ReadyLessons: catalog.ReadyCount,
			Percent:      snapshot.CourseDone,
		},
		Totals: totals,
	}
	// Последние открытые достижения — для блока на главной странице.
	if extras, err := s.achievementExtras(r); err == nil {
		if _, stats, err := s.achievements.List(ctx, extras); err == nil {
			response.Snapshot.Insights.Achievements = progress.AchieveIn{
				Unlocked: stats.Unlocked,
				Total:    stats.Total,
			}
		}
	}
	if recentAchievements, err := s.achievements.Recent(ctx, 4); err == nil {
		response.Achievements = recentAchievements
	} else {
		response.Achievements = []storage.Achievement{}
	}
	writeJSON(w, http.StatusOK, response)
}

// lessonState — сохранённое состояние урока в базе.
type lessonState struct {
	Status       string
	LastOpenedAt string
}

func (s *Server) lessonStates(ctx context.Context) (map[string]lessonState, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, status, COALESCE(last_opened_at, '') FROM lessons")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	states := map[string]lessonState{}
	for rows.Next() {
		var id string
		var state lessonState
		if err := rows.Scan(&id, &state.Status, &state.LastOpenedAt); err != nil {
			return nil, err
		}
		states[id] = state
	}
	return states, rows.Err()
}

// moduleProgressMap считает завершённые уроки по модулям.
func (s *Server) moduleProgressMap(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT module_id, COUNT(*) FROM lessons
		WHERE status = 'completed'
		GROUP BY module_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]int{}
	for rows.Next() {
		var moduleID string
		var count int
		if err := rows.Scan(&moduleID, &count); err != nil {
			return nil, err
		}
		out[moduleID] = count
	}
	return out, rows.Err()
}

func buildContinueCard(catalog *course.Catalog, states map[string]lessonState) *continueCard {
	if catalog == nil {
		return nil
	}

	// 1. Незавершённый урок, открытый последним.
	var candidate *course.Lesson
	latest := ""
	for _, module := range catalog.Modules {
		for i := range module.Lessons {
			lesson := module.Lessons[i]
			state, ok := states[lesson.ID]
			if !ok || state.Status != "in_progress" {
				continue
			}
			if latest == "" || state.LastOpenedAt > latest {
				latest = state.LastOpenedAt
				copied := lesson
				candidate = &copied
			}
		}
	}

	// 2. Иначе — первый доступный незавершённый урок.
	if candidate == nil {
		for _, module := range catalog.Modules {
			for i := range module.Lessons {
				lesson := module.Lessons[i]
				state := states[lesson.ID]
				if state.Status == "completed" {
					continue
				}
				if !lesson.Available {
					continue
				}
				copied := lesson
				candidate = &copied
				break
			}
			if candidate != nil {
				break
			}
		}
	}

	// 3. Иначе — первый урок программы (например, курс полностью пройден).
	if candidate == nil {
		if _, lesson, ok := catalog.FirstLesson(); ok {
			copied := lesson
			candidate = &copied
		}
	}
	if candidate == nil {
		return nil
	}

	module, ok := catalog.Module(candidate.ModuleID)
	if !ok {
		return nil
	}
	total := len(module.Lessons)
	completed := 0
	for _, lesson := range module.Lessons {
		if states[lesson.ID].Status == "completed" {
			completed++
		}
	}
	status := states[candidate.ID].Status
	if status == "" {
		status = "not_started"
	}

	return &continueCard{
		LessonID:     candidate.ID,
		LessonNumber: candidate.Number,
		LessonTitle:  candidate.Title,
		LessonStatus: status,
		Minutes:      candidate.Minutes,
		ModuleID:     module.ID,
		ModuleNumber: module.Number,
		ModuleTitle:  module.Title,
		ModuleStat: moduleStat{
			Completed: completed,
			Total:     total,
			Percent:   percentOf(completed, total),
		},
		Route: "/learning/" + candidate.ID,
	}
}

func percentOf(part, total int) int {
	if total <= 0 {
		return 0
	}
	value := part * 100 / total
	if value > 100 {
		return 100
	}
	return value
}
