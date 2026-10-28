package database

import (
	"context"
	_ "embed"
	"fmt"
	"strings"
	"time"
)

//go:embed schema_sqlite.sql
var schemaSQLite string

//go:embed schema_pg.sql
var schemaPostgres string

type migration struct {
	version int
	name    string
	sql     string
}

// migrations — схема SQLite для тестов. Production-схема Postgres применяется
// отдельно и described в schema_pg.sql.
var migrations = []migration{
	{version: 1, name: "initial_schema", sql: schemaSQLite},
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
		tx, err := d.Begin(ctx)
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

// migratePostgres применяет схему Supabase: таблицы, RLS-политики и гранты.
func (d *DB) migratePostgres(ctx context.Context) error {
	if _, err := d.DB.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("создать таблицу миграций Postgres: %w", err)
	}

	// Несколько инстансов serverless могут стартовать одновременно. Advisory
	// lock сериализует миграцию, повторная проверка внутри транзакции не даёт
	// применить схему дважды.
	tx, err := d.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("начать миграцию Postgres: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", migrationLockID); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("заблокировать миграцию Postgres: %w", err)
	}

	var applied int
	if err := tx.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM schema_migrations WHERE version = 1").Scan(&applied); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("прочитать миграции Postgres: %w", err)
	}
	if applied > 0 {
		_ = tx.Rollback()
		return nil
	}

	for index, statement := range splitSQLStatements(schemaPostgres) {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("миграция Postgres, запрос %d: %w", index+1, err)
		}
	}
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)",
		1, "supabase_initial_schema", nowUTC()); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("записать миграцию Postgres: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("зафиксировать миграцию Postgres: %w", err)
	}
	return nil
}

// migrationLockID — произвольный постоянный ключ advisory-блокировки миграций.
const migrationLockID = 741852963

// splitSQLStatements делит файл на отдельные запросы: pgx не выполняет
// несколько statement'ов в extended-протоколе. Точки с запятой внутри строк и
// dollar-quoted блоков игнорируются.
func splitSQLStatements(script string) []string {
	var statements []string
	var current strings.Builder
	inSingle, inDouble, inDollar := false, false, false
	for i := 0; i < len(script); i++ {
		ch := script[i]
		if !inSingle && !inDouble && !inDollar && ch == '-' && i+1 < len(script) && script[i+1] == '-' {
			// Комментарий до конца строки.
			for i < len(script) && script[i] != '\n' {
				i++
			}
			current.WriteByte('\n')
			continue
		}
		switch ch {
		case '\'':
			if !inDouble && !inDollar {
				if inSingle && i+1 < len(script) && script[i+1] == '\'' {
					current.WriteString("''")
					i++
					continue
				}
				inSingle = !inSingle
			}
		case '"':
			if !inSingle && !inDollar {
				inDouble = !inDouble
			}
		case '$':
			if !inSingle && !inDouble && i+1 < len(script) && script[i+1] == '$' {
				inDollar = !inDollar
				current.WriteString("$$")
				i++
				continue
			}
		case ';':
			if !inSingle && !inDouble && !inDollar {
				if statement := strings.TrimSpace(current.String()); statement != "" {
					statements = append(statements, statement)
				}
				current.Reset()
				continue
			}
		}
		current.WriteByte(ch)
	}
	if statement := strings.TrimSpace(current.String()); statement != "" {
		statements = append(statements, statement)
	}
	return statements
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

func nowUTC() string { return time.Now().UTC().Format(time.RFC3339) }

// Today возвращает текущую локальную дату в формате YYYY-MM-DD.
func Today() string { return time.Now().Format("2006-01-02") }

// ParseTime разбирает время, сохранённое в формате RFC3339 (см. Now).
func ParseTime(raw string) (time.Time, error) {
	return time.ParseInLocation(time.RFC3339, raw, time.Local)
}
