import * as Network from 'expo-network'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AppState } from 'react-native'

import { useAuth } from '@/auth/auth-context'
import { describePending, type SyncState } from '@/sync/queue-core'
import { flushQueue, pendingCount } from '@/sync/queue'

interface SyncContextValue {
  state: SyncState
  online: boolean
  pending: number
  lastSyncAt: number | null
  message: string
  sync: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

const POLL_INTERVAL_MS = 30_000

/**
 * Синхронизация изменений, сделанных офлайн.
 *
 * Запускается: при старте, при возвращении приложения на передний план, при
 * появлении сети и периодически, пока приложение активно. Очередь хранится в
 * SQLite, поэтому закрытое приложение ничего не теряет.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [state, setState] = useState<SyncState>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const running = useRef(false)

  const refreshPending = useCallback(async () => {
    try {
      setPending(await pendingCount())
    } catch {
      // База ещё не открыта — не критично.
    }
  }, [])

  const sync = useCallback(async () => {
    if (running.current || !session) return
    running.current = true
    setState('syncing')
    try {
      const networkState = await Network.getNetworkStateAsync()
      const connected = Boolean(networkState.isConnected && networkState.isInternetReachable !== false)
      setOnline(connected)
      if (!connected) {
        setState('offline')
        await refreshPending()
        return
      }
      const result = await flushQueue()
      setPending(result.remaining)
      setLastSyncAt(Date.now())
      setState(result.failed > 0 ? 'error' : 'idle')
    } catch {
      setState('error')
    } finally {
      running.current = false
    }
  }, [session, refreshPending])

  useEffect(() => {
    if (!session) {
      setPending(0)
      setState('idle')
      return
    }
    void sync()

    const timer = setInterval(() => {
      void sync()
    }, POLL_INTERVAL_MS)

    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void sync()
    })

    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [session, sync])

  const value = useMemo<SyncContextValue>(
    () => ({
      state,
      online,
      pending,
      lastSyncAt,
      message: online ? describePending(pending) : `Нет сети. ${describePending(pending)}`,
      sync,
    }),
    [state, online, pending, lastSyncAt, sync],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext)
  if (!context) throw new Error('useSync вне SyncProvider')
  return context
}
