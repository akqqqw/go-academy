import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '@/api/client'
import { cacheGet, cacheSet } from '@/db/cache'

export interface CachedQueryResult<T> {
  data: T | null
  error: string | null
  /** true, пока идёт первая загрузка без кэша. */
  loading: boolean
  /** true, если показанные данные пришли из локального кэша. */
  fromCache: boolean
  refresh: () => Promise<void>
}

/**
 * Запрос с офлайн-кэшем: сначала отдаём сохранённое, затем обновляем с сервера.
 *
 * Такой порядок даёт мгновенное открытие экранов и работу без сети; при
 * ошибке сети данные из кэша остаются на экране, а пользователь видит плашку
 * «офлайн» от SyncProvider.
 */
export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: number } = {},
): CachedQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const mounted = useRef(true)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const load = useCallback(async () => {
    try {
      const fetched = await fetcherRef.current()
      if (!mounted.current) return
      setData(fetched)
      setFromCache(false)
      setError(null)
      await cacheSet(key, fetched)
    } catch (err) {
      if (!mounted.current) return
      const message = err instanceof ApiError ? err.message : 'Не удалось загрузить данные'
      setError(message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    mounted.current = true
    let cancelled = false

    void (async () => {
      const cached = await cacheGet<T>(key, options.ttl ?? 0)
      if (!cancelled && cached !== null) {
        setData(cached)
        setFromCache(true)
        setLoading(false)
      }
      if (!cancelled) await load()
    })()

    return () => {
      cancelled = true
      mounted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ключ определяет запрос
  }, [key])

  return { data, error, loading, fromCache, refresh: load }
}
