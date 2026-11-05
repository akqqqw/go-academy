// Планирование локальных напоминаний.
//
// Архитектура: напоминание — это локальное уведомление expo-notifications,
// сервер не рассылает push (не нужен ни токен, ни сертификат, ни ключ).
// Текст уведомления считает клиент по уже загруженному снимку прогресса,
// поэтому напоминание уходит офлайн и не требует отдельного бэкенда.
//
// Разрешение спрашивается только после явного действия пользователя
// (переключатель в настройках), а не при первом запуске.
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { cacheGet, cacheSet } from '@/db/cache'
import { REMINDER_TITLE } from '@/features/notifications/messages'

const REMINDER_HOUR = 19
const REMINDER_MINUTE = 30
const REMINDER_ID_KEY = 'notifications.reminder_id'
const ENABLED_KEY = 'notifications.reminder_enabled'

/** Глобальный обработчик: показываем уведомление даже при открытом приложении. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })

  // Канал Android обязателен начиная с API 26: без него уведомление не покажется.
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('reminders', {
      name: 'Напоминания о занятиях',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Мягкое напоминание вечером, если дневная цель ещё не закрыта',
    })
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined'

export async function getPermissionState(): Promise<PermissionState> {
  const settings = await Notifications.getPermissionsAsync()
  if (settings.granted) return 'granted'
  if (!settings.canAskAgain) return 'denied'
  return 'undetermined'
}

/** Запрашивает разрешение. Вызывать только из обработчика переключателя. */
export async function requestPermission(): Promise<PermissionState> {
  const current = await getPermissionState()
  if (current !== 'undetermined') return current
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  })
  return requested.granted ? 'granted' : 'denied'
}

export async function isReminderEnabled(): Promise<boolean> {
  const enabled = await cacheGet<boolean>(ENABLED_KEY, Number.MAX_SAFE_INTEGER)
  if (!enabled) return false
  // Настройка могла быть отозвана в системе — тогда считаем напоминание выключенным.
  const permission = await getPermissionState()
  return permission === 'granted'
}

/**
 * Включает ежедневное напоминание.
 *
 * `message` формируется вызывающей стороной из снимка прогресса: сервер не
 * знает о расписании локальных уведомлений, а клиент показывает актуальные
 * цифры на момент включения.
 */
export async function enableDailyReminder(message?: string): Promise<boolean> {
  const permission = await requestPermission()
  if (permission !== 'granted') {
    await cacheSet(ENABLED_KEY, false)
    return false
  }

  await disableDailyReminder()

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: REMINDER_TITLE,
      body: message?.trim() || 'Осталось несколько минут до дневной цели — зайдите и закройте её.',
      data: { screen: '/(tabs)' },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  })

  await cacheSet(REMINDER_ID_KEY, identifier)
  await cacheSet(ENABLED_KEY, true)
  return true
}

export async function disableDailyReminder(): Promise<void> {
  const identifier = await cacheGet<string>(REMINDER_ID_KEY, Number.MAX_SAFE_INTEGER)
  if (identifier) {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined)
  } else {
    // Страховка: снимаем все наши напоминания, если идентификатор потерян.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined)
  }
  await cacheSet(REMINDER_ID_KEY, null)
  await cacheSet(ENABLED_KEY, false)
}
