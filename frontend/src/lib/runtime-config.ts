/** Публичная конфигурация приложения, которую отдаёт бэкенд (GET /api/config). */
export interface PublicConfig {
  supabase_url?: string
  supabase_anon_key?: string
  auth_required?: boolean
}

let config: PublicConfig | null = null
let requested = false

/** runtimeConfig отдаёт уже загруженную конфигурацию (или null). */
export function runtimeConfig(): PublicConfig | null {
  return config
}

/** setRuntimeConfig подставляет конфигурацию без запроса (тесты, отладка). */
export function setRuntimeConfig(next: PublicConfig | null): void {
  config = next
  requested = true
}

/**
 * loadRuntimeConfig один раз запрашивает конфигурацию у бэкенда.
 *
 * Нужна, когда переменные `VITE_*` не попали в сборку: например, их забыли
 * задать в окружении проекта на Vercel. Бэкенд уже знает адрес Supabase и
 * publishable key, поэтому отдаёт их браузеру — страница входа работает без
 * пересборки фронтенда.
 *
 * Ошибки не фатальны: если API недоступен, фронтенд остаётся в состоянии
 * «Supabase не настроен» и показывает подсказку.
 */
export async function loadRuntimeConfig(timeoutMs = 5000): Promise<PublicConfig | null> {
  if (requested) return config
  requested = true

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('/api/config', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const payload = (await response.json()) as PublicConfig | null
    if (!payload || typeof payload !== 'object') return null
    config = payload
    return payload
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
