import { getDatabase } from '@/db/database'

// Кэш ответов API и локальный прогресс чтения.
//
// Правило: кэш — производные данные. Если запись повреждена или устарела,
// она молча перезаписывается; решения принимает сервер.

interface CacheRow {
  value: string
  updated_at: number
}

/** Сколько живёт запись кэша, если явно не указано иное (мс). */
const DEFAULT_TTL = 1000 * 60 * 60 * 24 // сутки

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO cache_entries (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value),
    Date.now(),
  )
}

/** Читает кэш; возвращает null, если записи нет или она старше ttl. */
export async function cacheGet<T>(key: string, ttl = DEFAULT_TTL): Promise<T | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<CacheRow>(
    'SELECT value, updated_at FROM cache_entries WHERE key = ?',
    key,
  )
  if (!row) return null
  if (ttl > 0 && Date.now() - row.updated_at > ttl) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

/** Время последнего обновления записи (0, если её нет). */
export async function cacheUpdatedAt(key: string): Promise<number> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM cache_entries WHERE key = ?',
    key,
  )
  return row?.updated_at ?? 0
}

export interface LocalLessonProgress {
  lesson_id: string
  status: 'not_started' | 'in_progress' | 'completed'
  scroll: number
  updated_at: number
}

/** Позиция чтения урока: сохраняется при прокрутке и восстанавливается. */
export async function saveLessonScroll(lessonId: string, scroll: number): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO lesson_progress (lesson_id, status, scroll, updated_at) VALUES (?, 'in_progress', ?, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET scroll = excluded.scroll, updated_at = excluded.updated_at`,
    lessonId,
    Math.max(0, Math.min(1, scroll)),
    Date.now(),
  )
}

export async function setLocalLessonStatus(
  lessonId: string,
  status: LocalLessonProgress['status'],
): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO lesson_progress (lesson_id, status, scroll, updated_at) VALUES (?, ?, 0, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    lessonId,
    status,
    Date.now(),
  )
}

export async function getLocalLessonProgress(lessonId: string): Promise<LocalLessonProgress | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<LocalLessonProgress>(
    'SELECT lesson_id, status, scroll, updated_at FROM lesson_progress WHERE lesson_id = ?',
    lessonId,
  )
  return row ?? null
}

/** Все локальные статусы уроков: используются, когда сервер недоступен. */
export async function allLocalLessonStatuses(): Promise<Record<string, string>> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ lesson_id: string; status: string }>(
    'SELECT lesson_id, status FROM lesson_progress',
  )
  return Object.fromEntries(rows.map((row) => [row.lesson_id, row.status]))
}

/** Настройки, доступные офлайн (тема, цели). */
export async function cacheSettings(value: unknown): Promise<void> {
  await cacheSet('settings', value)
}
