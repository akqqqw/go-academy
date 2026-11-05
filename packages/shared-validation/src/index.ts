// @goacademy/shared-validation
//
// Проверки, которые должны одинаково работать в web и mobile: формы входа,
// настройки, заметки, код. Сервер проверяет то же самое повторно — клиентские
// проверки нужны только для быстрой обратной связи, а не ради безопасности.

import { LIMITS } from '@shared/types'

/** Результат проверки: первое сообщение об ошибке или null. */
export type ValidationResult = string | null

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Простая проверка email — совпадает с тем, что принимает Supabase Auth. */
export function validateEmail(email: string): ValidationResult {
  const value = email.trim()
  if (!value) return 'Введите email.'
  if (!EMAIL_PATTERN.test(value)) return 'Похоже, в email опечатка.'
  if (value.length > 254) return 'Email слишком длинный.'
  return null
}

/** Минимальная длина пароля задана настройками Supabase-проекта. */
export function validatePassword(password: string): ValidationResult {
  if (!password) return 'Введите пароль.'
  if (password.length < LIMITS.passwordMin) {
    return `Пароль должен быть не короче ${LIMITS.passwordMin} символов.`
  }
  if (password.length > 128) return 'Пароль слишком длинный.'
  return null
}

/** Пароль и его повтор должны совпадать. */
export function validatePasswordConfirm(password: string, confirm: string): ValidationResult {
  if (password !== confirm) return 'Пароли не совпадают.'
  return null
}

/** Проверка входа целиком: возвращает первую ошибку формы. */
export function validateLogin(email: string, password: string): ValidationResult {
  return validateEmail(email) ?? validatePassword(password)
}

/** Проверка регистрации целиком. */
export function validateRegistration(
  email: string,
  password: string,
  confirm: string,
): ValidationResult {
  return validateEmail(email) ?? validatePassword(password) ?? validatePasswordConfirm(password, confirm)
}

/** Диапазоны дневных целей: совпадают с ограничениями сервера. */
export const GOAL_RANGES = {
  minutes: { min: 5, max: 240 },
  exercises: { min: 1, max: 20 },
  cards: { min: 5, max: 100 },
} as const

export type GoalKey = keyof typeof GOAL_RANGES

/** Проверяет значение дневной цели и возвращает нормализованное число. */
export function normalizeGoal(key: GoalKey, value: number): { value: number; error: ValidationResult } {
  const range = GOAL_RANGES[key]
  if (!Number.isFinite(value)) {
    return { value: range.min, error: 'Это должно быть число.' }
  }
  if (value < range.min || value > range.max) {
    return {
      value: Math.min(range.max, Math.max(range.min, Math.round(value))),
      error: `Допустимо от ${range.min} до ${range.max}.`,
    }
  }
  return { value: Math.round(value), error: null }
}

/** Заметка: заголовок и тело. */
export function validateNote(title: string, body: string): ValidationResult {
  if (!title.trim() && !body.trim()) return 'Заметка пустая — нечего сохранять.'
  if (title.length > 200) return 'Заголовок длиннее 200 символов.'
  if (body.length > LIMITS.noteBody) return 'Текст заметки слишком длинный.'
  return null
}

/** Размер исходника Go в байтах — с запасом на многобайтовые символы. */
export function validateCodeSize(code: string): ValidationResult {
  const bytes = new TextEncoder().encode(code).length
  if (bytes === 0) return 'Код пустой.'
  if (bytes > LIMITS.codeBytes) {
    return `Код больше ${Math.round(LIMITS.codeBytes / 1024)} КБ — сократите его.`
  }
  return null
}

/** Пинг времени обучения: сервер ждёт 1..900 секунд. */
export function normalizeStudySeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0
  return Math.min(LIMITS.studyPingSeconds, Math.max(0, Math.round(seconds)))
}
