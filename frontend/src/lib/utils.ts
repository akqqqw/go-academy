import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Объединяет CSS-классы с учётом приоритетов Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Склоняет существительное по числу: 1 урок, 2 урока, 5 уроков. */
export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10
  const mod100 = Math.abs(count) % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** «7 уроков» — число вместе со склонённым словом. */
export function pluralize(count: number, one: string, few: string, many: string) {
  return `${count} ${plural(count, one, few, many)}`
}

/** Форматирует длительность в секундах как «2 ч 15 мин» / «18 мин» / «40 с». */
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`
}

/** Форматирует минуты как «1 ч 20 мин». */
export function formatMinutes(minutes: number) {
  return formatDuration(minutes * 60)
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' })
const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** «Сегодня, 14:05» / «Вчера, 09:12» / «12 марта». */
export function formatRelativeDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000)
  if (diffDays === 0) return `Сегодня, ${timeFormatter.format(date)}`
  if (diffDays === 1) return `Вчера, ${timeFormatter.format(date)}`
  if (diffDays > 1 && diffDays < 7) return `${diffDays} дн. назад`
  return dateFormatter.format(date)
}

/** «Пятница, 26 октября» — приветствие на главной. */
export function formatTodayGreeting(date = new Date()) {
  const weekday = weekdayFormatter.format(date)
  const month = dateFormatter.format(date)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${month}`
}

/** Полная дата с годом. */
export function formatFullDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return fullDateFormatter.format(date)
}

/** «26.10.2026, 14:05». */
export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString('ru-RU')}, ${timeFormatter.format(date)}`
}

/** Размер файла в человекочитаемом виде. */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Уровень модуля курса на русском. */
export function levelLabel(level: string) {
  switch (level) {
    case 'beginner':
      return 'Начальный'
    case 'intermediate':
      return 'Средний'
    case 'advanced':
      return 'Продвинутый'
    default:
      return level
  }
}

/** Часть суток для приветствия. */
export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}
