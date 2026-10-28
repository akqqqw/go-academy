-- Migration 5: карточки — подсказки в базе и индексы для повторений.
-- Таблицы flashcards и card_reviews созданы в первой схеме; здесь добавляем
-- только то, что нужно интерфейсу и быстрым выборкам.

ALTER TABLE flashcards ADD COLUMN hint TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_cards_deck ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_custom ON flashcards(custom);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON card_reviews(reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON card_reviews(card_id);
