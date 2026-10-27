package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestOpenAppliesSchemaOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "academy.db")
	db, err := Open(path)
	if err != nil {
		t.Fatalf("открыть базу: %v", err)
	}
	ctx := context.Background()
	version, err := db.SchemaVersion(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if version != len(migrations) {
		t.Errorf("версия схемы = %d, ожидалась %d", version, len(migrations))
	}

	tables := []string{"settings", "activity_days", "lessons", "exercises", "notes", "flashcards", "quiz_attempts", "achievements", "code_runs", "code_drafts"}
	for _, table := range tables {
		var name string
		err := db.QueryRowContext(ctx, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		if err != nil {
			t.Errorf("таблица %s не создана: %v", table, err)
		}
	}
	_ = db.Close()

	// Повторное открытие не должно переприменять миграции и терять данные.
	db, err = Open(path)
	if err != nil {
		t.Fatalf("переоткрыть базу: %v", err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, "INSERT INTO settings (key, value, updated_at) VALUES ('theme', '\"light\"', ?)", Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		"INSERT INTO settings (key, value, updated_at) VALUES ('theme', '\"light\"', ?) ON CONFLICT(key) DO UPDATE SET value='ok'", Now()); err != nil {
		t.Fatal(err)
	}
	version, err = db.SchemaVersion(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if version != len(migrations) {
		t.Errorf("версия схемы после переоткрытия = %d", version)
	}
}

func TestNowFormat(t *testing.T) {
	if _, err := ParseTime(Now()); err != nil {
		t.Errorf("Now() не в формате RFC3339: %v", err)
	}
	if len(Today()) != 10 {
		t.Errorf("Today() = %q, ожидался формат YYYY-MM-DD", Today())
	}
}
