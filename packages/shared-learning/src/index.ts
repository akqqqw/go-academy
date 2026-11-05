// @goacademy/shared-learning
//
// Логика обучения, которую используют web и mobile: проценты прогресса,
// серия дней, дневной план и пересчёт карточки по SM-2.
//
// Важное правило: сервер остаётся источником правды. Эти функции нужны,
// чтобы клиенты показывали те же числа, что уже посчитал backend, и чтобы
// мобильное приложение могло работать офлайн над локальным кэшем.
// Формулы повторяют backend (internal/progress, internal/storage/flashcards).

import type { CARD_GRADES, PlanItem, Snapshot } from '@shared/types'

/** Процент с защитой от деления на ноль и переполнения диапазона. */
export function percent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0
  return clamp(Math.round((done / total) * 100), 0, 100)
}

/** Ограничивает число диапазоном [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Доля выполнения пункта плана: 0..1.
 * Пункт без цели (target ≤ 1) считается выполненным по флагу done.
 */
export function planItemRatio(item: Pick<PlanItem, 'current' | 'target' | 'done'>): number {
  if (item.done && item.target <= 1) return 1
  if (item.target <= 0) return item.done ? 1 : 0
  return clamp(item.current / item.target, 0, 1)
}

/** Общий прогресс плана на день: сколько пунктов закрыто из всех. */
export function planProgress(plan: PlanItem[]): { done: number; total: number; percent: number } {
  const total = plan.length
  const done = plan.filter((item) => item.done).length
  return { done, total, percent: percent(done, total) }
}

/** Время обучения: сегодня и всего — раздельно, без смешивания. */
export function studySummary(snapshot: Pick<Snapshot, 'study' | 'goals'>) {
  const { study, goals } = snapshot
  return {
    todayMinutes: study.today_minutes,
    totalMinutes: study.total_minutes,
    todaySeconds: study.today_seconds,
    totalSeconds: study.total_seconds,
    goalMinutes: goals.minutes,
    goalPercent: percent(study.today_minutes, goals.minutes),
    remainingMinutes: Math.max(0, goals.minutes - study.today_minutes),
  }
}

/**
 * Серия дней подряд по списку дат активности (формат YYYY-MM-DD).
 *
 * Повторяет серверную логику: серия продолжается, если активность была
 * сегодня или вчера (вчера — чтобы не «терять» серию до конца текущего дня).
 */
export function calculateStreak(
  activeDates: string[],
  today = new Date(),
): { current: number; longest: number; todayActive: boolean } {
  const days = [...new Set(activeDates.map((value) => value.slice(0, 10)))].sort()
  if (days.length === 0) return { current: 0, longest: 0, todayActive: false }

  let longest = 1
  let run = 1
  for (let index = 1; index < days.length; index += 1) {
    const previous = Date.parse(`${days[index - 1]}T00:00:00Z`)
    const current = Date.parse(`${days[index]}T00:00:00Z`)
    if (current - previous === 86_400_000) {
      run += 1
    } else {
      run = 1
    }
    longest = Math.max(longest, run)
  }

  const todayKey = toDateKey(today)
  const yesterdayKey = toDateKey(new Date(today.getTime() - 86_400_000))
  const todayActive = days.includes(todayKey)

  let current = 0
  if (todayActive || days.includes(yesterdayKey)) {
    let cursor = todayActive ? today : new Date(today.getTime() - 86_400_000)
    while (days.includes(toDateKey(cursor))) {
      current += 1
      cursor = new Date(cursor.getTime() - 86_400_000)
    }
  }

  return { current, longest, todayActive }
}

/** Локальная дата в формате YYYY-MM-DD (учитывает часовой пояс устройства). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type CardGrade = (typeof CARD_GRADES)[number]

/** Состояние карточки в SM-2: то же, что хранит backend. */
export interface CardState {
  ease: number
  interval_days: number
  repetitions: number
  lapses: number
  due_at?: string | null
}

/**
 * Пересчёт карточки по SM-2 — зеркало серверной формулы.
 *
 * Нужен для оптимистичного обновления в интерфейсе: после ответа карточка
 * сразу уходит из очереди, а сервер подтверждает расписание. При офлайне
 * оценка кладётся в очередь и применяется локально теми же правилами.
 */
export function reviewCard(card: CardState, grade: CardGrade, now = new Date()): CardState {
  const quality = { again: 0, hard: 3, good: 4, easy: 5 }[grade]
  let ease = card.ease > 0 ? card.ease : 2.5
  let interval = card.interval_days
  let repetitions = card.repetitions
  let lapses = card.lapses

  if (quality < 3) {
    repetitions = 0
    interval = 1
    lapses += 1
    ease = Math.max(1.3, ease - 0.2)
  } else {
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * ease)
    if (grade === 'hard') interval = Math.max(1, Math.round(interval * 0.6))
    if (grade === 'easy') interval = Math.round(interval * 1.3)
    interval = clamp(interval, 1, 365)
    repetitions += 1
  }

  const due = new Date(now.getTime() + interval * 86_400_000)
  return {
    ease: Number(ease.toFixed(2)),
    interval_days: interval,
    repetitions,
    lapses,
    due_at: due.toISOString(),
  }
}

/** Что показать на карточке «Продолжить»: подпись и прогресс модуля. */
export function continueLabel(lesson: {
  module_title: string
  lesson_title: string
  lesson_number: number
  minutes: number
}): string {
  return `${lesson.module_title} · урок ${lesson.lesson_number} · ${lesson.minutes} мин`
}

/** Следующий урок в плоском списке (для навигации «дальше» на мобильном). */
export function nextLessonId(
  lessons: { id: string; available?: boolean }[],
  currentId: string,
): string | null {
  const index = lessons.findIndex((lesson) => lesson.id === currentId)
  if (index === -1) return null
  const next = lessons.slice(index + 1).find((lesson) => lesson.available !== false)
  return next?.id ?? null
}
