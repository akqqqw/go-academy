// Тесты общих пакетов (@shared/*). Запускаются из frontend: это тот же
// vitest, что и для web, поэтому отдельный раннер для пакетов не нужен.
import { describe, expect, it } from 'vitest'

import { courseSummary, flattenLessons, moduleProgress, neighbours, searchLessons } from '@shared/content'
import {
  calculateStreak,
  clamp,
  percent,
  planItemRatio,
  planProgress,
  reviewCard,
  studySummary,
} from '@shared/learning'
import type { CourseModule, PlanItem, Snapshot } from '@shared/types'
import {
  normalizeGoal,
  normalizeStudySeconds,
  validateCodeSize,
  validateEmail,
  validateLogin,
  validateNote,
  validatePassword,
  validateRegistration,
} from '@shared/validation'

describe('shared-learning: проценты', () => {
  it('не выходит за границы 0..100', () => {
    expect(percent(0, 0)).toBe(0)
    expect(percent(5, 0)).toBe(0)
    expect(percent(10, 4)).toBe(100)
    expect(percent(1, 3)).toBe(33)
  })

  it('кламп работает с NaN и обратным порядком границ', () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })
})

describe('shared-learning: план на день', () => {
  const plan = (overrides: Partial<PlanItem>[] = []): PlanItem[] =>
    overrides.map((item, index) => ({
      id: `item-${index}`,
      label: 'Пункт',
      current: 0,
      target: 1,
      unit: '',
      done: false,
      route: '/',
      ...item,
    }))

  it('доля пункта не превышает единицу', () => {
    expect(planItemRatio({ current: 4, target: 3, done: false })).toBe(1)
    expect(planItemRatio({ current: 0, target: 0, done: true })).toBe(1)
    expect(planItemRatio({ current: 0, target: 0, done: false })).toBe(0)
  })

  it('общий прогресс считается по пунктам, а не по минутам', () => {
    const items = plan([{ done: true }, { done: false }, { done: true }, { done: false }])
    expect(planProgress(items)).toEqual({ done: 2, total: 4, percent: 50 })
    expect(planProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('shared-learning: время обучения', () => {
  it('сегодняшнее и общее время не смешиваются', () => {
    const snapshot = {
      study: { total_seconds: 7200, today_seconds: 600, total_minutes: 120, today_minutes: 10 },
      goals: { minutes: 15, exercises: 3, cards: 10 },
    } satisfies Pick<Snapshot, 'study' | 'goals'>

    const summary = studySummary(snapshot)
    expect(summary.todayMinutes).toBe(10)
    expect(summary.totalMinutes).toBe(120)
    expect(summary.goalPercent).toBe(67)
    expect(summary.remainingMinutes).toBe(5)
  })

  it('при выполненной цели остаток — ноль', () => {
    const summary = studySummary({
      study: { total_seconds: 0, today_seconds: 0, total_minutes: 0, today_minutes: 40 },
      goals: { minutes: 15, exercises: 3, cards: 10 },
    })
    expect(summary.goalPercent).toBe(100)
    expect(summary.remainingMinutes).toBe(0)
  })
})

describe('shared-learning: серия дней', () => {
  const today = new Date(2026, 10, 5, 12) // 5 ноября 2026

  it('считает серию, включая сегодняшний день', () => {
    const streak = calculateStreak(['2026-11-03', '2026-11-04', '2026-11-05'], today)
    expect(streak).toEqual({ current: 3, longest: 3, todayActive: true })
  })

  it('не рвёт серию, пока сегодняшний день ещё не закрыт', () => {
    const streak = calculateStreak(['2026-11-03', '2026-11-04'], today)
    expect(streak.current).toBe(2)
    expect(streak.todayActive).toBe(false)
  })

  it('находит самый длинный отрезок и игнорирует разрывы', () => {
    const streak = calculateStreak(
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-11-05'],
      today,
    )
    expect(streak.longest).toBe(3)
    expect(streak.current).toBe(1)
  })

  it('пустая история даёт нули', () => {
    expect(calculateStreak([], today)).toEqual({ current: 0, longest: 0, todayActive: false })
  })
})

describe('shared-learning: SM-2', () => {
  const now = new Date('2026-11-05T10:00:00Z')

  it('первый хороший ответ даёт интервал 1 день', () => {
    const next = reviewCard(
      { ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 },
      'good',
      now,
    )
    expect(next.interval_days).toBe(1)
    expect(next.repetitions).toBe(1)
    expect(next.due_at).toBe('2026-11-06T10:00:00.000Z')
  })

  it('второй ответ даёт 6 дней, дальше интервал растёт', () => {
    const second = reviewCard({ ease: 2.5, interval_days: 1, repetitions: 1, lapses: 0 }, 'good', now)
    expect(second.interval_days).toBe(6)
    const third = reviewCard(second, 'good', now)
    expect(third.interval_days).toBeGreaterThan(6)
  })

  it('«снова» сбрасывает повторения и увеличивает число срывов', () => {
    const next = reviewCard(
      { ease: 2.5, interval_days: 20, repetitions: 4, lapses: 1 },
      'again',
      now,
    )
    expect(next.repetitions).toBe(0)
    expect(next.interval_days).toBe(1)
    expect(next.lapses).toBe(2)
    expect(next.ease).toBeGreaterThanOrEqual(1.3)
  })

  it('сложность не опускается ниже 1.3 ни на одной оценке', () => {
    let state = { ease: 1.35, interval_days: 3, repetitions: 2, lapses: 0 }
    for (let index = 0; index < 10; index += 1) {
      state = { ...state, ...reviewCard(state, 'again', now) }
    }
    expect(state.ease).toBe(1.3)
  })
})

describe('shared-validation', () => {
  it('проверяет email и пароль', () => {
    expect(validateEmail('user@example.com')).toBeNull()
    expect(validateEmail('user@')).not.toBeNull()
    expect(validateEmail(' ')).not.toBeNull()
    expect(validatePassword('12345')).not.toBeNull()
    expect(validatePassword('123456')).toBeNull()
    expect(validateLogin('bad', '123456')).not.toBeNull()
  })

  it('требует совпадения паролей при регистрации', () => {
    expect(validateRegistration('a@b.co', '123456', '123456')).toBeNull()
    expect(validateRegistration('a@b.co', '123456', '654321')).toBe('Пароли не совпадают.')
  })

  it('нормализует цели в допустимый диапазон', () => {
    expect(normalizeGoal('minutes', 30)).toEqual({ value: 30, error: null })
    expect(normalizeGoal('minutes', 1000).value).toBe(240)
    expect(normalizeGoal('exercises', 0).value).toBe(1)
    expect(normalizeGoal('cards', Number.NaN).error).not.toBeNull()
  })

  it('проверяет заметку и размер кода', () => {
    expect(validateNote('', '  ')).not.toBeNull()
    expect(validateNote('Заголовок', 'текст')).toBeNull()
    expect(validateCodeSize('')).not.toBeNull()
    expect(validateCodeSize('package main')).toBeNull()
    expect(validateCodeSize('x'.repeat(300 * 1024))).not.toBeNull()
  })

  it('ограничивает heartbeat времени обучения', () => {
    expect(normalizeStudySeconds(5000)).toBe(900)
    expect(normalizeStudySeconds(-10)).toBe(0)
    expect(normalizeStudySeconds(Number.NaN)).toBe(0)
  })
})

describe('shared-content', () => {
  const modules: CourseModule[] = [
    {
      id: 'm01',
      number: 1,
      title: 'Введение',
      summary: 'Старт',
      level: 'beginner',
      minutes: 30,
      ready: 2,
      progress: 0,
      lessons: [
        { id: 'm01-01', module_id: 'm01', number: 1, title: 'Что такое Go', summary: 'История', minutes: 10, available: true },
        { id: 'm01-02', module_id: 'm01', number: 2, title: 'Установка', summary: 'SDK', minutes: 20, available: true },
      ],
    },
    {
      id: 'm02',
      number: 2,
      title: 'Основы',
      summary: 'Типы',
      level: 'intermediate',
      minutes: 15,
      ready: 1,
      progress: 0,
      lessons: [
        { id: 'm02-01', module_id: 'm02', number: 1, title: 'Переменные', summary: 'var', minutes: 15, available: false },
      ],
    },
  ]

  it('разворачивает уроки в плоский список с позициями', () => {
    const lessons = flattenLessons(modules)
    expect(lessons.map((lesson) => lesson.id)).toEqual(['m01-01', 'm01-02', 'm02-01'])
    expect(lessons[2].position).toBe(3)
  })

  it('считает прогресс модуля по статусам', () => {
    const progress = moduleProgress(modules[0], { 'm01-01': 'completed' })
    expect(progress).toEqual({ completed: 1, total: 2, percent: 50 })
  })

  it('навигация пропускает недоступные уроки', () => {
    const lessons = flattenLessons(modules)
    expect(neighbours(lessons, 'm01-01').next?.id).toBe('m01-02')
    expect(neighbours(lessons, 'm01-02').next).toBeNull()
    expect(neighbours(lessons, 'unknown').next).toBeNull()
  })

  it('ищет уроки по названию и описанию', () => {
    const lessons = flattenLessons(modules)
    expect(searchLessons(lessons, 'установка')).toHaveLength(1)
    expect(searchLessons(lessons, '')).toHaveLength(3)
    expect(searchLessons(lessons, 'нет такого')).toHaveLength(0)
  })

  it('сводит итоги курса', () => {
    const summary = courseSummary(modules, { 'm01-01': 'completed', 'm01-02': 'completed' })
    expect(summary).toEqual({ modules: 2, lessons: 3, completed: 2, minutes: 45, percent: 67 })
  })
})
