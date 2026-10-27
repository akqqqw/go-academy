import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BookOpenCheck,
  Boxes,
  Brain,
  ChevronsLeftRight,
  Flame,
  FunctionSquare,
  GitBranch,
  GitMerge,
  Layers,
  Loader2,
  Plus,
  Repeat2,
  RotateCcw,
  Sparkles,
  Table,
  Target,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ReviewSession } from '@/features/flashcards/review-session'
import { api } from '@/lib/api'
import { cn, levelLabel, plural } from '@/lib/utils'
import { useFlashcards } from '@/services/queries'
import type { FlashcardDeck, FlashcardStats } from '@/types'

const ICONS: Record<string, typeof Brain> = {
  sparkles: Sparkles,
  shapes: Boxes,
  'git-branch': GitBranch,
  'function-square': FunctionSquare,
  layers: Layers,
  table: Table,
  boxes: Boxes,
  plug: ChevronsLeftRight,
  'alert-triangle': TriangleAlert,
  braces: Target,
  'git-merge': GitMerge,
  wrench: Wrench,
}

function formatDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

/** Мини-график повторений за две недели. */
function ActivityStrip({ stats }: { stats: FlashcardStats }) {
  const max = Math.max(...stats.days.map((day) => day.count), 1)
  return (
    <div className="flex items-end gap-1" aria-label="Повторения за две недели">
      {stats.days.map((day) => (
        <div key={day.date} className="group flex flex-1 flex-col items-center gap-1">
          <div
            title={`${formatDay(day.date)}: ${day.count}`}
            className={cn(
              'w-full rounded-sm transition-colors',
              day.count > 0 ? 'bg-primary' : 'bg-surface-muted',
            )}
            style={{ height: `${Math.max(4, Math.round((day.count / max) * 36))}px` }}
          />
          <span className="text-[9px] text-fg-subtle">{formatDay(day.date).slice(0, 2)}</span>
        </div>
      ))}
    </div>
  )
}

function DeckCard({
  deck,
  onStart,
  onAdd,
  onReset,
}: {
  deck: FlashcardDeck
  onStart: () => void
  onAdd: () => void
  onReset: () => void
}) {
  const Icon = ICONS[deck.icon] ?? Brain
  const nothingDue = deck.due === 0

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex h-full flex-col gap-2 pt-3.5 pb-3">
        <div className="flex items-start gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-fg">{deck.title}</p>
            <p className="text-[10.5px] text-fg-subtle">
              Модуль {deck.module} · {levelLabel(deck.level)}
            </p>
          </div>
          {deck.due > 0 ? (
            <Badge variant="primary">
              <Repeat2 className="size-3" />
              {deck.due}
            </Badge>
          ) : (
            <Badge variant="success">готово</Badge>
          )}
        </div>

        <p className="line-clamp-2 min-h-[32px] text-[11.5px] leading-relaxed text-fg-muted">
          {deck.description}
        </p>

        <div className="mt-auto space-y-1.5">
          <Progress value={deck.progress} height={4} label={`Прогресс колоды ${deck.title}`} />
          <div className="flex flex-wrap items-center gap-x-2 text-[10.5px] text-fg-subtle">
            <span>{deck.total} карточек</span>
            <span>· новых {deck.new}</span>
            <span>· выучено {deck.learned}</span>
            {deck.custom > 0 ? <span>· своих {deck.custom}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-7 flex-1" onClick={onStart} disabled={nothingDue}>
            {nothingDue ? (
              'Всё повторено'
            ) : (
              <>
                <Repeat2 className="size-3.5" />
                Повторить
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={onAdd} title="Добавить свою карточку">
            <Plus className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={onReset}
            title="Сбросить прогресс колоды"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function FlashcardsPage() {
  const queryClient = useQueryClient()
  const overview = useFlashcards()

  const [session, setSession] = useState<{ deck: string; title: string } | null>(null)
  const [liveStats, setLiveStats] = useState<FlashcardStats | null>(null)
  const [addDeck, setAddDeck] = useState<FlashcardDeck | null>(null)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [hint, setHint] = useState('')
  const [savingCard, setSavingCard] = useState(false)
  const [resetDeck, setResetDeck] = useState<FlashcardDeck | null>(null)

  const stats = liveStats ?? overview.data?.stats
  const decks = overview.data?.decks ?? []

  const refresh = async () => {
    setLiveStats(null)
    await queryClient.invalidateQueries({ queryKey: ['flashcards'] })
    await queryClient.invalidateQueries({ queryKey: ['flashcard-queue'] })
  }

  const createCard = async () => {
    if (!addDeck) return
    setSavingCard(true)
    try {
      await api.createFlashcard({ deck_id: addDeck.id, front, back, hint })
      toast.success('Карточка добавлена в колоду', {
        description: 'Она сразу попадёт в очередь повторения.',
      })
      setAddDeck(null)
      setFront('')
      setBack('')
      setHint('')
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить карточку')
    } finally {
      setSavingCard(false)
    }
  }

  const confirmReset = async () => {
    if (!resetDeck) return
    try {
      const response = await api.resetDeck(resetDeck.id)
      toast.success(`Прогресс колоды сброшен: ${response.reset} ${plural(response.reset, 'карточка', 'карточки', 'карточек')}`)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сбросить колоду')
    } finally {
      setResetDeck(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Память"
        title="Карточки"
        description="12 колод по темам курса и интервальное повторение SM-2: карточки с ошибками возвращаются чаще, уверенные — реже."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stats && stats.due > 0 ? 'primary' : 'success'}>
              <Brain className="size-3" />
              {stats ? `${stats.due} к повторению` : '…'}
            </Badge>
            <Button
              size="sm"
              onClick={() => setSession({ deck: '', title: 'Все колоды' })}
              disabled={!stats || stats.due === 0}
            >
              <Repeat2 className="size-3.5" />
              Начать повторение
            </Button>
          </div>
        }
      />

      {overview.isPending ? <LoadingState label="Загружаем колоды…" /> : null}
      {overview.isError ? (
        <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
      ) : null}

      {stats ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Всего карточек', value: stats.total, icon: Layers },
            { label: 'К повторению', value: stats.due, icon: Repeat2 },
            { label: 'Выучено', value: stats.learned, icon: BookOpenCheck },
            { label: 'Точность', value: `${stats.accuracy}%`, icon: Target },
          ].map((tile) => (
            <Card key={tile.label}>
              <CardContent className="flex items-center gap-3 pt-3.5 pb-3">
                <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
                  <tile.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{tile.label}</p>
                  <p className="text-lg font-semibold tabular-nums text-fg">{tile.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {stats ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-3.5 pb-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              <Flame className={cn('size-4', stats.streak > 0 ? 'text-warning' : 'text-fg-subtle')} />
              {stats.streak > 0
                ? `Серия повторений: ${stats.streak} ${plural(stats.streak, 'день', 'дня', 'дней')} подряд`
                : 'Серия повторений прервана — начните сегодня'}
            </div>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-subtle">
              <span>сегодня: {stats.reviews_today}</span>
              <span>всего повторений: {stats.reviews}</span>
            </div>
            <div className="sm:ml-4">
              <ActivityStrip stats={stats} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {overview.data && decks.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="Колоды не найдены"
          description="Файл content/flashcards/decks.json пуст. Перечитайте контент в настройках."
        />
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            onStart={() => setSession({ deck: deck.id, title: deck.title })}
            onAdd={() => {
              setAddDeck(deck)
              setFront('')
              setBack('')
              setHint('')
            }}
            onReset={() => setResetDeck(deck)}
          />
        ))}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
        Оценки меняют интервал: «Снова» — через 10 минут и ниже сложность, «Трудно» — короткий шаг,
        «Хорошо» — обычный, «Легко» — длинный. Всё считается локально, без интернета.
      </p>

      {session ? (
        <ReviewSession
          deckId={session.deck}
          title={session.title}
          onClose={() => setSession(null)}
          onStats={(next) => setLiveStats(next)}
        />
      ) : null}

      <Dialog open={Boolean(addDeck)} onOpenChange={(open) => !open && setAddDeck(null)}>
        <DialogContent className="w-[min(520px,94vw)]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-fg">
              Своя карточка · {addDeck?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 px-5 py-4">
            <Input
              value={front}
              onChange={(event) => setFront(event.target.value)}
              placeholder="Вопрос"
              aria-label="Вопрос карточки"
              className="h-9 text-[13px]"
            />
            <textarea
              value={back}
              onChange={(event) => setBack(event.target.value)}
              placeholder="Ответ"
              aria-label="Ответ карточки"
              className="min-h-[110px] w-full resize-y rounded-lg border border-line bg-surface-inset px-3 py-2 text-[12.5px] leading-relaxed text-fg outline-none focus:border-primary/60"
            />
            <Input
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              placeholder="Подсказка (необязательно)"
              aria-label="Подсказка карточки"
              className="h-8 text-[12.5px]"
            />
            <p className="text-[11px] text-fg-subtle">
              Свои карточки можно удалить: карточки из контента защищены, их правят в файле колоды.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 pb-4">
            <Button variant="ghost" size="sm" onClick={() => setAddDeck(null)}>
              Отмена
            </Button>
            <Button size="sm" onClick={() => void createCard()} disabled={savingCard || !front.trim() || !back.trim()}>
              {savingCard ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Добавить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(resetDeck)}
        onOpenChange={() => setResetDeck(null)}
        title={`Сбросить прогресс «${resetDeck?.title ?? ''}»?`}
        description="Все повторения этой колоды обнулятся, карточки снова станут новыми. Тексты карточек не изменятся."
        confirmLabel="Сбросить"
        destructive
        onConfirm={() => void confirmReset()}
      />

    </div>
  )
}
