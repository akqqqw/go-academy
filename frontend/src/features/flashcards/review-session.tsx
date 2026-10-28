import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Eye,
  Lightbulb,
  Loader2,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { useFlashcardQueue } from '@/services/queries'
import type { CardGrade, Flashcard, FlashcardStats } from '@/types'

const GRADES: { id: CardGrade; label: string; hint: string; className: string; key: string }[] = [
  { id: 'again', label: 'Снова', hint: 'через 10 минут', className: 'border-danger/40 bg-danger-soft/60 text-danger hover:bg-danger-soft', key: '1' },
  { id: 'hard', label: 'Трудно', hint: 'короче интервал', className: 'border-warning/40 bg-warning-soft/60 text-warning hover:bg-warning-soft', key: '2' },
  { id: 'good', label: 'Хорошо', hint: 'обычный интервал', className: 'border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft/80', key: '3' },
  { id: 'easy', label: 'Легко', hint: 'дольше интервал', className: 'border-success/40 bg-success-soft/60 text-success hover:bg-success-soft', key: '4' },
]

interface SessionResult {
  grades: Record<CardGrade, number>
  cards: number
  startedAt: number
}

interface ReviewSessionProps {
  deckId: string
  title: string
  onClose: () => void
  onStats?: (stats: FlashcardStats) => void
}

/**
 * ReviewSession — сессия повторения колоды.
 *
 * Очередь приходит с сервера: карточки, у которых наступил срок. Оценка
 * «Снова» возвращает карточку в конец текущей сессии и планирует её на
 * ближайшее время, остальные оценки уводят карточку в будущее.
 */
export function ReviewSession({ deckId, title, onClose, onStats }: ReviewSessionProps) {
  const queryClient = useQueryClient()
  const queueQuery = useFlashcardQueue(deckId, 20)

  const [cards, setCards] = useState<Flashcard[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [startedAt] = useState(() => Date.now())

  // Очередь загружена: раскладываем её в локальное состояние сессии.
  useEffect(() => {
    if (!queueQuery.data || loaded) return
    setCards(queueQuery.data.cards)
    setLoaded(true)
  }, [loaded, queueQuery.data])

  const current = cards[index]
  const total = cards.length
  const passed = useMemo(
    () => Object.values(result?.grades ?? {}).reduce((sum, value) => sum + value, 0),
    [result],
  )

  const finish = useCallback(
    (grades: Record<CardGrade, number>) => {
      setResult({ grades, cards: total, startedAt })
      void queryClient.invalidateQueries({ queryKey: ['flashcards'] })
    },
    [queryClient, startedAt, total],
  )

  const grade = useCallback(
    async (value: CardGrade) => {
      if (!current || saving) return
      setSaving(true)
      try {
        const response = await api.reviewFlashcard(current.id, value)
        onStats?.(response.stats)
        const nextGrades = { ...(result?.grades ?? { again: 0, hard: 0, good: 0, easy: 0 }) }
        nextGrades[value] += 1

        let nextCards = cards
        if (value === 'again') {
          // Карточка вернётся в этой же сессии, в конец очереди.
          nextCards = [...cards, response.card]
          setCards(nextCards)
        }
        const nextIndex = index + 1
        setIndex(nextIndex)
        setRevealed(false)
        setHint(false)

        if (nextIndex >= nextCards.length) {
          finish(nextGrades)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось сохранить повторение')
      } finally {
        setSaving(false)
      }
    },
    [cards, current, finish, index, onStats, result?.grades, saving],
  )

  const restart = async () => {
    setCards([])
    setIndex(0)
    setRevealed(false)
    setHint(false)
    setResult(null)
    setLoaded(false)
    try {
      // Берём очередь заново напрямую: кеш после сессии уже неактуален.
      const fresh = await api.flashcardQueue({ deck: deckId || undefined, limit: 20 })
      setCards(fresh.cards)
      setLoaded(true)
      void queryClient.invalidateQueries({ queryKey: ['flashcard-queue'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить очередь')
      setLoaded(true)
    }
  }

  // Клавиатура: пробел — показать ответ, 1–4 — оценка.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!current) return
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        if (!revealed) setRevealed(true)
        return
      }
      if (!revealed) return
      const found = GRADES.find((item) => item.key === event.key)
      if (found) {
        event.preventDefault()
        void grade(found.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, grade, revealed])

  const close = () => {
    void queryClient.invalidateQueries({ queryKey: ['flashcards'] })
    void queryClient.invalidateQueries({ queryKey: ['flashcard-queue'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-sm">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <Brain className="size-4 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-fg">{title}</p>
          <p className="text-[11px] text-fg-subtle">
            {result
              ? `Сессия завершена · ${passed} ${plural(passed, 'повторение', 'повторения', 'повторений')}`
              : `${Math.min(index + 1, total)} из ${total} · интервальное повторение`}
          </p>
        </div>
        <div className="ml-4 hidden min-w-[160px] flex-1 sm:block">
          <Progress
            value={total > 0 ? Math.round((Math.min(index, total) / total) * 100) : 0}
            height={5}
            label="Прогресс сессии"
          />
        </div>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={close}>
          <X className="size-3.5" />
          Закрыть
        </Button>
      </header>

      <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-6">
        <div className="w-full max-w-[680px]">
          {queueQuery.isPending || !loaded ? (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-6 text-[13px] text-fg-muted">
              <Loader2 className="size-4 animate-spin text-primary" />
              Готовим карточки…
            </div>
          ) : null}

          {queueQuery.isError ? (
            <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-5 text-[13px] text-fg">
              Не удалось получить очередь: {queueQuery.error.message}
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void queueQuery.refetch()}>
                Повторить запрос
              </Button>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center gap-2">
                <Trophy className="size-5 text-warning" />
                <h2 className="text-[16px] font-semibold text-fg">Сессия завершена</h2>
              </div>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                Повторено карточек: {result.cards}. Следующие повторения назначены автоматически.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map((item) => (
                  <div key={item.id} className="rounded-lg border border-line bg-surface-inset px-3 py-2">
                    <p className="text-[11px] text-fg-subtle">{item.label}</p>
                    <p className="text-[18px] font-semibold tabular-nums text-fg">{result.grades[item.id]}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void restart()}>
                  <RotateCcw className="size-3.5" />
                  Проверить, что осталось
                </Button>
                <Button size="sm" variant="outline" onClick={close}>
                  <CheckCircle2 className="size-3.5" />
                  К колодам
                </Button>
                <span className="text-[11px] text-fg-subtle">
                  Сессия заняла {Math.max(1, Math.round((Date.now() - result.startedAt) / 60000))} мин
                </span>
              </div>
            </div>
          ) : null}

          {!result && loaded && total === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
              <CheckCircle2 className="mx-auto size-7 text-success" />
              <p className="mt-2 text-[14px] font-medium text-fg">На сегодня всё повторено</p>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                Новые и просроченные карточки закончились. Загляните позже — интервалы растут по SM-2.
              </p>
              <Button size="sm" variant="outline" className="mt-4" onClick={close}>
                Вернуться к колодам
              </Button>
            </div>
          ) : null}

          {!result && current ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{current.deck_id}</Badge>
                  {current.new ? <Badge variant="primary">новая</Badge> : null}
                  {current.learning ? <Badge variant="warning">в изучении</Badge> : null}
                  {current.custom ? <Badge variant="violet">своя</Badge> : null}
                  {current.reviews > 0 ? (
                    <span className="text-[11px] text-fg-subtle">
                      показана {current.reviews} {plural(current.reviews, 'раз', 'раза', 'раз')}
                    </span>
                  ) : null}
                </div>

                <p className="mt-4 whitespace-pre-wrap text-[17px] leading-relaxed font-medium text-fg">
                  {current.front}
                </p>

                {!revealed ? (
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <Button onClick={() => setRevealed(true)}>
                      <Eye className="size-4" />
                      Показать ответ
                    </Button>
                    <span className="text-[11.5px] text-fg-subtle">Пробел</span>
                    {current.hint ? (
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setHint((value) => !value)}>
                        <Lightbulb className="size-3.5" />
                        Подсказка
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-line bg-surface-inset p-4">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-fg-subtle">Ответ</p>
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">{current.back}</p>
                  </div>
                )}

                {hint && current.hint && !revealed ? (
                  <p className="mt-2 text-[12px] text-fg-muted">Подсказка: {current.hint}</p>
                ) : null}
              </div>

              {revealed ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={saving}
                      onClick={() => void grade(item.id)}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60',
                        item.className,
                      )}
                    >
                      <span className="flex w-full items-center justify-between text-[13px] font-medium">
                        {item.label}
                        <span className="rounded bg-white/40 px-1 text-[10px] font-normal dark:bg-black/20">
                          {item.key}
                        </span>
                      </span>
                      <span className="text-[10.5px] opacity-80">{item.hint}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[11px] text-fg-subtle">
                <span>
                  SM-2: сложность {current.ease.toFixed(2)}, интервал {current.interval_days}{' '}
                  {plural(current.interval_days, 'день', 'дня', 'дней')}
                </span>
                {index + 1 < total ? (
                  <span className="inline-flex items-center gap-1">
                    осталось {total - index - 1}
                    <ArrowRight className="size-3" />
                  </span>
                ) : (
                  <span>последняя в сессии</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
