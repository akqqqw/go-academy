package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"goacademy/internal/quizzes"
	"goacademy/internal/storage"
)

// quizOption — вариант ответа для клиента (без правильного ответа).
type quizOption struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// quizQuestionView — вопрос без ответа и объяснения: их выдаёт только submit.
type quizQuestionView struct {
	ID      string       `json:"id"`
	Type    string       `json:"type"`
	Prompt  string       `json:"prompt"`
	Code    string       `json:"code,omitempty"`
	Options []quizOption `json:"options,omitempty"`
}

// quizView — викторина в списке.
type quizView struct {
	ID            string               `json:"id"`
	Title         string               `json:"title"`
	Description   string               `json:"description"`
	Module        int                  `json:"module"`
	ModuleTitle   string               `json:"module_title"`
	Level         string               `json:"level"`
	Questions     int                  `json:"questions"`
	PassThreshold int                  `json:"pass_threshold"`
	Progress      storage.QuizProgress `json:"progress"`
}

// quizAnswerRequest — ответы пользователя, отправленные на проверку.
type quizAnswerRequest struct {
	Answers    map[string][]string `json:"answers"`
	DurationMS int64               `json:"duration_ms"`
}

// quizQuestionResult — результат по одному вопросу.
type quizQuestionResult struct {
	ID          string   `json:"id"`
	Prompt      string   `json:"prompt"`
	Type        string   `json:"type"`
	Correct     bool     `json:"correct"`
	Given       []string `json:"given"`
	Expected    []string `json:"expected"`
	Explanation string   `json:"explanation"`
}

func (s *Server) quizViews(ctx context.Context) ([]quizView, storage.QuizStats, error) {
	progress, stats, err := s.quizAttempts.Progress(ctx)
	if err != nil {
		return nil, storage.QuizStats{}, err
	}
	all := s.quizStore.All()
	views := make([]quizView, 0, len(all))
	for _, quiz := range all {
		views = append(views, quizView{
			ID:            quiz.ID,
			Title:         quiz.Title,
			Description:   quiz.Description,
			Module:        quiz.Module,
			ModuleTitle:   s.moduleTitle(quiz.Module),
			Level:         quiz.Level,
			Questions:     len(quiz.Questions),
			PassThreshold: storage.PassThreshold,
			Progress:      progress[quiz.ID],
		})
	}
	return views, stats, nil
}

// moduleTitle возвращает название модуля курса по номеру (0 — итоговый тест).
func (s *Server) moduleTitle(module int) string {
	if module <= 0 {
		return "Итоговый тест"
	}
	if catalog, err := s.course.Load(); err == nil {
		for _, item := range catalog.Modules {
			if item.Number == module {
				return item.Title
			}
		}
	}
	return ""
}

// handleQuizzesList отдаёт викторины с прогрессом и общую сводку.
func (s *Server) handleQuizzesList(w http.ResponseWriter, r *http.Request) {
	views, stats, err := s.quizViews(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quizzes_read_failed", err.Error())
		return
	}
	history, err := s.quizAttempts.History(r.Context(), 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quizzes_read_failed", err.Error())
		return
	}
	if history == nil {
		history = []storage.QuizAttempt{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"quizzes": views,
		"stats":   stats,
		"history": history,
		"source":  "content/quizzes/quizzes.json",
	})
}

// handleQuizGet отдаёт викторину для прохождения: без ответов и объяснений.
func (s *Server) handleQuizGet(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	quiz, ok := s.quizStore.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "quiz_not_found", "викторина не найдена")
		return
	}
	questions := make([]quizQuestionView, 0, len(quiz.Questions))
	for _, question := range quiz.Questions {
		options := make([]quizOption, 0, len(question.Options))
		for _, option := range question.Options {
			options = append(options, quizOption{ID: option.ID, Text: option.Text})
		}
		questions = append(questions, quizQuestionView{
			ID:      question.ID,
			Type:    question.Type,
			Prompt:  question.Prompt,
			Code:    question.Code,
			Options: options,
		})
	}
	attempts, err := s.quizAttempts.Attempts(r.Context(), quiz.ID, 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quizzes_read_failed", err.Error())
		return
	}
	if attempts == nil {
		attempts = []storage.QuizAttempt{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"quiz": map[string]any{
			"id":             quiz.ID,
			"title":          quiz.Title,
			"description":    quiz.Description,
			"module":         quiz.Module,
			"module_title":   s.moduleTitle(quiz.Module),
			"level":          quiz.Level,
			"questions":      questions,
			"pass_threshold": storage.PassThreshold,
		},
		"attempts": attempts,
	})
}

// handleQuizSubmit проверяет ответы, сохраняет попытку и возвращает разбор.
func (s *Server) handleQuizSubmit(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	quiz, ok := s.quizStore.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "quiz_not_found", "викторина не найдена")
		return
	}
	var payload quizAnswerRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	if len(payload.Answers) == 0 {
		writeError(w, http.StatusBadRequest, "answers_required", "нет ни одного ответа")
		return
	}

	results := make([]quizQuestionResult, 0, len(quiz.Questions))
	score := 0
	saved := make(map[string][]string, len(payload.Answers))
	for _, question := range quiz.Questions {
		given := payload.Answers[question.ID]
		correct := quizzes.Check(question, given)
		if correct {
			score++
		}
		if len(given) > 0 {
			saved[question.ID] = given
		}
		expected := question.Correct
		if question.Type == quizzes.TypeInput {
			expected = question.Accepted
		}
		results = append(results, quizQuestionResult{
			ID:          question.ID,
			Prompt:      question.Prompt,
			Type:        question.Type,
			Correct:     correct,
			Given:       nonNil(given),
			Expected:    nonNil(expected),
			Explanation: question.Explanation,
		})
	}

	moduleID := ""
	if quiz.Module > 0 {
		moduleID = fmt.Sprintf("m%02d", quiz.Module)
	}
	attempt, err := s.quizAttempts.SaveAttempt(r.Context(), quiz.ID, moduleID, score,
		len(quiz.Questions), payload.DurationMS, saved)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quiz_save_failed", err.Error())
		return
	}
	_, stats, err := s.quizAttempts.Progress(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quizzes_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"attempt":   attempt,
		"questions": results,
		"score":     score,
		"total":     len(quiz.Questions),
		"percent":   attempt.Percent,
		"passed":    attempt.Passed,
		"stats":     stats,
	})
}

// handleQuizHistory отдаёт историю попыток конкретной викторины.
func (s *Server) handleQuizHistory(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if _, ok := s.quizStore.Get(id); !ok {
		writeError(w, http.StatusNotFound, "quiz_not_found", "викторина не найдена")
		return
	}
	limit, err := queryInt(r, "limit", 20, 1, 100)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	attempts, err := s.quizAttempts.Attempts(r.Context(), id, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quizzes_read_failed", err.Error())
		return
	}
	if attempts == nil {
		attempts = []storage.QuizAttempt{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"attempts": attempts})
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
