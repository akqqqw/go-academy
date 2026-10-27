-- Схема базы данных Go Academy.
--
-- Все миграции применяются последовательно и только один раз; пользовательские
-- данные не удаляются при обновлении приложения.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

-- Настройки приложения (ключ → JSON-значение).
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Активность по дням: используется для серии дней, календаря и статистики.
CREATE TABLE IF NOT EXISTS activity_days (
    day            TEXT PRIMARY KEY, -- YYYY-MM-DD (локальная дата)
    study_seconds  INTEGER NOT NULL DEFAULT 0,
    lessons_opened INTEGER NOT NULL DEFAULT 0,
    lessons_done   INTEGER NOT NULL DEFAULT 0,
    exercises_done INTEGER NOT NULL DEFAULT 0,
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    quizzes_done   INTEGER NOT NULL DEFAULT 0,
    updated_at     TEXT NOT NULL
);

-- Прогресс по урокам.
CREATE TABLE IF NOT EXISTS lessons (
    id             TEXT PRIMARY KEY,
    module_id      TEXT NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'not_started', -- not_started | in_progress | completed
    last_opened_at TEXT,
    completed_at   TEXT,
    updated_at     TEXT NOT NULL
);

-- Решения практических задач.
CREATE TABLE IF NOT EXISTS exercises (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT 'easy',
    status     TEXT NOT NULL DEFAULT 'todo', -- todo | attempted | solved
    attempts   INTEGER NOT NULL DEFAULT 0,
    code       TEXT NOT NULL DEFAULT '',
    solved_at  TEXT,
    updated_at TEXT NOT NULL
);

-- История запусков кода в редакторе.
CREATE TABLE IF NOT EXISTS code_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL DEFAULT 'editor', -- editor | exercise | lesson
    ref_id      TEXT NOT NULL DEFAULT '',       -- id урока или задачи
    code        TEXT NOT NULL,
    ok          INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

-- Заметки и их теги.
CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    folder     TEXT NOT NULL DEFAULT 'Общее',
    lesson_id  TEXT,
    pinned     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
);

-- Карточки и интервальное повторение.
CREATE TABLE IF NOT EXISTS flashcards (
    id            TEXT PRIMARY KEY,
    deck_id       TEXT NOT NULL,
    front         TEXT NOT NULL,
    back          TEXT NOT NULL,
    ease          REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions   INTEGER NOT NULL DEFAULT 0,
    lapses        INTEGER NOT NULL DEFAULT 0,
    due_at        TEXT,
    custom        INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    TEXT NOT NULL,
    grade      TEXT NOT NULL, -- again | hard | good | easy
    reviewed_at TEXT NOT NULL
);

-- Результаты тестов и викторин.
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id     TEXT NOT NULL,
    module_id   TEXT NOT NULL DEFAULT '',
    score       INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

-- Достижения.
CREATE TABLE IF NOT EXISTS achievements (
    code        TEXT PRIMARY KEY,
    unlocked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_day ON activity_days(day);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_due ON flashcards(due_at);
CREATE INDEX IF NOT EXISTS idx_runs_created ON code_runs(created_at DESC);
