package storage

import (
	"context"
	"database/sql"
	"fmt"

	"goacademy/internal/database"
)

// ExerciseAttempt — одна отправка решения на проверку.
type ExerciseAttempt struct {
	ID         int64  `json:"id"`
	ExerciseID string `json:"exercise_id"`
	Status     string `json:"status"`
	Passed     int    `json:"passed"`
	Total      int    `json:"total"`
	DurationMs int64  `json:"duration_ms"`
	CreatedAt  string `json:"created_at"`
	// Code хранится только чтобы связать попытку с решением; в интерфейс
	// отдаётся через отдельный эндпоинт истории.
	Code string `json:"code,omitempty"`
}

// ExerciseStat — сводка по заданию: сколько раз решали и решено ли.
type ExerciseStat struct {
	ExerciseID string `json:"exercise_id"`
	Attempts   int    `json:"attempts"`
	BestPassed int    `json:"best_passed"`
	BestTotal  int    `json:"best_total"`
	Solved     bool   `json:"solved"`
	SolvedAt   string `json:"solved_at,omitempty"`
	LastStatus string `json:"last_status,omitempty"`
	LastAt     string `json:"last_at,omitempty"`
}

// ExerciseProgress хранит историю проверок практики.
type ExerciseProgress struct{ db *database.DB }

// NewExerciseProgress создаёт сервис прогресса практики.
func NewExerciseProgress(db *database.DB) *ExerciseProgress { return &ExerciseProgress{db: db} }

// Record сохраняет попытку и возвращает обновлённую сводку по заданию.
//
// Второе значение — «задание решено именно этой попыткой»: нужно, чтобы
// дневной счётчик решённых задач увеличивался один раз, а не при каждом
// повторном прохождении.
func (p *ExerciseProgress) Record(ctx context.Context, attempt ExerciseAttempt) (ExerciseStat, bool, error) {
	if attempt.CreatedAt == "" {
		attempt.CreatedAt = database.Now()
	}
	// Важно проверить это до вставки: иначе текущая попытка уже будет учтена.
	solvedBefore, err := p.isSolved(ctx, attempt.ExerciseID)
	if err != nil {
		return ExerciseStat{}, false, err
	}
	_, err = p.db.ExecContext(ctx, `
		INSERT INTO exercise_attempts (exercise_id, status, passed, total, duration_ms, code, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		attempt.ExerciseID, attempt.Status, attempt.Passed, attempt.Total,
		attempt.DurationMs, truncate(attempt.Code, 64<<10), attempt.CreatedAt)
	if err != nil {
		return ExerciseStat{}, false, fmt.Errorf("записать попытку: %w", err)
	}
	stats, err := p.Stats(ctx)
	if err != nil {
		return ExerciseStat{}, false, err
	}
	stat := stats[attempt.ExerciseID]
	// Решением считается только полностью пройденный набор проверок. Если
	// задание уже было решено раньше, счётчик активности не трогаем.
	justSolved := !solvedBefore && attempt.Total > 0 && attempt.Passed == attempt.Total
	return stat, justSolved, nil
}

// isSolved сообщает, есть ли по заданию хотя бы одна полностью успешная попытка.
func (p *ExerciseProgress) isSolved(ctx context.Context, exerciseID string) (bool, error) {
	var count int
	err := p.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM exercise_attempts
		WHERE exercise_id = ? AND total > 0 AND passed = total`, exerciseID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("проверить решение задания: %w", err)
	}
	return count > 0, nil
}

// Stats возвращает сводку по всем заданиям, которые пользователь открывал.
func (p *ExerciseProgress) Stats(ctx context.Context) (map[string]ExerciseStat, error) {
	rows, err := p.db.QueryContext(ctx, `
		SELECT exercise_id,
		       COUNT(*) AS attempts,
		       MAX(passed) AS best_passed,
		       MAX(CASE WHEN passed = total AND total > 0 THEN 1 ELSE 0 END) AS solved,
		       MAX(CASE WHEN passed = total AND total > 0 THEN created_at END) AS solved_at
		FROM exercise_attempts
		GROUP BY exercise_id`)
	if err != nil {
		return nil, fmt.Errorf("прочитать статистику заданий: %w", err)
	}
	defer rows.Close()

	out := make(map[string]ExerciseStat, 16)
	for rows.Next() {
		var stat ExerciseStat
		var bestPassed, solved sql.NullInt64
		var solvedAt sql.NullString
		if err := rows.Scan(&stat.ExerciseID, &stat.Attempts, &bestPassed, &solved, &solvedAt); err != nil {
			return nil, err
		}
		stat.BestPassed = int(bestPassed.Int64)
		stat.Solved = solved.Int64 == 1
		stat.SolvedAt = solvedAt.String
		out[stat.ExerciseID] = stat
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Последняя попытка по каждому заданию: нужна для бейджа «была ошибка».
	lastRows, err := p.db.QueryContext(ctx, `
		SELECT exercise_id, status, passed, total, created_at
		FROM exercise_attempts
		WHERE id IN (SELECT MAX(id) FROM exercise_attempts GROUP BY exercise_id)`)
	if err != nil {
		return nil, fmt.Errorf("прочитать последние попытки: %w", err)
	}
	defer lastRows.Close()
	for lastRows.Next() {
		var exerciseID, status, createdAt string
		var passed, total int
		if err := lastRows.Scan(&exerciseID, &status, &passed, &total, &createdAt); err != nil {
			return nil, err
		}
		stat := out[exerciseID]
		stat.ExerciseID = exerciseID
		stat.LastStatus = status
		stat.LastAt = createdAt
		if passed > stat.BestPassed {
			stat.BestPassed = passed
		}
		if total > stat.BestTotal {
			stat.BestTotal = total
		}
		out[exerciseID] = stat
	}
	return out, lastRows.Err()
}

// Attempts возвращает историю попыток по заданию, начиная с последней.
func (p *ExerciseProgress) Attempts(ctx context.Context, exerciseID string, limit int) ([]ExerciseAttempt, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := p.db.QueryContext(ctx, `
		SELECT id, exercise_id, status, passed, total, duration_ms, code, created_at
		FROM exercise_attempts WHERE exercise_id = ? ORDER BY id DESC LIMIT ?`,
		exerciseID, limit)
	if err != nil {
		return nil, fmt.Errorf("прочитать историю попыток: %w", err)
	}
	defer rows.Close()

	out := make([]ExerciseAttempt, 0, limit)
	for rows.Next() {
		var attempt ExerciseAttempt
		if err := rows.Scan(&attempt.ID, &attempt.ExerciseID, &attempt.Status, &attempt.Passed,
			&attempt.Total, &attempt.DurationMs, &attempt.Code, &attempt.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, attempt)
	}
	return out, rows.Err()
}

// Overview — общая статистика практики для заголовка страницы.
type Overview struct {
	Attempts   int `json:"attempts"`
	Solved     int `json:"solved"`
	InProgress int `json:"in_progress"`
}

// Overview считает попытки и решения по всем заданиям.
func (p *ExerciseProgress) Overview(ctx context.Context) (Overview, error) {
	stats, err := p.Stats(ctx)
	if err != nil {
		return Overview{}, err
	}
	var overview Overview
	for _, stat := range stats {
		overview.Attempts += stat.Attempts
		if stat.Solved {
			overview.Solved++
		} else if stat.Attempts > 0 {
			overview.InProgress++
		}
	}
	return overview, nil
}
