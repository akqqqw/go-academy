import { createClient, type Session, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Настроен ли проект Supabase. Без переменных окружения вход невозможен. */
export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.error(
    'Supabase не настроен: задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в frontend/.env.local',
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
