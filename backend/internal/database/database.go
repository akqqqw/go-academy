// Package database отвечает за подключение к SQLite и миграции схемы.
//
// Используется чистый Go-драйвер github.com/ncruces/go-sqlite3 (SQLite,
// скомпилированный в WebAssembly), поэтому проект собирается без cgo и без
// системных зависимостей.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/ncruces/go-sqlite3/driver"
	// embed добавляет WASM-сборку SQLite в бинарник: внешние библиотеки не нужны.
	_ "github.com/ncruces/go-sqlite3/embed"
)

// DB — обёртка над *sql.DB с удобными хелперами.
type DB struct {
	*sql.DB
	Path string
}

// Open открывает (при необходимости создаёт) базу данных по указанному пути
// и применяет все миграции.
func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("создать каталог данных: %w", err)
	}

	dsn := "file:" + (&url.URL{Path: path}).EscapedPath() +
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)"

	pool, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("открыть базу: %w", err)
	}
	// Однопользовательское приложение: одна запись за раз — самый предсказуемый режим.
	pool.SetMaxOpenConns(1)
	pool.SetMaxIdleConns(1)
	pool.SetConnMaxLifetime(0)
	pool.SetConnMaxIdleTime(0)

	database := &DB{DB: pool, Path: path}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := database.migrate(ctx); err != nil {
		_ = pool.Close()
		return nil, err
	}
	return database, nil
}

// Size возвращает размер файла базы данных в байтах.
func (d *DB) Size() int64 {
	info, err := os.Stat(d.Path)
	if err != nil {
		return 0
	}
	return info.Size()
}

// Checkpoint сбрасывает WAL в основной файл — нужно перед копированием базы.
func (d *DB) Checkpoint(ctx context.Context) error {
	_, err := d.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)")
	return err
}

// BackupTo делает консистентную копию базы в указанный файл.
func (d *DB) BackupTo(ctx context.Context, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	_ = os.Remove(dest)
	// Параметры в VACUUM INTO не поддерживаются, поэтому подставляем
	// экранированный литерал.
	stmt := "VACUUM INTO '" + strings.ReplaceAll(dest, "'", "''") + "'"
	_, err := d.ExecContext(ctx, stmt)
	return err
}
