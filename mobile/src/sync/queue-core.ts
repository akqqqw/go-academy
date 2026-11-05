// Чистая логика очереди синхронизации: без React Native и без SQLite,
// поэтому её можно покрыть обычными unit-тестами (vitest).
//
// Модель: каждая отложенная операция имеет op_id (UUID), вид (kind) и payload.
// Повторная отправка безопасна — серверные операции идемпотентны:
//   lesson_opened / lesson_completed — статус перезаписывается значением;
//   lesson_scroll — последнее значение;
//   note_save — последняя версия по updated_at;
//   card_review — сервер считает расписание сам, оценка применяется один раз.

export type PendingKind =
  | 'lesson_opened'
  | 'lesson_completed'
  | 'lesson_scroll'
  | 'study_ping'
  | 'note_save'
  | 'card_review'

export interface PendingOp<TPayload = unknown> {
  op_id: string
  kind: PendingKind
  payload: TPayload
  created_at: number
  attempts: number
  next_try_at: number
  last_error?: string | null
}

/** Паузы между попытками: 2 с, 10 с, 1 мин, 5 мин, 15 мин. */
export const RETRY_DELAYS_MS = [2_000, 10_000, 60_000, 300_000, 900_000] as const

/** Максимум попыток, после которого операция считается «застрявшей». */
export const MAX_ATTEMPTS = 6

/** Задержка перед следующей попыткой для операции с `attempts` сбоями. */
export function retryDelay(attempts: number): number {
  if (attempts <= 0) return 0
  const index = Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)
  return RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!
}

/** Операция готова к отправке прямо сейчас. */
export function isDue(op: Pick<PendingOp, 'next_try_at' | 'attempts'>, now = Date.now()): boolean {
  if (op.attempts >= MAX_ATTEMPTS) return false
  return op.next_try_at <= now
}

/** Результат неудачной попытки: счётчик и время следующей попытки. */
export function onFailure(
  op: Pick<PendingOp, 'attempts'>,
  error: string,
  now = Date.now(),
): { attempts: number; next_try_at: number; last_error: string } {
  const attempts = op.attempts + 1
  return {
    attempts,
    next_try_at: now + retryDelay(attempts),
    last_error: error.slice(0, 500),
  }
}

/**
 * Схлопывание операций одного вида и объекта.
 *
 * Офлайн-пользователь может открыть урок, прокрутить его и завершить — в
 * очередь попали бы три операции. Достаточно отправить последнюю по смыслу:
 *   - lesson_completed вытесняет lesson_opened для того же урока;
 *   - lesson_scroll оставляет только последнее значение;
 *   - study_ping суммируется (но не больше лимита одного пинга).
 */
export function compact(ops: PendingOp[]): PendingOp[] {
  const result: PendingOp[] = []
  const indexByKey = new Map<string, number>()

  for (const op of ops) {
    const key = dedupeKey(op)
    if (!key) {
      result.push(op)
      continue
    }

    if (op.kind === 'study_ping') {
      const existingIndex = indexByKey.get(key)
      if (existingIndex === undefined) {
        indexByKey.set(key, result.length)
        result.push(op)
      } else {
        const existing = result[existingIndex]!
        const seconds = Number((existing.payload as { seconds?: number })?.seconds ?? 0)
        const added = Number((op.payload as { seconds?: number })?.seconds ?? 0)
        result[existingIndex] = {
          ...existing,
          payload: { seconds: Math.min(900, seconds + added) },
        }
      }
      continue
    }

    const priority = priorityOf(op.kind)
    const existingIndex = indexByKey.get(key)
    if (existingIndex === undefined) {
      indexByKey.set(key, result.length)
      result.push(op)
      continue
    }
    const existing = result[existingIndex]!
    if (priorityOf(existing.kind) <= priority) {
      // Новая операция важнее (или равна) — заменяем, но сохраняем op_id новой,
      // чтобы сервер видел свежую версию.
      result[existingIndex] = op
    }
  }

  return result.sort((a, b) => a.created_at - b.created_at)
}

function dedupeKey(op: PendingOp): string | null {
  switch (op.kind) {
    case 'lesson_opened':
    case 'lesson_completed':
    case 'lesson_scroll':
      return `lesson:${String((op.payload as { lesson_id?: string })?.lesson_id ?? '')}`
    case 'note_save':
      return `note:${String((op.payload as { id?: string })?.id ?? '')}`
    case 'card_review':
      // Оценки разных карточек не схлопываются: это отдельные события обучения.
      return null
    case 'study_ping':
      return 'study'
    default:
      return null
  }
}

function priorityOf(kind: PendingKind): number {
  switch (kind) {
    case 'lesson_opened':
      return 1
    case 'lesson_scroll':
      return 2
    case 'lesson_completed':
      return 3
    default:
      return 0
  }
}

/**
 * Разрешение конфликта «последняя запись побеждает» по updated_at.
 * Возвращает true, если локальная версия должна уйти на сервер.
 */
export function localWins(localUpdatedAt: number, remoteUpdatedAt: number): boolean {
  return localUpdatedAt >= remoteUpdatedAt
}

/** Человекочитаемое состояние синхронизации для интерфейса. */
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export function describePending(count: number): string {
  if (count === 0) return 'Все изменения сохранены'
  if (count === 1) return '1 изменение ждёт синхронизации'
  return `${count} изменений ждут синхронизации`
}
