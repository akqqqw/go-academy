// Тексты уведомлений — чистые функции без expo-notifications, чтобы их можно
// было проверить unit-тестами. Уведомление локальное: сервер о расписании не
// знает, поэтому формулировка строится по последнему снимку прогресса.

export interface ReminderInput {
  /** Выполнено пунктов плана на сегодня, в процентах. */
  planPercent: number
  /** Сколько минут осталось до дневной цели по времени. */
  remainingMinutes: number
  /** Сколько карточек ждёт повторения. */
  dueCards: number
}

/** Короткое напоминание: одна мысль, один следующий шаг. */
export function reminderBody(input: ReminderInput): string {
  if (input.remainingMinutes > 0) {
    return `До дневной цели ${input.remainingMinutes} мин — это один короткий урок.`
  }
  if (input.dueCards > 0) {
    return `${input.dueCards} карточек ждут повторения, пока память свежая.`
  }
  if (input.planPercent >= 100) {
    return 'План дня закрыт. Можно немного повторить карточки на завтра.'
  }
  return 'Пять минут практики сегодня сохранят серию.'
}

/** Заголовок напоминания: не пугает, а напоминает о серии. */
export const REMINDER_TITLE = 'Не теряйте серию'

/** Первое уведомление после включения — подтверждает расписание. */
export function reminderScheduleHint(hour: number, minute: number): string {
  const padded = String(minute).padStart(2, '0')
  return `Напоминание включено: каждый день в ${hour}:${padded}`
}
