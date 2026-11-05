import * as Crypto from 'expo-crypto'

import { api } from '@/api/endpoints'
import { getDatabase } from '@/db/database'
import {
  compact,
  isDue,
  onFailure,
  type PendingKind,
  type PendingOp,
} from '@/sync/queue-core'

interface PendingRow {
  op_id: string
  kind: PendingKind
  payload: string
  created_at: number
  attempts: number
  next_try_at: number
  last_error: string | null
}

function toOp(row: PendingRow): PendingOp {
  let payload: unknown = {}
  try {
    payload = JSON.parse(row.payload)
  } catch {
    payload = {}
  }
  return {
    op_id: row.op_id,
    kind: row.kind,
    payload,
    created_at: row.created_at,
    attempts: row.attempts,
    next_try_at: row.next_try_at,
    last_error: row.last_error,
  }
}

/** Добавляет операцию в очередь (немедленно, без ожидания сети). */
export async function enqueue(kind: PendingKind, payload: unknown): Promise<string> {
  const db = await getDatabase()
  const opId = Crypto.randomUUID()
  await db.runAsync(
    `INSERT INTO pending_ops (op_id, kind, payload, created_at, attempts, next_try_at)
     VALUES (?, ?, ?, ?, 0, 0)`,
    opId,
    kind,
    JSON.stringify(payload),
    Date.now(),
  )
  return opId
}

export async function pendingCount(): Promise<number> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM pending_ops')
  return row?.count ?? 0
}

export async function pendingOps(): Promise<PendingOp[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<PendingRow>('SELECT * FROM pending_ops ORDER BY created_at')
  return compact(rows.map(toOp))
}

async function removeOp(opId: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM pending_ops WHERE op_id = ?', opId)
}

async function markFailure(op: PendingOp, message: string): Promise<void> {
  const db = await getDatabase()
  const next = onFailure(op, message)
  await db.runAsync(
    'UPDATE pending_ops SET attempts = ?, next_try_at = ?, last_error = ? WHERE op_id = ?',
    next.attempts,
    next.next_try_at,
    next.last_error,
    op.op_id,
  )
}

/** Отправляет одну операцию на сервер. */
async function send(op: PendingOp): Promise<void> {
  switch (op.kind) {
    case 'lesson_opened': {
      const { lesson_id } = op.payload as { lesson_id: string }
      await api.lessonOpened(lesson_id)
      return
    }
    case 'lesson_completed': {
      const { lesson_id } = op.payload as { lesson_id: string }
      await api.lessonCompleted(lesson_id)
      return
    }
    case 'lesson_scroll':
      // Позиция чтения живёт только локально: серверу она не нужна, а экран
      // восстанавливает её из lesson_progress.
      return
    case 'study_ping': {
      const { seconds } = op.payload as { seconds: number }
      await api.studyPing(seconds)
      return
    }
    case 'note_save': {
      const { id, input } = op.payload as { id: string; input: Record<string, unknown> }
      await api.updateNote(id, input)
      return
    }
    case 'card_review': {
      const { card_id, grade } = op.payload as { card_id: string; grade: 'again' | 'hard' | 'good' | 'easy' }
      await api.review(card_id, grade)
      return
    }
    default:
      return
  }
}

export interface FlushResult {
  sent: number
  failed: number
  remaining: number
}

/**
 * Отправляет готовые операции.
 *
 * Идемпотентность: при обрыве связи сразу после отправки операция останется в
 * очереди и уйдёт повторно. Все серверные обработчики для этих видов операций
 * идемпотентны (статус урока — значение, повторение карточки — оценка,
 * время обучения — прибавка, ограниченная лимитом).
 */
export async function flushQueue(options: { limit?: number } = {}): Promise<FlushResult> {
  const limit = options.limit ?? 25
  const ops = (await pendingOps()).filter((op) => isDue(op)).slice(0, limit)

  let sent = 0
  let failed = 0

  for (const op of ops) {
    try {
      await send(op)
      await removeOp(op.op_id)
      sent += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'не удалось отправить'
      await markFailure(op, message)
      // Сеть недоступна — нет смысла долбить остальные операции в этом проходе.
      if (error instanceof Error && error.name === 'ApiError' && message.includes('Нет связи')) break
    }
  }

  return { sent, failed, remaining: await pendingCount() }
}

/** Убирает «застрявшие» операции (исчерпали попытки) — для ручного сброса. */
export async function clearFailedOps(): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM pending_ops WHERE attempts >= 6')
}
