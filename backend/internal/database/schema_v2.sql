-- Миграция 2: черновики кода. Пользовательские настройки и прогресс не
-- затрагиваются, таблица только добавляется.

CREATE TABLE IF NOT EXISTS code_drafts (
    key        TEXT PRIMARY KEY,          -- editor | lesson:<id> | exercise:<id>
    title      TEXT NOT NULL DEFAULT '',
    code       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_updated ON code_drafts(updated_at DESC);
