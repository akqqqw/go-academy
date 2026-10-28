import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, api } from '@/lib/api'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface UseDraftOptions {
  /** Ключ черновика: editor | lesson:<id> | exercise:<id>. */
  draftKey: string
  /** Код, который показывается, пока черновика нет. */
  fallback: string
  /** Автосохранение включено в настройках. */
  autosave: boolean
  /** Задержка автосохранения после последней правки. */
  debounceMs?: number
}

interface UseDraftResult {
  code: string
  setCode: (code: string) => void
  state: SaveState
  savedAt: string | null
  loading: boolean
  error: string | null
  /** Сохраняет код немедленно. */
  save: (next?: string) => Promise<void>
  /** Сбрасывает черновик к fallback (в базе он удаляется). */
  reset: () => Promise<void>
  /** Признак того, что пользователь менял код. */
  dirty: boolean
}

/**
 * useDraft хранит код в аккаунте через /api/drafts.
 *
 * Логика: при первом открытии подтягиваем сохранённый черновик (если он есть),
 * дальше — автосохранение с задержкой и ручное сохранение по кнопке/шорткату.
 * Сброс удаляет черновик из базы, чтобы «Сбросить» действительно возвращало
 * исходное состояние, а не только экран.
 */
export function useDraft({
  draftKey,
  fallback,
  autosave,
  debounceMs = 900,
}: UseDraftOptions): UseDraftResult {
  const [code, setCodeState] = useState(fallback)
  const [state, setState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const codeRef = useRef(code)
  const timerRef = useRef<number | null>(null)
  const savedCodeRef = useRef(fallback)

  codeRef.current = code

  // Загрузка сохранённого черновика при смене ключа или стартового кода.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setState('idle')
    setDirty(false)

    api
      .getDraft(draftKey)
      .then((response) => {
        if (cancelled) return
        if (response.draft.code.trim() !== '') {
          setCodeState(response.draft.code)
          savedCodeRef.current = response.draft.code
          setSavedAt(response.draft.updated_at)
          setState('saved')
        } else {
          setCodeState(fallback)
          savedCodeRef.current = fallback
        }
      })
      .catch((cause) => {
        if (cancelled) return
        setCodeState(fallback)
        savedCodeRef.current = fallback
        // 404 — нормальная ситуация: черновика ещё нет.
        if (!(cause instanceof ApiError) || cause.status !== 404) {
          setError(cause instanceof Error ? cause.message : 'не удалось загрузить черновик')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [draftKey, fallback])

  const save = useCallback(
    async (next?: string) => {
      const value = next ?? codeRef.current
      setState('saving')
      try {
        const response = await api.saveDraft(draftKey, { code: value })
        savedCodeRef.current = value
        setSavedAt(response.draft.updated_at)
        setState('saved')
        setError(null)
        setDirty(false)
      } catch (cause) {
        setState('error')
        setError(cause instanceof Error ? cause.message : 'не удалось сохранить черновик')
      }
    },
    [draftKey],
  )

  const setCode = useCallback(
    (next: string) => {
      setCodeState(next)
      setDirty(next !== savedCodeRef.current)
      if (next !== savedCodeRef.current) setState('dirty')
    },
    [],
  )

  // Автосохранение: только если код отличается от сохранённого.
  useEffect(() => {
    if (!autosave || loading) return
    if (code === savedCodeRef.current) return

    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void save(code)
    }, debounceMs)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [autosave, code, debounceMs, loading, save])

  const reset = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setCodeState(fallback)
    savedCodeRef.current = fallback
    setDirty(false)
    setState('idle')
    try {
      await api.deleteDraft(draftKey)
      setSavedAt(null)
      setError(null)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setSavedAt(null)
        return
      }
      setError(cause instanceof Error ? cause.message : 'не удалось удалить черновик')
    }
  }, [draftKey, fallback])

  return { code, setCode, state, savedAt, loading, error, save, reset, dirty }
}
