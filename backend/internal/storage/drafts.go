package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"goacademy/internal/database"
)

// ErrDraftNotFound возвращается, когда черновика с таким ключом нет.
var ErrDraftNotFound = errors.New("черновик не найден")

// Draft — сохранённый код пользователя: черновик свободного редактора или
// решение упражнения/урока. Ключ определяет место: "editor", "lesson:m01-01",
// "exercise:two-sum".
type Draft struct {
	Key       string `json:"key"`
	Title     string `json:"title"`
	Code      string `json:"code"`
	UpdatedAt string `json:"updated_at"`
	CreatedAt string `json:"created_at"`
	Size      int    `json:"size"`
}

// Drafts хранит черновики кода в SQLite.
type Drafts struct{ db *database.DB }

// NewDrafts создаёт сервис черновиков.
func NewDrafts(db *database.DB) *Drafts { return &Drafts{db: db} }

// Get возвращает черновик по ключу.
func (d *Drafts) Get(ctx context.Context, key string) (Draft, error) {
	row := d.db.QueryRowContext(ctx, `
		SELECT key, title, code, created_at, updated_at
		FROM code_drafts WHERE key = ?`, key)

	var draft Draft
	if err := row.Scan(&draft.Key, &draft.Title, &draft.Code, &draft.CreatedAt, &draft.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Draft{}, ErrDraftNotFound
		}
		return Draft{}, fmt.Errorf("прочитать черновик: %w", err)
	}
	draft.Size = len(draft.Code)
	return draft, nil
}

// Save создаёт или обновляет черновик. Время создания сохраняется.
func (d *Drafts) Save(ctx context.Context, key, title, code string) (Draft, error) {
	now := database.Now()
	_, err := d.db.ExecContext(ctx, `
		INSERT INTO code_drafts (key, title, code, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			title = excluded.title,
			code = excluded.code,
			updated_at = excluded.updated_at`,
		key, title, code, now, now)
	if err != nil {
		return Draft{}, fmt.Errorf("сохранить черновик: %w", err)
	}
	return d.Get(ctx, key)
}

// Delete удаляет черновик. Если его нет — возвращает ErrDraftNotFound.
func (d *Drafts) Delete(ctx context.Context, key string) error {
	result, err := d.db.ExecContext(ctx, "DELETE FROM code_drafts WHERE key = ?", key)
	if err != nil {
		return fmt.Errorf("удалить черновик: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrDraftNotFound
	}
	return nil
}

// List возвращает черновики, начиная с самых свежих.
func (d *Drafts) List(ctx context.Context, limit int) ([]Draft, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := d.db.QueryContext(ctx, `
		SELECT key, title, code, created_at, updated_at
		FROM code_drafts ORDER BY updated_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("прочитать черновики: %w", err)
	}
	defer rows.Close()

	out := make([]Draft, 0, 8)
	for rows.Next() {
		var draft Draft
		if err := rows.Scan(&draft.Key, &draft.Title, &draft.Code, &draft.CreatedAt, &draft.UpdatedAt); err != nil {
			return nil, err
		}
		draft.Size = len(draft.Code)
		out = append(out, draft)
	}
	return out, rows.Err()
}

// RecordRun сохраняет историю запусков и обновляет дневную активность.
// Возвращает количество запусков, чтобы интерфейс мог показать статистику.
func (d *Drafts) RecordRun(ctx context.Context, source, refID, code string, ok bool, durationMs int64) error {
	now := database.Now()
	if _, err := d.db.ExecContext(ctx, `
		INSERT INTO code_runs (source, ref_id, code, ok, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		source, refID, truncate(code, 64<<10), boolToInt(ok), durationMs, now); err != nil {
		return fmt.Errorf("записать запуск: %w", err)
	}
	return nil
}

// RecentRuns возвращает последние запуски для страницы редактора.
func (d *Drafts) RecentRuns(ctx context.Context, limit int) ([]RunRecord, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := d.db.QueryContext(ctx, `
		SELECT id, source, ref_id, ok, duration_ms, created_at
		FROM code_runs ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("прочитать историю запусков: %w", err)
	}
	defer rows.Close()

	out := make([]RunRecord, 0, limit)
	for rows.Next() {
		var record RunRecord
		var okInt int
		if err := rows.Scan(&record.ID, &record.Source, &record.RefID, &okInt, &record.DurationMs, &record.CreatedAt); err != nil {
			return nil, err
		}
		record.OK = okInt == 1
		out = append(out, record)
	}
	return out, rows.Err()
}

// RunRecord — строка истории запусков.
type RunRecord struct {
	ID         int64  `json:"id"`
	Source     string `json:"source"`
	RefID      string `json:"ref_id"`
	OK         bool   `json:"ok"`
	DurationMs int64  `json:"duration_ms"`
	CreatedAt  string `json:"created_at"`
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}
