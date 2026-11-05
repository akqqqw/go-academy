# База данных

Одна схема Supabase Postgres — единственный источник правды для web и mobile.
Учебный контент (104 урока, задания, колоды, викторины) в базе **не хранится**:
он лежит в каталоге `content/` и читается сервером через `contentfs`.

## 1. Как создаётся схема

```text
backend/internal/database/
├── schema_pg.sql       вся схема для Supabase Postgres + RLS
├── schema_sqlite.sql   та же схема для локальной SQLite (dev и тесты)
├── migrate.go          раннер миграций (version → name → применяется один раз)
└── database.go         открытие соединения, выбор драйвера
```

Миграции применяются на старте сервера: таблица `schema_migrations` хранит
`version` и `name`, каждая миграция идёт в транзакции. Текущая версия — `1`
(`initial_schema`). Новая миграция — это новый элемент в списке `migrations`
плюс DDL; существующие данные не переписываются, `CREATE TABLE IF NOT EXISTS`
и `ON CONFLICT` делают повторный запуск безопасным.

Правило проекта: **сначала миграция, потом изменение в коде**. Обратная
совместимость с уже записанными данными обязательна.

## 2. Таблицы

Все пользовательские таблицы содержат `user_id uuid NOT NULL DEFAULT auth.uid()`
(или `PRIMARY KEY` для `user_profiles`) и защищены RLS-политикой
`user_id = auth.uid()`. Backend выставляет роль `authenticated` и JWT-claims в
транзакции запроса, поэтому политики работают и для API.

| Таблица | Ключ | Назначение |
| --- | --- | --- |
| `user_profiles` | `user_id` | email и дата создания профиля |
| `settings` | `(user_id, key)` | настройки: тема, цели, редактор; значения строками |
| `activity_days` | `(user_id, day)` | агрегат дня: секунды учёбы, открытые/завершённые уроки, задачи, карточки, викторины |
| `lessons` | `(user_id, id)` | статус урока: `not_started` / `in_progress` / `completed`, `last_opened_at`, `completed_at` |
| `exercises` | `(user_id, id)` | прогресс задания: статус, число попыток, последний код, `solved_at` |
| `code_runs` | `id` (identity) | история запусков кода: источник, ссылка, `ok`, длительность |
| `code_drafts` | `(user_id, key)` | черновики редактора (`editor`, `lesson-<id>`, `exercise-<id>`) |
| `notes` | `(user_id, id)` | заметки, папка, привязка к уроку, `search_text` |
| `note_tags` | `(user_id, note_id, tag)` | теги заметок, FK на `notes` с `ON DELETE CASCADE` |
| `note_folders` | `(user_id, id)` | папки заметок, уникальное имя в рамках пользователя |
| `flashcards` | `(user_id, id)` | состояние SM-2: `ease`, `interval_days`, `repetitions`, `lapses`, `due_at`, `custom` |
| `card_reviews` | `id` (identity) | журнал повторений: карточка, оценка, время |
| `quiz_attempts` | `id` (identity) | попытки викторин: результат, длительность |
| `exercise_attempts` | `id` (identity) | попытки проверки заданий: статус, пройдено проверок |
| `achievements` | `(user_id, code)` | открытые достижения и время открытия |

Индексы покрывают горячие запросы: `activity_days(user_id, day)`,
`lessons(user_id, module_id)`, `flashcards(user_id, due_at)`,
`notes(user_id, updated_at DESC)`, `code_runs(user_id, created_at DESC)`,
`card_reviews(user_id, reviewed_at DESC)`, `quiz_attempts(user_id, quiz_id, created_at DESC)`.

## 3. Что считается на сервере

Часть полей не хранится, а вычисляется при чтении — это исключает расхождения
между устройствами:

- SM-2 (`ease`, `interval_days`, `repetitions`, `lapses`, `due_at`)
  пересчитывается сервером при `POST /api/flashcards/{id}/review`; клиент
  присылает только оценку (`again` / `hard` / `good` / `easy`);
- прогресс курса, процент модуля, серия — из `lessons` и `activity_days`
  (`backend/internal/progress`);
- счётчики викторин: `passed` = `COUNT(DISTINCT quiz_id)` среди успешных
  попыток, `percent` ограничен диапазоном 0..100;
- достижения открываются условиями из `backend/internal/progress` по реальным
  метрикам, а не по клиентским заявкам;
- «сегодня» и дни активности считаются в часовом поясе приложения
  (`APP_TIMEZONE`, по умолчанию `Europe/Moscow`): `activity_days.day` — это дата
  в этом поясе, а серия сравнивает календарные дни, а не интервалы в 24 часа,
  поэтому переходы на летнее/зимнее время её не обрывают.

## 4. Локальная база мобильного приложения

`mobile/src/db/database.ts` создаёт отдельную SQLite-базу (не копию серверной):

| Таблица | Назначение |
| --- | --- |
| `cache_entries` | ответы API с TTL: `key`, `value`, `updated_at` |
| `pending_ops` | журнал неотправленных действий: `op_id`, `kind`, `payload`, `attempts`, `next_try_at`, `last_error` |
| `lesson_progress` | локальный статус урока и позиция чтения (`scroll`) |
| `settings_cache` | последние настройки с сервера — приложение открывается без сети |

Версия схемы хранится в `PRAGMA user_version` (сейчас `1`) и повышается
миграцией при открытии базы. Подробнее про очередь — `docs/SYNC.md`.

## 5. Проверка RLS

RLS включается для каждой таблицы и завершается грантами:

```sql
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_owner ON notes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON TABLE schema_migrations FROM authenticated;
GRANT SELECT ON TABLE schema_migrations TO authenticated;
```

Проверка в SQL-редакторе Supabase (от имени обычного пользователя):

```sql
-- должно вернуть 0 строк
select * from notes where user_id <> auth.uid();
-- должно упасть с ошибкой политики
insert into notes (user_id, id, title, body, created_at, updated_at)
values (gen_random_uuid(), 'x', 't', 'b', now()::text, now()::text);
```

`schema_migrations` доступна только на чтение: менять версию схемы из API
нельзя.
