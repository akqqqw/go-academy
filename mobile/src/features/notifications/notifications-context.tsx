import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AppState } from 'react-native'

import type { DashboardResponse } from '@shared/types'
import { planProgress, studySummary } from '@shared/learning'

import { api } from '@/api/endpoints'
import {
  configureNotificationHandler,
  disableDailyReminder,
  enableDailyReminder,
  getPermissionState,
  isReminderEnabled,
  type PermissionState,
} from '@/features/notifications/reminders'
import { cacheGet } from '@/db/cache'
import { reminderBody } from '@/features/notifications/messages'

interface RemindersState {
  enabled: boolean
  permission: PermissionState
  busy: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
}

const RemindersContext = createContext<RemindersState | null>(null)

/**
 * Провайдер напоминаний.
 *
 * Разрешение спрашивается только по действию пользователя. Польза объясняется
 * до системного диалога: сначала Alert с причиной, затем системный запрос.
 */
export function RemindersProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  const [permission, setPermission] = useState<PermissionState>('undetermined')
  const [busy, setBusy] = useState(false)
  const listenerAttached = useRef(false)

  useEffect(() => {
    configureNotificationHandler()
    void (async () => {
      setEnabled(await isReminderEnabled())
      setPermission(await getPermissionState())
    })()
  }, [])

  // Открытие экрана по тапу на уведомление: пользователь ждёт «Главную», а не
  // пустой экран приложения.
  useEffect(() => {
    if (listenerAttached.current) return
    listenerAttached.current = true

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen
      if (typeof screen === 'string') router.push(screen)
    })

    return () => subscription.remove()
  }, [router])

  // При возврате из системных настроек разрешение могло измениться.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      void getPermissionState().then((next) => {
        setPermission(next)
        if (next === 'denied') setEnabled(false)
      })
    })
    return () => subscription.remove()
  }, [])

  const enable = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      // Причина до системного диалога — иначе пользователь отказывает вслепую.
      const agreed = await confirmBenefit()
      if (!agreed) return

      const body = await buildReminderText()
      const ok = await enableDailyReminder(body)
      setPermission(await getPermissionState())
      setEnabled(ok)

      if (!ok) {
        Alert.alert(
          'Уведомления отключены',
          'Разрешение не выдано. Включите уведомления для Go Academy в настройках системы.',
        )
      }
    } finally {
      setBusy(false)
    }
  }, [busy])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      await disableDailyReminder()
      setEnabled(false)
    } finally {
      setBusy(false)
    }
  }, [])

  const value = useMemo<RemindersState>(
    () => ({ enabled, permission, busy, enable, disable }),
    [enabled, permission, busy, enable, disable],
  )

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>
}

export function useReminders(): RemindersState {
  const value = useContext(RemindersContext)
  if (!value) throw new Error('useReminders должен вызываться внутри RemindersProvider')
  return value
}

function confirmBenefit(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Напоминать о занятиях?',
      'Одно уведомление в 19:30, только если дневная цель не закрыта. Помогает не потерять серию; отключается в настройках в один тап.',
      [
        { text: 'Не сейчас', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Включить', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

async function buildReminderText(): Promise<string> {
  // Свежий снимок прогресса; при отсутствии сети — последний из кэша.
  try {
    const dashboard = await api.dashboard()
    return textFromDashboard(dashboard)
  } catch {
    const cached = await cacheGet<DashboardResponse>('dashboard', Number.MAX_SAFE_INTEGER)
    return cached ? textFromDashboard(cached) : reminderBody({ planPercent: 0, remainingMinutes: 0, dueCards: 0 })
  }
}

function textFromDashboard(dashboard: DashboardResponse): string {
  const study = studySummary(dashboard.snapshot)
  const plan = planProgress(dashboard.snapshot.plan)
  return reminderBody({
    planPercent: plan.percent,
    remainingMinutes: study.remainingMinutes,
    dueCards: dashboard.snapshot.cards?.due ?? 0,
  })
}
