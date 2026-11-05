// Утилиты web: всё переносимое живёт в @goacademy/shared-utils, здесь —
// только Tailwind-специфичная склейка классов и реэкспорт общих функций,
// чтобы существующие импорты `@/lib/utils` продолжали работать.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export * from '@shared/utils'

/** Объединяет CSS-классы с учётом приоритетов Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
