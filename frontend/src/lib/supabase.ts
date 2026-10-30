import { createClient, type Session, type User } from '@supabase/supabase-js'

import { runtimeConfig } from '@/lib/runtime-config'

// Параметры Supabase берутся из двух источников:
//  1. переменные сборки VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — основной путь;
//  2. публичная конфигурация бэкенда (GET /api/config) — запасной, чтобы деплой
//     без VITE-переменных не превращался в мёртвую страницу входа.
const buildURL = import.meta.env.VITE_SUPABASE_URL
const buildKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const runtime = runtimeConfig()

const url = buildURL || runtime?.supabase_url
const anonKey = buildKey || runtime?.supabase_anon_key

/** Настроен ли проект Supabase. Без параметров вход невозможен. */
export const supabaseConfigured = Boolean(url && anonKey)

/** Откуда взялись параметры: из сборки, из ответа бэкенда или ниоткуда. */
export const supabaseConfigSource: 'build' | 'runtime' | 'none' = !supabaseConfigured
  ? 'none'
  : buildURL && buildKey
    ? 'build'
    : 'runtime'

/** Подсказка для интерфейса: что именно не задано и где это исправить. */
export const supabaseConfigHint =
  'Supabase не настроен: бэкенд не сообщил адрес проекта и publishable key. ' +
  'Задайте SUPABASE_URL и PUBLIC_KEY в переменных окружения проекта на Vercel ' +
  '(или VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY для сборки фронтенда) и пересоберите деплой.'

if (!supabaseConfigured) {
  console.error(
    `Supabase не настроен: задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY для сборки ` +
      `или SUPABASE_URL и PUBLIC_KEY для сервиса backend (GET /api/config).`,
  )
}

// Fallback-адрес нужен только чтобы модуль не падал в тестах и при сборке без .env.
// Реальные запросы в таком состоянии завершатся ошибкой.
export const supabase = createClient(
  url || 'http://127.0.0.1:54321',
  anonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)

export type { Session, User }
