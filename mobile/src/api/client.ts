import type { ApiErrorBody } from '@shared/types'

import { API_BASE_URL } from '@/lib/config'
import { getSupabase } from '@/lib/supabase'

/** Ошибка API с кодом и подробностями — тот же формат, что на сервере. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, status: number, code = 'unknown', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Сеть недоступна: запрос можно повторить позже из очереди. */
  get isNetworkError(): boolean {
    return this.status === 0
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Отправить без токена (публичная конфигурация). */
  anonymous?: boolean
  signal?: AbortSignal
}

async function accessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Запрос к Go-API.
 *
 * Особенности мобильного клиента:
 * - токен берётся из Supabase-сессии, при 401 сессия обновляется и запрос
 *   повторяется один раз;
 * - обрыв сети превращается в ApiError со status 0, чтобы вызывающий код мог
 *   положить операцию в очередь синхронизации вместо потери данных.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  if (!options.anonymous) {
    const token = await accessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const send = async (): Promise<Response> => {
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch {
      throw new ApiError('Нет связи с сервером. Проверьте интернет.', 0, 'network_error')
    }
  }

  let response = await send()

  if (response.status === 401 && !options.anonymous) {
    const supabase = getSupabase()
    const refreshed = supabase ? await supabase.auth.refreshSession() : null
    const token = refreshed?.data.session?.access_token
    if (token) {
      headers.Authorization = `Bearer ${token}`
      response = await send()
    } else {
      await supabase?.auth.signOut()
    }
  }

  if (!response.ok) {
    let code = 'http_error'
    let message = `Запрос завершился с кодом ${response.status}`
    let details: unknown
    try {
      const body = (await response.json()) as ApiErrorBody
      if (body?.error) {
        code = body.error.code
        message = body.error.message
        details = body.error.details
      }
    } catch {
      // Не JSON — оставляем сообщение по умолчанию.
    }
    throw new ApiError(message, response.status, code, details)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
