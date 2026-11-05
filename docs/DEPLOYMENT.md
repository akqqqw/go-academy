# Деплой

Один код — три площадки: web на Vercel, Go-API на Vercel (тот же проект, второй
сервис) и мобильные сборки в EAS Build. Пошаговый чек-лист для первого
развёртывания — `docs/vercel.md`; здесь — полная картина и переменные окружения.

## 1. Схема

```text
GitHub (main)
   │
   ├── Vercel Project (Services)
   │      ├── frontend  (Vite, frontend/dist)  → / и статика
   │      └── backend   (Go, backend/cmd/server) → /api/*
   │
   └── EAS Build
          ├── preview    → internal distribution (Android APK / iOS ad hoc)
          └── production → App Store / Google Play
```

Браузер и мобильное приложение обращаются к одному и тому же `/api/*`; база —
общий проект Supabase. Синхронизация прогресса между платформами не требует
отдельной интеграции: обе стороны пишут в один и тот же аккаунт.

## 2. Web + API (Vercel Services)

`vercel.json` в корне описывает два сервиса и маршрутизацию; менять настройки в
панели не нужно.

| Сервис | Вход | Что отдаёт |
| --- | --- | --- |
| `frontend` | `npm run build` в `frontend/` | `dist/` |
| `backend` | `go build ./cmd/server` в `backend/` | HTTP-сервер на `PORT` |

Переменные окружения проекта (Project → Settings → Environment Variables):

| Переменная | Для чего | Секрет |
| --- | --- | --- |
| `SUPABASE_URL` | адрес проекта Supabase | нет |
| `SUPABASE_ANON_KEY` / `PUBLIC_KEY` | publishable-ключ для клиентов и `/api/config` | нет |
| `SUPABASE_SERVICE_ROLE_KEY` | серверные операции с БД (обход RLS невозможен без policy) | **да** |
| `SUPABASE_DB_URL` | подключение к Postgres (если используется драйвер PG) | **да** |
| `AUTH_REQUIRED` | `true` включает обязательную авторизацию | нет |
| `APP_TIMEZONE` | часовой пояс «сегодня» и серии дней (`Europe/Moscow` по умолчанию) | нет |

Важно: фронтенд не требует ручной настройки `VITE_*`. Конфигурация приходит
двумя путями — build-time инлайнинг публичных значений и рантайм `GET
/api/config.js`; поэтому новый деплой работает сразу после того, как заданы
серверные переменные.

`APP_TIMEZONE` важен именно на Vercel: функции живут в UTC, и без явного пояса
«сегодня» переключалось бы не в полночь пользователя, а серия дней рвалась бы
вечером. Допустимые значения — зоны IANA (`Europe/Moscow`, `Asia/Almaty`,
`Europe/Berlin`); `tzdata` встроена в бинарник, поэтому системные файлы зон в
serverless-окружении не нужны.

Секреты никогда не попадают в клиент и в мобильную сборку: браузер и приложение
получают только anon/publishable ключ.

## 3. Supabase

1. Создайте проект, включите **Email**-провайдер.
2. Выполните `backend/internal/database/schema_pg.sql` — схема идемпотентна
   (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`).
   При старте сервер дополнительно применяет миграции из `migrate.go`.
3. Проверьте RLS (запросы — в `docs/DATABASE.md`, раздел 5).
4. Redirect URL для писем подтверждения: `https://<project>.vercel.app/**`,
   для мобильного — `goacademy://**` (схема из `app.config.ts`).

## 4. Мобильные сборки (EAS)

```bash
cd mobile
npx eas-cli login
npx eas-cli init         # projectId → EAS_PROJECT_ID
npx eas-cli build --platform all --profile preview
```

Переменные для сборки (`eas.json → build.<profile>.env` или `eas env:create`):

| Переменная | Значение |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `https://go-academy-one.vercel.app` |
| `EXPO_PUBLIC_SUPABASE_URL` | адрес проекта |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | publishable-ключ |
| `EAS_PROJECT_ID` | из `eas init` |

`EXPO_PUBLIC_*` встраиваются в бандл — это публичные значения, как в web.

Перед публикацией замените заглушки:

| Место | Заглушка | Что подставить |
| --- | --- | --- |
| `app.config.ts → ios.bundleIdentifier` | `com.goacademy.app` | ваш Bundle ID |
| `app.config.ts → android.package` | `com.goacademy.app` | ваш Application ID |
| `eas.json → submit.production.ios.*` | `REPLACE_WITH_*` | Apple ID, ASC App ID, Team ID |
| `eas.json → submit.production.android.serviceAccountKeyPath` | путь к JSON | сервисный аккаунт Google Play (не коммитится) |

Иконки и splash уже лежат в `mobile/assets`; требования к размерам — в
`docs/MOBILE_SETUP.md`, раздел 9.

## 5. Порядок выкладки

1. Миграции (SQL-редактор Supabase) — до деплоя кода.
2. `main` → Vercel собирает оба сервиса.
3. Smoke-тест web: вход, главная (серия и время раздельно), урок, задание,
   карточки, тесты.
4. Smoke-тест «контракта» API для мобильного:
   `curl https://<host>/api/config` и `curl -H "Authorization: Bearer …" https://<host>/api/dashboard`.
5. EAS `preview` → проверка на реальных устройствах → EAS `production`.

## 6. Откат

- Web/API: Vercel → Deployments → **Promote** предыдущего успешного деплоя
  (мгновенно, без пересборки).
- База: миграции только добавляющие; откат кода не требует откат схемы.
  Деструктивные изменения (удаление колонки) выполняются отдельным релизом
  после того, как новый код отработал.
- Мобильное приложение: `eas update --rollback` для OTA-обновлений; бинарники в
  магазинах откатываются публикацией предыдущей версии.

## 7. Известные ограничения

- Запуск пользовательского Go-кода сейчас выполняется локальным Go SDK без
  контейнерной изоляции — см. `docs/CODE_RUNNER.md`;
- push-уведомления не используются: напоминания локальные, настраиваются на
  устройстве (`docs/MOBILE_SETUP.md`, раздел 7);
- Go-сборка в этом окружении недоступна, поэтому изменения бэкенда
  проверяются только CI/локально (`go test ./...` в `backend/`).
