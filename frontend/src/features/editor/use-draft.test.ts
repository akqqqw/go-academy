import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDraft } from '@/features/editor/use-draft'
import { draftFixture } from '@/test/fixtures'
import { mockFetch } from '@/test/utils'

const starter = 'package main\n\nfunc main() {}\n'

describe('useDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('подставляет стартовый код, если черновика нет', async () => {
    mockFetch({
      '/api/drafts/editor': { __status: 404, body: { error: { code: 'draft_not_found', message: 'нет' } } },
    })

    const { result } = renderHook(() =>
      useDraft({ draftKey: 'editor', fallback: starter, autosave: true }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.code).toBe(starter)
    expect(result.current.error).toBeNull()
  })

  it('загружает сохранённый черновик', async () => {
    mockFetch({ '/api/drafts/editor': draftFixture })

    const { result } = renderHook(() =>
      useDraft({ draftKey: 'editor', fallback: starter, autosave: true }),
    )

    await waitFor(() => expect(result.current.code).toContain('из черновика'))
    expect(result.current.state).toBe('saved')
    expect(result.current.savedAt).toBe(draftFixture.draft.updated_at)
  })

  it('автоматически сохраняет изменения с задержкой', async () => {
    const fetchMock = mockFetch({
      '/api/drafts/editor': draftFixture,
    })

    const { result } = renderHook(() =>
      useDraft({ draftKey: 'editor', fallback: starter, autosave: true, debounceMs: 500 }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setCode('package main // новое'))
    expect(result.current.state).toBe('dirty')
    expect(result.current.dirty).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).includes('/api/drafts/editor') && init?.method === 'PUT',
        ),
      ).toBe(true)
    })
  })

  it('не сохраняет автоматически, если автосохранение выключено', async () => {
    const fetchMock = mockFetch({ '/api/drafts/editor': draftFixture })

    const { result } = renderHook(() =>
      useDraft({ draftKey: 'editor', fallback: starter, autosave: false, debounceMs: 100 }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setCode('package main // правка'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT'),
    ).toBe(false)
  })

  it('сбрасывает черновик и удаляет его из базы', async () => {
    const fetchMock = mockFetch({
      '/api/drafts/editor': (init?: RequestInit) =>
        init?.method === 'DELETE'
          ? { deleted: true, key: 'editor' }
          : draftFixture,
    })

    const { result } = renderHook(() =>
      useDraft({ draftKey: 'editor', fallback: starter, autosave: false }),
    )
    await waitFor(() => expect(result.current.code).toContain('из черновика'))

    await act(async () => {
      await result.current.reset()
    })

    expect(result.current.code).toBe(starter)
    expect(result.current.savedAt).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
  })
})
