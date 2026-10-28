import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { metaFixture, settingsFixture } from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'
import { useSettingsStore } from '@/store/settings'

import { SettingsPage } from '@/pages/settings-page'

describe('SettingsPage', () => {
  beforeEach(() => {
    useSettingsStore.getState().setSettings(settingsFixture)
  })

  it('отправляет PATCH при переключении темы и применяет её', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      '/api/settings': { settings: { ...settingsFixture, theme: 'light' } },
      '/api/meta': metaFixture,
    })

    renderWithProviders(<SettingsPage />)
    await screen.findByText('Внешний вид')

    await user.click(screen.getByRole('radio', { name: 'Светлая' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ theme: 'light' })
    })
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
    expect(useSettingsStore.getState().settings.theme).toBe('light')
  })

  it('показывает облачное хранилище и версию схемы', async () => {
    mockFetch({
      '/api/settings': { settings: settingsFixture },
      '/api/meta': metaFixture,
    })
    renderWithProviders(<SettingsPage />)

    expect(await screen.findByText('Supabase Postgres')).toBeInTheDocument()
    expect(screen.getByText('Резервные копии')).toBeInTheDocument()
    expect(screen.getByText(/Project Settings → Database → Backups/)).toBeInTheDocument()
    expect(screen.getByText(/1 модулей|14 модулей/)).toBeTruthy()
  })

  it('показывает ошибку сохранения и откатывает значение', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/meta')) {
          return new Response(JSON.stringify(metaFixture), { status: 200 })
        }
        return new Response(
          JSON.stringify({ error: { code: 'validation_error', message: 'некорректные значения' } }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    renderWithProviders(<SettingsPage />)
    await screen.findByText('Внешний вид')
    await user.click(screen.getByRole('radio', { name: 'Светлая' }))

    await waitFor(() => {
      expect(useSettingsStore.getState().settings.theme).toBe('dark')
    })
    expect(useSettingsStore.getState().error).toBe('некорректные значения')
  })
})
