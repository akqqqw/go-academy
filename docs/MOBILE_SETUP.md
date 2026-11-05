# Мобильное приложение: сборка и запуск

Приложение на React Native + Expo (Expo Router, SDK 58). Оно нативное: никаких
WebView-обёрток, экраны собраны на нативных компонентах, офлайн-хранилище —
`expo-sqlite`, токен сессии — `expo-secure-store`.

```text
mobile/
├── app/                  маршруты Expo Router
│   ├── _layout.tsx       провайдеры: auth → sync → настройки → тема → напоминания
│   ├── (auth)/           login, register, reset
│   ├── (tabs)/           index, learn, code, cards, profile
│   ├── lesson/[lessonId].tsx
│   ├── exercise/[exerciseId].tsx
│   └── notes.tsx, quizzes.tsx, achievements.tsx, settings.tsx
├── src/
│   ├── api/              клиент Go-API (Bearer + refresh), типизированные эндпоинты
│   ├── auth/             Supabase-сессия в SecureStore
│   ├── db/               expo-sqlite: кэш и журнал изменений
│   ├── sync/             очередь и её чистая логика
│   ├── features/notifications/  напоминания (opt-in) и тексты
│   ├── hooks/, store/, ui/      хуки, Zustand, компоненты и токены
└── assets/               icon, adaptive-icon, splash, notification-icon
```

## 1. Что понадобится

- Node.js 20+ и npm;
- телефон с **Expo Go** (SDK 58) или эмулятор Android / симулятор iOS;
- доступ к развёрнутому API (`https://go-academy-one.vercel.app`) или
  локальному серверу.

## 2. Установка

```bash
cd mobile
npm ci --legacy-peer-deps
```

`--legacy-peer-deps` нужен из-за peer-зависимостей `react-native-svg`,
`expo-network` и `vitest` в монорепозитории; lock-файл уже учитывает это
решение.

## 3. Переменные окружения

Скопируйте `.env.example` → `.env` и заполните публичные параметры:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
EXPO_PUBLIC_API_BASE_URL=https://go-academy-one.vercel.app
```

- это тот же publishable/anon ключ, который получает браузер: он публичный;
- `service_role` и строку подключения к БД в мобильное приложение **не кладут**;
- если переменные не заданы, приложение запросит их у `GET /api/config` —
  так же, как web. Порядок: переменные сборки → `app.config.ts` (`extra`) →
  ответ сервера.

Для эмулятора Android локальный API доступен как `http://10.0.2.2:8080`.

## 4. Запуск

```bash
npm start          # Expo Dev Server, QR-код для Expo Go
npm run android    # эмулятор Android
npm run ios        # симулятор iOS (только macOS)
npm run typecheck  # tsc --noEmit
npm test           # vitest: очередь, разбор Markdown, тексты напоминаний
```

## 5. Проверки перед коммитом

```bash
npm run lint
npm run typecheck
npm test
npm run export:check            # expo export --platform ios: бандл собирается
npx expo config --type public   # конфиг валиден, плагины и assets на месте
npx expo-doctor                 # версии пакетов соответствуют SDK
```

## 6. Навигация

Нижняя панель — пять вкладок из ТЗ:

| Вкладка | Файл | Что внутри |
| --- | --- | --- |
| Главная | `(tabs)/index.tsx` | приветствие, серия, время за сегодня, карточка «Продолжить», план дня, достижения |
| Учёба | `(tabs)/learn.tsx` | модули и уроки с поиском, прогресс по модулям, офлайн-статусы из SQLite |
| Код | `(tabs)/code.tsx` | редактор с панелью символов, запуск, форматирование, черновик в аккаунте |
| Карточки | `(tabs)/cards.tsx` | очередь повторения, показ ответа, четыре оценки, выбор колоды |
| Профиль | `(tabs)/profile.tsx` | аккаунт, прогресс, синхронизация, тема, вход в остальные разделы |

Экраны вне вкладок: урок, задание, заметки, тесты, достижения, настройки.

## 7. Разрешения

| Разрешение | Зачем | Когда спрашиваем |
| --- | --- | --- |
| Уведомления (`POST_NOTIFICATIONS` на Android, alert на iOS) | одно напоминание в 19:30, если дневная цель не закрыта | только после нажатия переключателя «Напоминать о занятиях» в настройках |
| Сеть | чтение и синхронизация | не требует диалога |

Перед системным диалогом показывается объяснение пользы: «Одно уведомление в
19:30, только если дневная цель не закрыта. Помогает не потерять серию;
отключается в настройках в один тап». Уведомления локальные — push-сертификаты
и токены устройств не нужны, сервер о расписании не знает.

## 8. Сборка через EAS

```bash
npm i -g eas-cli
eas login
eas init                    # создаст projectId, впишите его в EAS_PROJECT_ID
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Профили (`eas.json`):

| Профиль | Назначение | Особенности |
| --- | --- | --- |
| `development` | отладка на устройстве | development client, API `http://localhost:8080` |
| `preview` | внутренние тесты | internal distribution, боевой API |
| `production` | магазины | `autoIncrement`, OTA-канала `production` |

Идентификаторы — **заглушки**, меняются в `app.config.ts` перед публикацией:

- iOS: `bundleIdentifier: "com.goacademy.app"`;
- Android: `package: "com.goacademy.app"`;
- `eas.json → submit.production` содержит `REPLACE_WITH_*` для App Store Connect
  и путь к сервисному аккаунту Google Play (файл не коммитится).

## 9. Иконки и splash

| Файл | Размер | Использование |
| --- | --- | --- |
| `assets/icon.png` | 1024×1024 | иконка приложения |
| `assets/adaptive-icon.png` | 1024×1024, прозрачный фон | Android adaptive icon |
| `assets/splash.png` | 1284×2778 | splash через `expo-splash-screen` |
| `assets/notification-icon.png` | 96×96, белый силуэт | иконка уведомлений Android |

## 10. Офлайн, синхронизация, темы

- офлайн и очередь — `docs/SYNC.md`;
- схема локальной SQLite и серверной базы — `docs/DATABASE.md`;
- тема (тёмная / светлая / как в системе) хранится в настройках аккаунта и
  кэшируется локально: выбор сохраняется между запусками и совпадает с web;
- дневные цели меняются в «Настройках» и сохраняются на сервере; при отсутствии
  сети очередь синхронизации отправит их позже.
