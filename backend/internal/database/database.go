// Package database отвечает за подключение к базе и миграции схемы.
//
// В production используется Supabase Postgres (pgx), а SQLite остаётся только
// для быстрых тестов хранилища. SQL-запросы в storage написаны переносимо:
// плейсхолдеры `?` автоматически переписываются в `$1..$N` для Postgres.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/ncruces/go-sqlite3/driver"
	// embed добавляет WASM-сборку SQLite в бинарник: внешние библиотеки не нужны.
	_ "github.com/ncruces/go-sqlite3/embed"
)

// DB — обёртка над *sql.DB с поддержкой Postgres и контекстных транзакций.
type DB struct {
	*sql.DB
	Path   string
	driver string
}

// Open открывает (при необходимости создаёт) локальную SQLite-базу. Используется
// тестами; production-подключение создаётся через OpenPostgres.
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
	pool.SetMaxOpenConns(1)
	pool.SetMaxIdleConns(1)
	pool.SetConnMaxLifetime(0)
	pool.SetConnMaxIdleTime(0)

	database := &DB{DB: pool, Path: path, driver: "sqlite"}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := database.migrate(ctx); err != nil {
		_ = pool.Close()
		return nil, err
	}
	return database, nil
}

// OpenPostgres подключается к Supabase Postgres и применяет миграции.
func OpenPostgres(databaseURL string) (*DB, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, fmt.Errorf("не задана строка подключения SUPABASE_DB_URL")
	}
	pool, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("открыть Postgres: %w", err)
	}
	pool.SetMaxOpenConns(10)
	// На время миграции не держим idle-соединения: Supabase pooler и сети между
	// приложением и базой могут разрывать долгоживущие сессии. Схема применяется
	// идемпотентными statement'ами, поэтому обрыв не оставляет открытую
	// транзакцию с блокировками.
	pool.SetMaxIdleConns(0)
	pool.SetConnMaxLifetime(30 * time.Minute)
	pool.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if err := pool.PingContext(ctx); err != nil {
		_ = pool.Close()
		return nil, fmt.Errorf("подключиться к Supabase Postgres: %w", err)
	}

	database := &DB{DB: pool, Path: "supabase", driver: "postgres"}
	if err := database.migratePostgres(ctx); err != nil {
		_ = pool.Close()
		return nil, err
	}
	// После миграции пул снова может держать соединения для HTTP-запросов.
	pool.SetMaxIdleConns(5)
	return database, nil
}

// IsPostgres сообщает, что подключена облачная база.
func (d *DB) IsPostgres() bool { return d.driver == "postgres" }

// Driver возвращает имя драйвера: sqlite или postgres.
func (d *DB) Driver() string { return d.driver }

func (d *DB) prepare(query string) string {
	if d.driver == "postgres" {
		return Rebind(query)
	}
	return query
}

// ExecContext выполняет запрос в транзакции запроса (если она есть).
func (d *DB) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if tx, ok := TxFrom(ctx); ok {
		return tx.ExecContext(ctx, d.prepare(query), args...)
	}
	return d.DB.ExecContext(ctx, d.prepare(query), args...)
}

// QueryContext выполняет запрос в транзакции запроса (если она есть).
func (d *DB) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if tx, ok := TxFrom(ctx); ok {
		return tx.QueryContext(ctx, d.prepare(query), args...)
	}
	return d.DB.QueryContext(ctx, d.prepare(query), args...)
}

// QueryRowContext выполняет запрос в транзакции запроса (если она есть).
func (d *DB) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	if tx, ok := TxFrom(ctx); ok {
		return tx.QueryRowContext(ctx, d.prepare(query), args...)
	}
	return d.DB.QueryRowContext(ctx, d.prepare(query), args...)
}

// InsertID выполняет INSERT и возвращает сгенерированный id. Драйвер pgx не
// поддерживает LastInsertId, поэтому для Postgres запрос дополняется RETURNING id.
func (d *DB) InsertID(ctx context.Context, query string, args ...any) (int64, error) {
	if d.driver == "postgres" {
		var id int64
		if err := d.QueryRowContext(ctx, query+" RETURNING id", args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	result, err := d.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// Tx — общая часть *sql.Tx, которая нужна storage.
type Tx interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	Commit() error
	Rollback() error
}

// Begin запускает транзакцию или возвращает текущую транзакцию запроса.
// Вложенный Commit/Rollback ничего не делает: атомарностью управляет middleware.
func (d *DB) Begin(ctx context.Context) (Tx, error) {
	if tx, ok := TxFrom(ctx); ok {
		return nestedTx{parent: tx}, nil
	}
	raw, err := d.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	return &sqlTx{db: d, tx: raw}, nil
}

// RequestTx запускает транзакцию Postgres с ролью authenticated и JWT-claims.
// RLS-политики видят auth.uid() и автоматически ограничивают данные пользователя.
func (d *DB) RequestTx(ctx context.Context, claims string) (Tx, error) {
	raw, err := d.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if _, err := raw.ExecContext(ctx, "SET LOCAL ROLE authenticated"); err != nil {
		_ = raw.Rollback()
		return nil, fmt.Errorf("включить роль authenticated: %w", err)
	}
	if _, err := raw.ExecContext(ctx,
		"SELECT set_config('request.jwt.claims', $1, true)", claims); err != nil {
		_ = raw.Rollback()
		return nil, fmt.Errorf("передать claims в Postgres: %w", err)
	}
	return &sqlTx{db: d, tx: raw}, nil
}

type sqlTx struct {
	db *DB
	tx *sql.Tx
	// done защищает от повторного Commit/Rollback.
	done bool
}

func (t *sqlTx) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return t.tx.ExecContext(ctx, t.db.prepare(query), args...)
}

func (t *sqlTx) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return t.tx.QueryContext(ctx, t.db.prepare(query), args...)
}

func (t *sqlTx) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return t.tx.QueryRowContext(ctx, t.db.prepare(query), args...)
}

func (t *sqlTx) Commit() error {
	if t.done {
		return nil
	}
	t.done = true
	return t.tx.Commit()
}

func (t *sqlTx) Rollback() error {
	if t.done {
		return nil
	}
	t.done = true
	return t.tx.Rollback()
}

type nestedTx struct{ parent Tx }

func (t nestedTx) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return t.parent.ExecContext(ctx, query, args...)
}

func (t nestedTx) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return t.parent.QueryContext(ctx, query, args...)
}

func (t nestedTx) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return t.parent.QueryRowContext(ctx, query, args...)
}

func (nestedTx) Commit() error   { return nil }
func (nestedTx) Rollback() error { return nil }

type txKey struct{}

// WithTx сохраняет транзакцию запроса в контексте.
func WithTx(ctx context.Context, tx Tx) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

// TxFrom возвращает транзакцию запроса, если она была начата middleware.
func TxFrom(ctx context.Context) (Tx, bool) {
	tx, ok := ctx.Value(txKey{}).(Tx)
	return tx, ok
}

// Rebind заменяет `?` на `$1..$N` вне строковых литералов. Это позволяет
// storage использовать один набор SQL для SQLite и Postgres.
func Rebind(query string) string {
	var builder strings.Builder
	builder.Grow(len(query) + 8)
	arg := 0
	inSingle, inDouble := false, false
	for i := 0; i < len(query); i++ {
		char := query[i]
		switch char {
		case '\'':
			if !inDouble {
				if inSingle && i+1 < len(query) && query[i+1] == '\'' {
					builder.WriteString("''")
					i++
					continue
				}
				inSingle = !inSingle
			}
		case '"':
			if !inSingle {
				inDouble = !inDouble
			}
		case '?':
			if !inSingle && !inDouble {
				arg++
				builder.WriteByte('$')
				builder.WriteString(strconv.Itoa(arg))
				continue
			}
		}
		builder.WriteByte(char)
	}
	return builder.String()
}

// Size возвращает размер файла SQLite. Для Postgres размер неизвестен.
func (d *DB) Size() int64 {
	if d.driver != "sqlite" {
		return 0
	}
	info, err := os.Stat(d.Path)
	if err != nil {
		return 0
	}
	return info.Size()
}

// Checkpoint сбрасывает WAL в основной файл — нужно перед копированием SQLite.
func (d *DB) Checkpoint(ctx context.Context) error {
	if d.driver != "sqlite" {
		return nil
	}
	_, err := d.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)")
	return err
}

// BackupTo делает консистентную копию SQLite в указанный файл.
func (d *DB) BackupTo(ctx context.Context, dest string) error {
	if d.driver != "sqlite" {
		return fmt.Errorf("резервные копии Supabase настраиваются в панели Supabase")
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	_ = os.Remove(dest)
	stmt := "VACUUM INTO '" + strings.ReplaceAll(dest, "'", "''") + "'"
	_, err := d.ExecContext(ctx, stmt)
	return err
}
