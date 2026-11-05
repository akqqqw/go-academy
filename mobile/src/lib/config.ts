import Constants from 'expo-constants'

// Конфигурация приложения: адрес Go-API и параметры Supabase.
//
// Источники по приоритету:
//   1. переменные сборки (`EXPO_PUBLIC_*`) — попадают в бандл при EAS Build;
//   2. `extra` из app.config.ts (те же значения, но читаемые через expo-constants);
//   3. ответ `GET /api/config` — как в web, если переменные забыли задать.

export interface RemoteConfig {
  supabase_url?: string
  supabase_anon_key?: string
  auth_required?: boolean
}

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
}

/** Базовый URL API без завершающего слэша. */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  extra.apiBaseUrl ??
  'https://go-academy-one.vercel.app'
).replace(/\/+$/, '')

interface SupabaseConfig {
  url: string
  anonKey: string
  source: 'env' | 'remote' | 'none'
}

let supabaseConfig: SupabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '',
  source: 'env',
}

if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  supabaseConfig = { url: '', anonKey: '', source: 'none' }
}

/** Текущие параметры Supabase (могут быть получены с сервера). */
export function getSupabaseConfig(): SupabaseConfig {
  return supabaseConfig
}

/**
 * Загружает параметры Supabase с бэкенда, если они не встроены в сборку.
 * Вызывается до создания клиента; при ошибке остаётся состояние «не настроен».
 */
export async function loadSupabaseConfigFromServer(timeoutMs = 6000): Promise<SupabaseConfig> {
  if (supabaseConfig.url && supabaseConfig.anonKey) return supabaseConfig

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return supabaseConfig
    const payload = (await response.json()) as RemoteConfig
    if (payload?.supabase_url && payload?.supabase_anon_key) {
      supabaseConfig = {
        url: payload.supabase_url,
        anonKey: payload.supabase_anon_key,
        source: 'remote',
      }
    }
    return supabaseConfig
  } catch {
    return supabaseConfig
  } finally {
    clearTimeout(timer)
  }
}
