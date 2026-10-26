import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

/** Простой мок fetch: путь → JSON-ответ или функция. */
export function mockFetch(routes: Record<string, unknown>, init?: { status?: number }) {
  const fn = vi.fn(async (input: RequestInfo | URL, requestInit?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const { pathname, search } = new URL(raw, 'http://localhost')
    // Ключи маршрутов пишем с читаемыми символами: раскодируем %3A и подобные.
    const full = decodeURIComponent(pathname) + search
    const key = Object.keys(routes).find((route) => full.startsWith(route))
    if (!key) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'нет мока для ' + full } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const value = routes[key]
    const resolved =
      typeof value === 'function' ? (value as (init?: RequestInit) => unknown)(requestInit) : value
    // Ответ можно пометить как ошибочный: { __status: 404, body: {...} }
    const withStatus = resolved as { __status?: number; body?: unknown } | undefined
    const status = withStatus?.__status ?? init?.status ?? 200
    const body = withStatus?.__status ? withStatus.body : resolved
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export function createWrapper(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>
          <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    )
  }
}

export function renderWithProviders(ui: ReactElement, options?: { route?: string; renderOptions?: RenderOptions }) {
  const Wrapper = createWrapper([options?.route ?? '/'])
  return render(ui, { wrapper: Wrapper, ...options?.renderOptions })
}
