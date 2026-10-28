package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"goacademy/internal/database"
)

// LessonProgress — сохранённое состояние урока.
type LessonProgress struct {
	ID           string  `json:"id"`
	ModuleID     string  `json:"module_id"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	LastOpenedAt *string `json:"last_opened_at"`
	CompletedAt  *string `json:"completed_at"`
}

// Lessons хранит прогресс по урокам.
type Lessons struct{ db *database.DB }

// NewLessons создаёт сервис прогресса уроков.
func NewLessons(db *database.DB) *Lessons { return &Lessons{db: db} }

// Open фиксирует открытие урока. Завершённые уроки остаются завершёнными —
// повторное открытие не сбрасывает прогресс.
func (l *Lessons) Open(ctx context.Context, moduleID, lessonID, title string) (LessonProgress, error) {
	now := database.Now()
	_, err := l.db.ExecContext(ctx, `
		INSERT INTO lessons (id, module_id, title, status, last_opened_at, updated_at)
		VALUES (?, ?, ?, 'in_progress', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			module_id = excluded.module_id,
			last_opened_at = excluded.last_opened_at,
			updated_at = excluded.updated_at,
			status = CASE WHEN lessons.status = 'completed' THEN 'completed' ELSE 'in_progress' END`,
		lessonID, moduleID, title, now, now)
	if err != nil {
		return LessonProgress{}, fmt.Errorf("сохранить открытие урока: %w", err)
	}
	return l.Get(ctx, lessonID)
}

// Complete помечает урок завершённым.
func (l *Lessons) Complete(ctx context.Context, moduleID, lessonID, title string) (LessonProgress, error) {
	now := database.Now()
	_, err := l.db.ExecContext(ctx, `
		INSERT INTO lessons (id, module_id, title, status, last_opened_at, completed_at, updated_at)
		VALUES (?, ?, ?, 'completed', ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			module_id = excluded.module_id,
			status = 'completed',
			completed_at = excluded.completed_at,
			updated_at = excluded.updated_at`,
		lessonID, moduleID, title, now, now, now)
	if err != nil {
		return LessonProgress{}, fmt.Errorf("отметить урок завершённым: %w", err)
	}
	return l.Get(ctx, lessonID)
}

// Get возвращает состояние урока из базы. Если урока нет — ErrLessonNotFound.
func (l *Lessons) Get(ctx context.Context, lessonID string) (LessonProgress, error) {
	row := l.db.QueryRowContext(ctx, `
		SELECT id, module_id, title, status, last_opened_at, completed_at
		FROM lessons WHERE id = ?`, lessonID)

	var record LessonProgress
	var lastOpened, completed sql.NullString
	if err := row.Scan(&record.ID, &record.ModuleID, &record.Title, &record.Status, &lastOpened, &completed); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return LessonProgress{}, ErrLessonNotFound
		}
		return LessonProgress{}, err
	}
	if lastOpened.Valid {
		record.LastOpenedAt = &lastOpened.String
	}
	if completed.Valid {
		record.CompletedAt = &completed.String
	}
	return record, nil
}

// ErrLessonNotFound — прогресс по уроку ещё не создан.
var ErrLessonNotFound = errors.New("прогресс урока не найден")
