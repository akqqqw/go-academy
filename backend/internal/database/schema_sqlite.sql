-- Схема SQLite для тестов. Повторяет Postgres-схему, но user_id — текстовая
-- колонка со значением 'local', а RLS отсутствует.

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id    TEXT PRIMARY KEY DEFAULT 'local',
    email      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    user_id    TEXT NOT NULL DEFAULT 'local',
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS activity_days (
    user_id        TEXT NOT NULL DEFAULT 'local',
    day            TEXT NOT NULL,
    study_seconds  INTEGER NOT NULL DEFAULT 0,
    lessons_opened INTEGER NOT NULL DEFAULT 0,
    lessons_done   INTEGER NOT NULL DEFAULT 0,
    exercises_done INTEGER NOT NULL DEFAULT 0,
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    quizzes_done   INTEGER NOT NULL DEFAULT 0,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS lessons (
    user_id        TEXT NOT NULL DEFAULT 'local',
    id             TEXT NOT NULL,
    module_id      TEXT NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'not_started',
    last_opened_at TEXT,
    completed_at   TEXT,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS exercises (
    user_id    TEXT NOT NULL DEFAULT 'local',
    id         TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT 'easy',
    status     TEXT NOT NULL DEFAULT 'todo',
    attempts   INTEGER NOT NULL DEFAULT 0,
    code       TEXT NOT NULL DEFAULT '',
    solved_at  TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS code_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'local',
    source      TEXT NOT NULL DEFAULT 'editor',
    ref_id      TEXT NOT NULL DEFAULT '',
    code        TEXT NOT NULL,
    ok          INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    user_id     TEXT NOT NULL DEFAULT 'local',
    id          TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    folder      TEXT NOT NULL DEFAULT 'Общее',
    lesson_id   TEXT,
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    search_text TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS note_tags (
    user_id TEXT NOT NULL DEFAULT 'local',
    note_id TEXT NOT NULL,
    tag     TEXT NOT NULL,
    PRIMARY KEY (user_id, note_id, tag),
    FOREIGN KEY (user_id, note_id) REFERENCES notes(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_folders (
    user_id    TEXT NOT NULL DEFAULT 'local',
    id         TEXT NOT NULL,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS flashcards (
    user_id       TEXT NOT NULL DEFAULT 'local',
    id            TEXT NOT NULL,
    deck_id       TEXT NOT NULL,
    front         TEXT NOT NULL,
    back          TEXT NOT NULL,
    hint          TEXT NOT NULL DEFAULT '',
    ease          REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions   INTEGER NOT NULL DEFAULT 0,
    lapses        INTEGER NOT NULL DEFAULT 0,
    due_at        TEXT,
    custom        INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS card_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'local',
    card_id     TEXT NOT NULL,
    grade       TEXT NOT NULL,
    reviewed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'local',
    quiz_id     TEXT NOT NULL,
    module_id   TEXT NOT NULL DEFAULT '',
    score       INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    answers     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'local',
    exercise_id TEXT NOT NULL,
    status      TEXT NOT NULL,
    passed      INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    code        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
    user_id     TEXT NOT NULL DEFAULT 'local',
    code        TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS code_drafts (
    user_id    TEXT NOT NULL DEFAULT 'local',
    key        TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    code       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_activity_day ON activity_days(user_id, day);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_due ON flashcards(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON flashcards(user_id, deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_custom ON flashcards(user_id, custom);
CREATE INDEX IF NOT EXISTS idx_runs_created ON code_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_updated ON code_drafts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_exercise ON exercise_attempts(user_id, exercise_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_created ON exercise_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON card_reviews(user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON card_reviews(user_id, card_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(user_id, quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created ON quiz_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_folders_position ON note_folders(user_id, position);

INSERT OR IGNORE INTO note_folders (user_id, id, name, position, created_at)
VALUES ('local', 'general', 'Общее', 0, '2026-01-01T00:00:00Z');
INSERT OR IGNORE INTO note_folders (user_id, id, name, position, created_at)
VALUES ('local', 'lessons', 'Уроки', 1, '2026-01-01T00:00:00Z');
