import * as SQLite from 'expo-sqlite'

// Локальная база мобильного приложения.
//
// Здесь два вида данных:
//  1. кэш ответов API (контент, прогресс, карточки) — чтобы экраны работали без
//     сети и открывались мгновенно;
//  2. журнал операций `pending_ops` — то, что пользователь сделал офлайн и что
//     нужно отправить на сервер.
//
// Схема версионируется через user_version: новые версии добавляются
// миграциями, данные пользователя не удаляются.

const DATABASE_NAME = 'goacademy.db'
const SCHEMA_VERSION = 1

let database: SQLite.SQLiteDatabase | null = null

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME)
  await migrate(db)
  database = db
  return db
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const current = row?.user_version ?? 0
  if (current >= SCHEMA_VERSION) return

  await db.execAsync('PRAGMA journal_mode = WAL;')

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_ops (
        op_id      TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        next_try_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pending_next ON pending_ops(next_try_at);
      CREATE TABLE IF NOT EXISTS lesson_progress (
        lesson_id  TEXT PRIMARY KEY,
        status     TEXT NOT NULL,
        scroll     REAL NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings_cache (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`)
}

/** Полный сброс локальных данных (выход из аккаунта). */
export async function resetLocalData(): Promise<void> {
  const db = await getDatabase()
  await db.execAsync(`
    DELETE FROM cache_entries;
    DELETE FROM pending_ops;
    DELETE FROM lesson_progress;
    DELETE FROM settings_cache;
  `)
}
