package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"goacademy/internal/database"
)

// PassThreshold — доля правильных ответов, с которой попытка считается сданной.
const PassThreshold = 70

// QuizAttempt — сохранённая попытка прохождения викторины.
type QuizAttempt struct {
	ID         int64  `json:"id"`
	QuizID     string `json:"quiz_id"`
	ModuleID   string `json:"module_id,omitempty"`
	Score      int    `json:"score"`
	Total      int    `json:"total"`
	DurationMS int64  `json:"duration_ms"`
	CreatedAt  string `json:"created_at"`
	Percent    int    `json:"percent"`
	Passed     bool   `json:"passed"`
}

// QuizProgress — сводка по одной викторине.
type QuizProgress struct {
	Attempts   int    `json:"attempts"`
	BestScore  int    `json:"best_score"`
	BestTotal  int    `json:"best_total"`
	BestPct    int    `json:"best_percent"`
	LastScore  int    `json:"last_score"`
	LastTotal  int    `json:"last_total"`
	LastAt     string `json:"last_at,omitempty"`
	Passed     bool   `json:"passed"`
	SolvedOnce bool   `json:"solved_once"`
}

// QuizStats — общая сводка по викторинам.
type QuizStats struct {
	Attempts int `json:"attempts"`
	Passed   int `json:"passed"`
	Average  int `json:"average"`
	Best     int `json:"best"`
}

// Quizzes — сервис сохранения попыток викторин.
type Quizzes struct {
	db *database.DB
}

// NewQuizzes создаёт сервис викторин.
func NewQuizzes(db *database.DB) *Quizzes {
	return &Quizzes{db: db}
}

// SaveAttempt записывает попытку и возвращает её в готовом виде.
func (q *Quizzes) SaveAttempt(ctx context.Context, quizID, moduleID string, score, total int, durationMS int64, answers map[string][]string) (QuizAttempt, error) {
	if strings.TrimSpace(quizID) == "" {
		return QuizAttempt{}, errors.New("не указана викторина")
	}
	if score < 0 || total < 0 || score > total {
		return QuizAttempt{}, fmt.Errorf("некорректный результат %d из %d", score, total)
	}
	if durationMS < 0 {
		durationMS = 0
	}
	rawAnswers, err := json.Marshal(answers)
	if err != nil {
		return QuizAttempt{}, err
	}

	result, err := q.db.ExecContext(ctx, `
		INSERT INTO quiz_attempts (quiz_id, module_id, score, total, duration_ms, created_at, answers)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		quizID, moduleID, score, total, durationMS, database.Now(), string(rawAnswers))
	if err != nil {
		return QuizAttempt{}, fmt.Errorf("сохранить попытку: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return QuizAttempt{}, err
	}
	return q.attemptByID(ctx, id)
}

func (q *Quizzes) attemptByID(ctx context.Context, id int64) (QuizAttempt, error) {
	row := q.db.QueryRowContext(ctx, `
		SELECT id, quiz_id, module_id, score, total, duration_ms, created_at
		FROM quiz_attempts WHERE id = ?`, id)
	return scanAttempt(row)
}

// Attempts возвращает историю попыток викторины (свежие первыми).
func (q *Quizzes) Attempts(ctx context.Context, quizID string, limit int) ([]QuizAttempt, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := q.db.QueryContext(ctx, `
		SELECT id, quiz_id, module_id, score, total, duration_ms, created_at
		FROM quiz_attempts WHERE quiz_id = ?
		ORDER BY created_at DESC, id DESC LIMIT ?`, quizID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]QuizAttempt, 0, limit)
	for rows.Next() {
		attempt, err := scanAttempt(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, attempt)
	}
	return out, rows.Err()
}

// Progress собирает сводку по всем викторинам сразу.
func (q *Quizzes) Progress(ctx context.Context) (map[string]QuizProgress, QuizStats, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT quiz_id, score, total, created_at
		FROM quiz_attempts ORDER BY created_at ASC, id ASC`)
	if err != nil {
		return nil, QuizStats{}, fmt.Errorf("прочитать попытки: %w", err)
	}
	defer rows.Close()

	progress := make(map[string]QuizProgress, 8)
	stats := QuizStats{}
	var sumPercent, count int
	for rows.Next() {
		var quizID, createdAt string
		var score, total int
		if err := rows.Scan(&quizID, &score, &total, &createdAt); err != nil {
			return nil, QuizStats{}, err
		}
		percent := percentOf(score, total)
		entry := progress[quizID]
		entry.Attempts++
		if percent > entry.BestPct {
			entry.BestPct = percent
			entry.BestScore = score
			entry.BestTotal = total
		}
		entry.LastScore = score
		entry.LastTotal = total
		entry.LastAt = createdAt
		entry.Passed = percent >= PassThreshold
		if entry.Passed {
			entry.SolvedOnce = true
		}
		progress[quizID] = entry

		stats.Attempts++
		if percent >= PassThreshold {
			stats.Passed++
		}
		if percent > stats.Best {
			stats.Best = percent
		}
		sumPercent += percent
		count++
	}
	if err := rows.Err(); err != nil {
		return nil, QuizStats{}, err
	}
	if count > 0 {
		stats.Average = int(math.Round(float64(sumPercent) / float64(count)))
	}
	// Passed в общей сводке — число разных сданных викторин, а не попыток.
	passed := 0
	for _, entry := range progress {
		if entry.SolvedOnce {
			passed++
		}
	}
	stats.Passed = passed
	return progress, stats, nil
}

// History отдаёт последние попытки по всем викторинам.
func (q *Quizzes) History(ctx context.Context, limit int) ([]QuizAttempt, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := q.db.QueryContext(ctx, `
		SELECT id, quiz_id, module_id, score, total, duration_ms, created_at
		FROM quiz_attempts ORDER BY created_at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]QuizAttempt, 0, limit)
	for rows.Next() {
		attempt, err := scanAttempt(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, attempt)
	}
	return out, rows.Err()
}

func scanAttempt(scanner interface {
	Scan(dest ...any) error
}) (QuizAttempt, error) {
	var attempt QuizAttempt
	var moduleID sql.NullString
	if err := scanner.Scan(&attempt.ID, &attempt.QuizID, &moduleID, &attempt.Score,
		&attempt.Total, &attempt.DurationMS, &attempt.CreatedAt); err != nil {
		return QuizAttempt{}, err
	}
	attempt.ModuleID = moduleID.String
	attempt.Percent = percentOf(attempt.Score, attempt.Total)
	attempt.Passed = attempt.Percent >= PassThreshold
	return attempt, nil
}

func percentOf(score, total int) int {
	if total <= 0 {
		return 0
	}
	return int(math.Round(float64(score) / float64(total) * 100))
}
