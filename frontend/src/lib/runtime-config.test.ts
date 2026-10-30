import { afterEach, describe, expect, it, vi } from 'vitest'

// Модуль хранит состояние (запрошена ли конфигурация), поэтому в каждом тесте
// берём его свежую копию через vi.resetModules().
async function freshModule() {
  vi.resetModules()
  return import('@/lib/runtime-config')
}

describe('runtime config', () => {
  afterEach(() => {
    delete window.__GO_ACADEMY_CONFIG__
  })

  it('берёт конфигурацию из синхронного скрипта без запроса к API', async () => {
    window.__GO_ACADEMY_CONFIG__ = {
      supabase_url: 'https://demo.supabase.co',
      supabase_anon_key: 'sb_publishable_demo',
      auth_required: true,
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { loadRuntimeConfig, runtimeConfig } = await freshModule()

    // Значение доступно сразу при загрузке модуля — до любых await.
    expect(runtimeConfig()?.supabase_url).toBe('https://demo.supabase.co')
    await expect(loadRuntimeConfig()).resolves.toEqual(window.__GO_ACADEMY_CONFIG__)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('превращает ошибку сети в null и не ломает приложение', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('нет сети'))))
    const { loadRuntimeConfig, runtimeConfig } = await freshModule()

    await expect(loadRuntimeConfig()).resolves.toBeNull()
    expect(runtimeConfig()).toBeNull()
  })

  it('превращает ответ 404 в null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    const { loadRuntimeConfig } = await freshModule()

    await expect(loadRuntimeConfig()).resolves.toBeNull()
  })

  it('сохраняет полученную конфигурацию и не запрашивает её повторно', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            supabase_url: 'https://demo.supabase.co',
            supabase_anon_key: 'sb_publishable_demo',
            auth_required: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { loadRuntimeConfig, runtimeConfig } = await freshModule()

    const config = await loadRuntimeConfig()
    expect(config?.supabase_url).toBe('https://demo.supabase.co')
    expect(runtimeConfig()?.supabase_anon_key).toBe('sb_publishable_demo')

    await loadRuntimeConfig()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/config')
  })
})
