-- Миграция 4: папки заметок.
--
-- Сами заметки и теги появились ещё в первой схеме (таблицы notes и note_tags),
-- здесь добавляется только справочник папок: он нужен, чтобы папку можно было
-- создать пустой, переименовать и упорядочить. Имя папки в notes.folder
-- остаётся текстом — так данные переживают переименование без потери связей.

CREATE TABLE IF NOT EXISTS note_folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_folders_position ON note_folders(position);

-- Поиск по заметкам. Встроенный LOWER() в SQLite понимает только латиницу,
-- поэтому нормализованный текст (заголовок + тело в нижнем регистре) хранится
-- отдельной колонкой и заполняется из Go.
ALTER TABLE notes ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

-- Две стартовые папки: в «Общее» попадают обычные записи, в «Уроки» — заметки,
-- созданные со страницы урока.
INSERT OR IGNORE INTO note_folders (id, name, position, created_at)
VALUES ('general', 'Общее', 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO note_folders (id, name, position, created_at)
VALUES ('lessons', 'Уроки', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
