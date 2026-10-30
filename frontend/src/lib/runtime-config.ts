/** Публичная конфигурация приложения, которую отдаёт бэкенд. */
export interface PublicConfig {
  supabase_url?: string
  supabase_anon_key?: string
  auth_required?: boolean
}

declare global {
  interface Window {
    /**
     * Значение, которое бэкенд отдаёт как `/api/config.js`. Подключается
     * обычным `<script>` в index.html, поэтому доступно синхронно, ещё до
     * загрузки модулей приложения.
     */
    __GO_ACADEMY_CONFIG__?: PublicConfig
  }
}

// Конфигурация попадает в window синхронным скриптом, поэтому читаем её сразу
// при загрузке модуля: клиент Supabase создаётся с готовыми значениями.
let config: PublicConfig | null = readInjected()
let requested = config !== null

function readInjected(): PublicConfig | null {
  if (typeof window === 'undefined') return null
  const value = window.__GO_ACADEMY_CONFIG__
  return value && typeof value === 'object' ? value : null
}

/** runtimeConfig отдаёт конфигурацию (или null, если её нет). */
export function runtimeConfig(): PublicConfig | null {
  return config
}

/** setRuntimeConfig подставляет конфигурацию без запроса (тесты, отладка). */
export function setRuntimeConfig(next: PublicConfig | null): void {
  config = next
  requested = true
}

/**
 * loadRuntimeConfig возвращает конфигурацию, догружая её через GET /api/config,
 * если синхронный скрипт `/api/config.js` не сработал (например, его заблокировал
 * прокси или бэкенд был недоступен в момент загрузки страницы).
 *
 * Нужна для деплоев, где переменные `VITE_*` не попали в сборку: бэкенд уже
 * знает адрес Supabase и publishable key, поэтому отдаёт их браузеру.
 * Ошибки не фатальны: приложение останется в состоянии «Supabase не настроен».
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
