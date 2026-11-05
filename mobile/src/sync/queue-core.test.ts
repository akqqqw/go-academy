import { describe, expect, it } from 'vitest'

import {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  compact,
  describePending,
  isDue,
  localWins,
  onFailure,
  retryDelay,
  type PendingOp,
} from './queue-core'

function op(partial: Partial<PendingOp> & Pick<PendingOp, 'kind' | 'payload'>): PendingOp {
  return {
    op_id: Math.random().toString(36).slice(2),
    created_at: 0,
    attempts: 0,
    next_try_at: 0,
    last_error: null,
    ...partial,
  }
}

describe('retryDelay', () => {
  it('не ждёт перед первой попыткой', () => {
    expect(retryDelay(0)).toBe(0)
  })

  it('растёт по расписанию и упирается в последнюю паузу', () => {
    expect(retryDelay(1)).toBe(RETRY_DELAYS_MS[0])
    expect(retryDelay(2)).toBe(RETRY_DELAYS_MS[1])
    expect(retryDelay(3)).toBe(RETRY_DELAYS_MS[2])
    expect(retryDelay(4)).toBe(RETRY_DELAYS_MS[3])
    expect(retryDelay(5)).toBe(RETRY_DELAYS_MS[4])
    expect(retryDelay(6)).toBe(RETRY_DELAYS_MS[4])
    expect(retryDelay(99)).toBe(RETRY_DELAYS_MS[4])
  })
})

describe('isDue', () => {
  it('отправляет операцию, когда время пришло', () => {
    expect(isDue({ attempts: 0, next_try_at: 1_000 }, 1_001)).toBe(true)
  })

  it('не отправляет операцию раньше next_try_at', () => {
    expect(isDue({ attempts: 1, next_try_at: 5_000 }, 4_999)).toBe(false)
  })

  it('считает застрявшей операцию с MAX_ATTEMPTS сбоями', () => {
    expect(isDue({ attempts: MAX_ATTEMPTS, next_try_at: 0 }, 10_000)).toBe(false)
  })
})

describe('onFailure', () => {
  it('увеличивает счётчик и откладывает повтор', () => {
    const result = onFailure({ attempts: 0 }, 'network down', 10_000)
    expect(result.attempts).toBe(1)
    expect(result.next_try_at).toBe(10_000 + RETRY_DELAYS_MS[0])
    expect(result.last_error).toBe('network down')
  })

  it('обрезает длинный текст ошибки, чтобы не раздувать базу', () => {
    const result = onFailure({ attempts: 2 }, 'x'.repeat(2_000), 0)
    expect(result.last_error.length).toBe(500)
    expect(result.attempts).toBe(3)
  })
})

describe('compact', () => {
  it('завершение урока вытесняет его открытие', () => {
    const ops = [
      op({ kind: 'lesson_opened', payload: { lesson_id: 'm1l1' }, created_at: 1 }),
      op({ kind: 'lesson_completed', payload: { lesson_id: 'm1l1' }, created_at: 2 }),
    ]
    const result = compact(ops)
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('lesson_completed')
  })

  it('не понижает статус: открытие после завершения не заменяет его', () => {
    const ops = [
      op({ kind: 'lesson_completed', payload: { lesson_id: 'm1l1' }, created_at: 1 }),
      op({ kind: 'lesson_opened', payload: { lesson_id: 'm1l1' }, created_at: 2 }),
    ]
    const result = compact(ops)
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('lesson_completed')
    expect(result[0]?.created_at).toBe(1)
  })

  it('оставляет только последнюю позицию прокрутки урока', () => {
    const ops = [
      op({ kind: 'lesson_scroll', payload: { lesson_id: 'm1l1', scroll: 0.2 }, created_at: 1 }),
      op({ kind: 'lesson_scroll', payload: { lesson_id: 'm1l1', scroll: 0.9 }, created_at: 2 }),
    ]
    const result = compact(ops)
    expect(result).toHaveLength(1)
    expect(result[0]?.payload).toEqual({ lesson_id: 'm1l1', scroll: 0.9 })
  })

  it('суммирует study_ping с потолком в 900 секунд', () => {
    const ops = [
      op({ kind: 'study_ping', payload: { seconds: 300 }, created_at: 1 }),
      op({ kind: 'study_ping', payload: { seconds: 400 }, created_at: 2 }),
      op({ kind: 'study_ping', payload: { seconds: 500 }, created_at: 3 }),
    ]
    const result = compact(ops)
    expect(result).toHaveLength(1)
    expect(result[0]?.payload).toEqual({ seconds: 900 })
  })

  it('не склеивает оценки разных карточек', () => {
    const ops = [
      op({ kind: 'card_review', payload: { card_id: 'c1', grade: 'good' }, created_at: 1 }),
      op({ kind: 'card_review', payload: { card_id: 'c2', grade: 'again' }, created_at: 2 }),
      op({ kind: 'card_review', payload: { card_id: 'c1', grade: 'easy' }, created_at: 3 }),
    ]
    expect(compact(ops)).toHaveLength(3)
  })

  it('оставляет одну версию заметки — последнюю', () => {
    const ops = [
      op({ kind: 'note_save', payload: { id: 'n1', input: { body: 'v1' } }, created_at: 1 }),
      op({ kind: 'note_save', payload: { id: 'n1', input: { body: 'v2' } }, created_at: 2 }),
    ]
    const result = compact(ops)
    expect(result).toHaveLength(1)
    expect(result[0]?.payload).toEqual({ id: 'n1', input: { body: 'v2' } })
  })

  it('не трогает разные объекты и сортирует по времени', () => {
    const ops = [
      op({ kind: 'lesson_opened', payload: { lesson_id: 'm1l2' }, created_at: 5 }),
      op({ kind: 'lesson_opened', payload: { lesson_id: 'm1l1' }, created_at: 1 }),
      op({ kind: 'card_review', payload: { card_id: 'c9', grade: 'good' }, created_at: 3 }),
    ]
    const result = compact(ops)
    expect(result.map((item) => item.created_at)).toEqual([1, 3, 5])
    expect(result).toHaveLength(3)
  })
})

describe('localWins', () => {
  it('при равных метках времени локальная версия считается свежей', () => {
    expect(localWins(1_000, 1_000)).toBe(true)
  })

  it('уступает более новой серверной версии', () => {
    expect(localWins(1_000, 2_000)).toBe(false)
  })
})

describe('describePending', () => {
  it('объясняет состояние очереди по-русски', () => {
    expect(describePending(0)).toBe('Все изменения сохранены')
    expect(describePending(1)).toBe('1 изменение ждёт синхронизации')
    expect(describePending(4)).toBe('4 изменений ждут синхронизации')
  })
})
