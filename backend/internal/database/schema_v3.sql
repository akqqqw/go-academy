-- Миграция 3: попытки решения практических заданий. Добавляется только новая
-- таблица, существующие данные не затрагиваются.
--
-- Задания описаны в content/exercises/exercises.json, поэтому здесь хранится
-- лишь история проверок: кто, когда и с каким результатом отправил решение.

CREATE TABLE IF NOT EXISTS exercise_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id TEXT NOT NULL,
    status      TEXT NOT NULL,                     -- ok | test_failed | compile_error | timeout | rejected | internal
    passed      INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    code        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exercise_attempts_exercise
    ON exercise_attempts(exercise_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_created
    ON exercise_attempts(created_at DESC);
