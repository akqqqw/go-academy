package api

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"goacademy/internal/practice"
	"goacademy/internal/runner"
	"goacademy/internal/storage"
)

// exerciseCard — задание в списке вместе с прогрессом пользователя.
type exerciseCard struct {
	practice.Summary
	Solved     bool   `json:"solved"`
	Attempts   int    `json:"attempts"`
	BestPassed int    `json:"best_passed"`
	LastStatus string `json:"last_status,omitempty"`
	SolvedAt   string `json:"solved_at,omitempty"`
}

// exerciseDetail — полное задание для страницы решения. Тесты и эталонное
// решение сюда не попадают: иначе проверку можно обойти.
type exerciseDetail struct {
	ID          string               `json:"id"`
	Module      string               `json:"module"`
	ModuleTitle string               `json:"module_title"`
	ModuleNum   int                  `json:"module_number"`
	Title       string               `json:"title"`
	Summary     string               `json:"summary"`
	Difficulty  string               `json:"difficulty"`
	Topics      []string             `json:"topics"`
	Minutes     int                  `json:"minutes"`
	Statement   string               `json:"statement"`
	StarterCode string               `json:"starter_code"`
	Hints       []string             `json:"hints"`
	Checks      []runner.TestCase    `json:"checks"`
	Progress    storage.ExerciseStat `json:"progress"`
	Attempts    []attemptView        `json:"attempts"`
	Next        *exerciseNeighbour   `json:"next,omitempty"`
	Prev        *exerciseNeighbour   `json:"prev,omitempty"`
}

// attemptView — одна попытка без кода решения: история нужна для мотивации, а
// не для хранения дублей кода в ответе.
type attemptView struct {
	ID         int64  `json:"id"`
	Status     string `json:"status"`
	Passed     int    `json:"passed"`
	Total      int    `json:"total"`
	DurationMs int64  `json:"duration_ms"`
	CreatedAt  string `json:"created_at"`
}

type exerciseNeighbour struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// handleExercisesList отдаёт каталог заданий с фильтрами.
//
// Фильтры серверные: difficulty (easy|medium|hard), module (m04), status
// (solved|unsolved|attempted) и q (поиск по названию, описанию и темам).
func (s *Server) handleExercisesList(w http.ResponseWriter, r *http.Request) {
	exercises, stats, err := s.exercises.List()
	if err != nil {
		s.writeExerciseError(w, err)
		return
	}
	progress, err := s.exAttempts.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "progress_error", err.Error())
		return
	}
	overview, err := s.exAttempts.Overview(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "progress_error", err.Error())
		return
	}

	difficulty := strings.TrimSpace(r.URL.Query().Get("difficulty"))
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	cards := make([]exerciseCard, 0, len(exercises))
	levels := map[string]int{}
	modules := map[string]struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Num   int    `json:"number"`
		Count int    `json:"count"`
	}{}
	for _, item := range exercises {
		stat := progress[item.ID]
		card := exerciseCard{
			Summary:    item,
			Solved:     stat.Solved,
			Attempts:   stat.Attempts,
			BestPassed: stat.BestPassed,
			LastStatus: stat.LastStatus,
			SolvedAt:   stat.SolvedAt,
		}

		entry := modules[item.Module]
		entry.ID = item.Module
		entry.Title = item.ModuleTitle
		entry.Num = item.ModuleNum
		entry.Count++
		modules[item.Module] = entry
		levels[item.Difficulty]++

		if difficulty != "" && item.Difficulty != difficulty {
			continue
		}
		if module != "" && item.Module != module {
			continue
		}
		switch status {
		case "solved":
			if !stat.Solved {
				continue
			}
		case "unsolved":
			if stat.Solved {
				continue
			}
		case "attempted":
			if stat.Attempts == 0 || stat.Solved {
				continue
			}
		}
		if query != "" {
			haystack := strings.ToLower(item.Title + " " + item.Summary + " " + strings.Join(item.Topics, " ") + " " + item.ModuleTitle)
			if !strings.Contains(haystack, query) {
				continue
			}
		}
		cards = append(cards, card)
	}

	moduleList := make([]map[string]any, 0, len(modules))
	for _, entry := range modules {
		moduleList = append(moduleList, map[string]any{
			"id": entry.ID, "title": entry.Title, "number": entry.Num, "count": entry.Count,
		})
	}
	sort.Slice(moduleList, func(i, j int) bool {
		return moduleList[i]["number"].(int) < moduleList[j]["number"].(int)
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"exercises": cards,
		"stats": map[string]any{
			"total":    stats.Total,
			"minutes":  stats.Minutes,
			"by_level": stats.ByLevel,
			"levels":   levels,
			"filtered": len(cards),
		},
		"overview": overview,
		"modules":  moduleList,
	})
}

// handleExerciseGet отдаёт условие, стартовый код, подсказки и прогресс.
func (s *Server) handleExerciseGet(w http.ResponseWriter, r *http.Request) {
	exercise, ok := s.exerciseFromPath(w, r)
	if !ok {
		return
	}
	catalog, _, err := s.exercises.List()
	if err != nil {
		s.writeExerciseError(w, err)
		return
	}
	progress, err := s.exAttempts.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "progress_error", err.Error())
		return
	}
	attempts, err := s.exAttempts.Attempts(r.Context(), exercise.ID, 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "progress_error", err.Error())
		return
	}

	views := make([]attemptView, 0, len(attempts))
	for _, attempt := range attempts {
		views = append(views, attemptView{
			ID: attempt.ID, Status: attempt.Status, Passed: attempt.Passed,
			Total: attempt.Total, DurationMs: attempt.DurationMs, CreatedAt: attempt.CreatedAt,
		})
	}

	var prev, next *exerciseNeighbour
	for index, item := range catalog {
		if item.ID != exercise.ID {
			continue
		}
		if index > 0 {
			prev = &exerciseNeighbour{ID: catalog[index-1].ID, Title: catalog[index-1].Title}
		}
		if index < len(catalog)-1 {
			next = &exerciseNeighbour{ID: catalog[index+1].ID, Title: catalog[index+1].Title}
		}
		break
	}

	hints := exercise.Hints
	if hints == nil {
		hints = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"exercise": exerciseDetail{
			ID:          exercise.ID,
			Module:      exercise.Module,
			ModuleTitle: exercise.ModuleTitle,
			ModuleNum:   exercise.ModuleNum,
			Title:       exercise.Title,
			Summary:     exercise.Summary,
			Difficulty:  exercise.Difficulty,
			Topics:      exercise.Topics,
			Minutes:     exercise.Minutes,
			Statement:   exercise.Statement,
			StarterCode: exercise.StarterCode,
			Hints:       hints,
			Checks:      exercise.Checks,
			Progress:    progress[exercise.ID],
			Attempts:    views,
			Next:        next,
			Prev:        prev,
		},
	})
}

// handleExerciseSubmit запускает скрытые тесты задания на решении ученика.
func (s *Server) handleExerciseSubmit(w http.ResponseWriter, r *http.Request) {
	exercise, ok := s.exerciseFromPath(w, r)
	if !ok {
		return
	}
	var payload struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	if len(payload.Code) > maxDraftBytes {
		writeError(w, http.StatusBadRequest, "code_too_large", "код больше 256 КиБ")
		return
	}

	result, err := s.runner.Test(r.Context(), payload.Code, exercise.Tests)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "grade_failed", err.Error())
		return
	}

	stat, justSolved, err := s.exAttempts.Record(r.Context(), storage.ExerciseAttempt{
		ExerciseID: exercise.ID,
		Status:     result.Status,
		Passed:     result.Passed,
		Total:      result.Total,
		DurationMs: result.DurationMs,
		Code:       payload.Code,
	})
	if err != nil {
		s.log.Warn("не удалось записать попытку", "err", err)
	}
	// Дневная активность: решённая задача должна попасть в план на сегодня.
	if justSolved {
		if _, activityErr := s.activity.AddCounter(r.Context(), "exercises_done", 1); activityErr != nil {
			s.log.Warn("не удалось обновить активность", "err", activityErr)
		}
	}
	if recordErr := s.drafts.RecordRun(r.Context(), "exercise", exercise.ID,
		payload.Code, result.Status == runner.StatusOK, result.DurationMs); recordErr != nil {
		s.log.Warn("не удалось записать запуск", "err", recordErr)
	}

	if result.Diagnostics == nil {
		result.Diagnostics = []runner.Diagnostic{}
	}
	if result.Tests == nil {
		result.Tests = []runner.TestOutcome{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"result":   result,
		"progress": stat,
		"solved":   result.Status == runner.StatusOK && result.Total > 0 && result.Passed == result.Total,
	})
}

// handleExerciseSolution отдаёт эталонное решение: интерфейс спрашивает
// подтверждение, но не прячет ответ навсегда.
func (s *Server) handleExerciseSolution(w http.ResponseWriter, r *http.Request) {
	exercise, ok := s.exerciseFromPath(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       exercise.ID,
		"solution": exercise.Solution,
		"note":     "Сравните со своим решением: важно понять подход, а не скопировать код.",
	})
}

// exerciseFromPath читает {id} и умеет отвечать 404 в формате API.
func (s *Server) exerciseFromPath(w http.ResponseWriter, r *http.Request) (practice.Exercise, bool) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_id", "не указан идентификатор задания")
		return practice.Exercise{}, false
	}
	exercise, err := s.exercises.Get(id)
	if err != nil {
		s.writeExerciseError(w, err)
		return practice.Exercise{}, false
	}
	return exercise, true
}

// writeExerciseError переводит ошибки каталога в HTTP-ответы.
func (s *Server) writeExerciseError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, practice.ErrExerciseNotFound):
		writeError(w, http.StatusNotFound, "exercise_not_found", "задание не найдено")
	case errors.Is(err, practice.ErrCatalogInvalid):
		s.log.Error("каталог заданий повреждён", "err", err)
		writeError(w, http.StatusInternalServerError, "exercise_catalog_invalid", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "exercise_error", err.Error())
	}
}
