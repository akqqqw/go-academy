// @goacademy/shared-content
//
// Работа со структурой курса на клиентах: плоский список уроков, поиск модуля,
// навигация «предыдущий/следующий», фильтры. Сами материалы (Markdown, задания,
// колоды, викторины) живут в каталоге content/ и приходят с сервера — здесь
// только производные структуры, чтобы web и mobile строили одинаковую навигацию
// и одинаково считали прогресс по модулям.

import type { CourseModule, LessonMeta } from '@shared/types'

/** Отметка о прохождении уроков: id → статус из аккаунта. */
export type LessonStatusMap = Record<string, string | undefined>

export interface FlatLesson extends LessonMeta {
  /** Порядковый номер урока во всём курсе — для «урок 12 из 104». */
  position: number
}

/** Плоский список уроков курса в порядке прохождения. */
export function flattenLessons(modules: CourseModule[]): FlatLesson[] {
  const lessons: FlatLesson[] = []
  for (const module of modules) {
    for (const lesson of module.lessons) {
      lessons.push({ ...lesson, position: lessons.length + 1 })
    }
  }
  return lessons
}

/** Модуль по идентификатору урока. */
export function moduleOfLesson(modules: CourseModule[], lessonId: string): CourseModule | null {
  return (
    modules.find((module) => module.lessons.some((lesson) => lesson.id === lessonId)) ?? null
  )
}

/** Прогресс модуля по статусам уроков: завершено / всего / процент. */
export function moduleProgress(module: CourseModule, statuses: LessonStatusMap) {
  const total = module.lessons.length
  const completed = module.lessons.filter(
    (lesson) => statuses[lesson.id] === 'completed',
  ).length
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

/** Статус урока для интерфейса: не начат / в процессе / завершён. */
export function lessonState(
  lesson: LessonMeta,
  statuses: LessonStatusMap,
): 'not_started' | 'in_progress' | 'completed' {
  const status = statuses[lesson.id] ?? lesson.status
  if (status === 'completed') return 'completed'
  if (status === 'in_progress') return 'in_progress'
  return 'not_started'
}

/** Соседние уроки в плоском списке; учитывает доступность. */
export function neighbours(lessons: FlatLesson[], lessonId: string) {
  const index = lessons.findIndex((lesson) => lesson.id === lessonId)
  if (index === -1) return { prev: null, next: null }
  const prev = lessons.slice(0, index).reverse().find((lesson) => lesson.available) ?? null
  const next = lessons.slice(index + 1).find((lesson) => lesson.available) ?? null
  return { prev, next }
}

/** Следующий незавершённый урок — цель карточки «Продолжить». */
export function firstUnfinished(lessons: FlatLesson[], statuses: LessonStatusMap) {
  return (
    lessons.find((lesson) => lesson.available && lessonState(lesson, statuses) !== 'completed') ??
    lessons.find((lesson) => lesson.available) ??
    null
  )
}

/** Поиск по названию и описанию: одинаковый для web и mobile. */
export function searchLessons(lessons: FlatLesson[], query: string): FlatLesson[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return lessons
  return lessons.filter(
    (lesson) =>
      lesson.title.toLowerCase().includes(normalized) ||
      lesson.summary.toLowerCase().includes(normalized) ||
      lesson.id.includes(normalized),
  )
}

/** Фильтр по уровню модуля ('beginner' | 'intermediate' | 'advanced'). */
export function filterModules(modules: CourseModule[], level: string | null): CourseModule[] {
  if (!level) return modules
  return modules.filter((module) => module.level === level)
}

/** Итоги курса: уроки, готовые уроки, минуты, прогресс в процентах. */
export function courseSummary(modules: CourseModule[], statuses: LessonStatusMap) {
  const lessons = flattenLessons(modules)
  const completed = lessons.filter((lesson) => lessonState(lesson, statuses) === 'completed').length
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)
  return {
    modules: modules.length,
    lessons: lessons.length,
    completed,
    minutes,
    percent: lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0,
  }
}
