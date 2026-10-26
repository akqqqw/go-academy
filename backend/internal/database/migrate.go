package database

import (
	"context"
	_ "embed"
	"fmt"
	"time"
)

//go:embed schema.sql
var schemaV1 string

//go:embed schema_v2.sql
var schemaV2 string

type migration struct {
	version int
	name    string
	sql     string
}

// migrations — упорядоченный список миграций. Новые изменения схемы добавляются
// отдельными шагами, уже применённые никогда не переписываются.
var migrations = []migration{
	{version: 1, name: "initial_schema", sql: schemaV1},
	{version: 2, name: "code_drafts", sql: schemaV2},
}

func (d *DB) migrate(ctx context.Context) error {
	if _, err := d.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("создать таблицу миграций: %w", err)
	}

	applied := map[int]bool{}
	rows, err := d.QueryContext(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("прочитать миграции: %w", err)
	}
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			rows.Close()
			return err
		}
		applied[version] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, m := range migrations {
		if applied[m.version] {
			continue
		}
		tx, err := d.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("начать миграцию %d: %w", m.version, err)
		}
		if _, err := tx.ExecContext(ctx, m.sql); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("применить миграцию %d (%s): %w", m.version, m.name, err)
		}
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
			m.version, m.name, Now()); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("записать миграцию %d: %w", m.version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("зафиксировать миграцию %d: %w", m.version, err)
		}
	}
	return nil
}

// SchemaVersion возвращает максимальную применённую версию схемы.
func (d *DB) SchemaVersion(ctx context.Context) (int, error) {
	var version int
	err := d.QueryRowContext(ctx,
		"SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&version)
	return version, err
}

// Now возвращает текущее локальное время в формате RFC3339 (используется во всех таблицах).
func Now() string { return time.Now().Format(time.RFC3339) }

// Today возвращает текущую локальную дату в формате YYYY-MM-DD.
func Today() string { return time.Now().Format("2006-01-02") }

// ParseTime разбирает время, сохранённое в формате RFC3339 (см. Now).
func ParseTime(raw string) (time.Time, error) {
	return time.ParseInLocation(time.RFC3339, raw, time.Local)
}
