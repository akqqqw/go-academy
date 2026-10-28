-- Migration 6: викторины — сохранение ответов попытки и быстрые выборки.
-- Сама таблица quiz_attempts создана в первой схеме.

ALTER TABLE quiz_attempts ADD COLUMN answers TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created ON quiz_attempts(created_at DESC);
