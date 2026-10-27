import {
  ArrowRight,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Flame,
  Lightbulb,
  ListChecks,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { cn, plural } from '@/lib/utils'
import { useExercises } from '@/services/queries'
import type { ExerciseCard, ExerciseDifficulty } from '@/types'

const DIFFICULTY_LABELS: Record<ExerciseDifficulty, string> = {
  easy: 'Лёгкая',
  medium: 'Средняя',
  hard: 'Сложная',
}

const DIFFICULTY_STYLES: Record<ExerciseDifficulty, string> = {
  easy: 'border-success/30 bg-success-soft text-success',
  medium: 'border-warning/30 bg-warning-soft text-warning',
  hard: 'border-danger/30 bg-danger-soft text-danger',
}

type StatusFilter = 'all' | 'unsolved' | 'attempted' | 'solved'
type DifficultyFilter = 'all' | ExerciseDifficulty

/** Склонение слова «проверка» для счётчика. */
function checksLabel(count: number) {
  return `${count} ${plural(count, 'проверка', 'проверки', 'проверок')}`
}

function ExerciseRow({ exercise }: { exercise: ExerciseCard }) {
  const solved = exercise.solved
  return (
    <Link
      to={`/practice/${exercise.id}`}
      className={cn(
        'group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
        solved
          ? 'border-success/25 bg-success-soft/25 hover:border-success/40'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
          solved ? 'bg-success/15 text-success' : 'bg-surface-muted text-fg-subtle',
        )}
        aria-hidden
      >
        {solved ? <CheckCircle2 className="size-4" /> : <CircleDashed className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[14px] font-medium text-fg">{exercise.title}</span>
          <span className={cn('rounded border px-1.5 py-0.5 text-[10.5px] font-medium', DIFFICULTY_STYLES[exercise.difficulty])}>
            {DIFFICULTY_LABELS[exercise.difficulty]}
          </span>
          {exercise.attempts > 0 && !solved ? (
            <Badge variant="warning">попыток: {exercise.attempts}</Badge>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">
          {exercise.summary}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Braces className="size-3" />
            Модуль {exercise.module_number} · {exercise.module_title}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3" />
            {checksLabel(exercise.checks_count)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Lightbulb className="size-3" />
            {exercise.hints_count} {plural(exercise.hints_count, 'подсказка', 'подсказки', 'подсказок')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" />~{exercise.minutes} мин
          </span>
        </div>
      </div>

      <ChevronRight className="mt-1.5 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  )
}

export function PracticePage() {
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [module, setModule] = useState('all')
  const [query, setQuery] = useState('')

  const filters = useMemo(
    () => ({
      difficulty: difficulty === 'all' ? undefined : difficulty,
      status: status === 'all' ? undefined : status,
      module: module === 'all' ? undefined : module,
      q: query.trim() || undefined,
    }),
    [difficulty, module, query, status],
  )

  const exercises = useExercises(filters)
  const data = exercises.data
  const total = data?.stats.total ?? 0
  const solved = data?.overview.solved ?? 0
  const percent = total > 0 ? Math.round((solved / total) * 100) : 0
  const hasFilters = difficulty !== 'all' || status !== 'all' || module !== 'all' || query.trim() !== ''

  const resetFilters = () => {
    setDifficulty('all')
    setStatus('all')
    setModule('all')
    setQuery('')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Тренировка"
        title="Практика"
        description="Задачи по темам курса. Решение проверяется настоящими Go-тестами на сервере: тесты скрыты, поэтому подогнать ответ под них не получится."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="primary">
              <ListChecks className="size-3" />
              {total} {plural(total, 'задача', 'задачи', 'задач')}
            </Badge>
            <Badge variant={solved === total && total > 0 ? 'success' : 'outline'}>
              <CheckCircle2 className="size-3" />
              {solved} решено
            </Badge>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-fg-subtle">
              Решено
              <Target className="size-3.5" />
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">
              {solved}
              <span className="text-sm font-normal text-fg-subtle"> / {total}</span>
            </div>
            <Progress value={percent} height={4} label="Решено задач" className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-fg-subtle">
              Попытки
              <Flame className="size-3.5" />
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">
              {data?.overview.attempts ?? 0}
            </div>
            <p className="mt-2 text-[11.5px] text-fg-subtle">
              {data?.overview.in_progress ?? 0} в процессе
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-fg-subtle">
              По сложности
              <SlidersHorizontal className="size-3.5" />
            </div>
            <div className="mt-1 flex items-baseline gap-3 text-[12.5px] text-fg-muted">
              <span className="text-success">{data?.stats.by_level.easy ?? 0} лёгких</span>
              <span className="text-warning">{data?.stats.by_level.medium ?? 0} средних</span>
              <span className="text-danger">{data?.stats.by_level.hard ?? 0} сложных</span>
            </div>
            <p className="mt-2 text-[11.5px] text-fg-subtle">
              {data?.stats.minutes ?? 0} минут на всё
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-fg-subtle">
              Как проверяется
              <Sparkles className="size-3.5" />
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
              <code className="rounded bg-surface-muted px-1 font-mono text-[11.5px]">go test</code>{' '}
              в отдельном каталоге: таймаут, лимит вывода и запрет внешних команд.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={difficulty}
            onChange={setDifficulty}
            ariaLabel="Сложность"
            size="sm"
            options={[
              { value: 'all', label: 'Все' },
              { value: 'easy', label: 'Лёгкие' },
              { value: 'medium', label: 'Средние' },
              { value: 'hard', label: 'Сложные' },
            ]}
          />
          <Segmented
            value={status}
            onChange={setStatus}
            ariaLabel="Статус решения"
            size="sm"
            options={[
              { value: 'all', label: 'Любые' },
              { value: 'unsolved', label: 'Не решены' },
              { value: 'attempted', label: 'В процессе' },
              { value: 'solved', label: 'Решены' },
            ]}
          />
          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по задачам и темам"
              aria-label="Поиск по задачам"
              className="h-8 pl-8 text-[12.5px]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-fg-subtle hover:bg-surface-muted hover:text-fg"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="inline-flex items-center gap-1 text-fg-subtle">
            <Braces className="size-3" />
            Модуль:
          </span>
          <button
            type="button"
            onClick={() => setModule('all')}
            className={cn(
              'rounded-full border px-2 py-0.5 transition-colors',
              module === 'all'
                ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            все
          </button>
          {(data?.modules ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setModule(item.id)}
              title={`${item.title} · ${item.count}`}
              className={cn(
                'rounded-full border px-2 py-0.5 transition-colors',
                module === item.id
                  ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {item.number}. {item.title}{' '}
              <span className="text-fg-subtle">{item.count}</span>
            </button>
          ))}
          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-fg-muted hover:border-line-strong hover:text-fg"
            >
              <X className="size-3" />
              Сбросить фильтры
            </button>
          ) : null}
        </div>
      </div>

      {exercises.isPending ? <LoadingState label="Загружаем задания…" /> : null}
      {exercises.isError ? (
        <ErrorState message={exercises.error.message} onRetry={() => void exercises.refetch()} />
      ) : null}

      {data ? (
        data.exercises.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Под фильтры ничего не подошло"
            description="Измените сложность, модуль или статус — или сбросьте фильтры."
            action={
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-[12.5px] text-fg-muted hover:border-line-strong hover:text-fg"
              >
                Сбросить фильтры
                <ArrowRight className="size-3.5" />
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-[11.5px] text-fg-subtle">
              <span>
                Показано {data.exercises.length} из {data.stats.total}
              </span>
              <span>Решённые задачи помечены зелёным</span>
            </div>
            {data.exercises.map((exercise) => (
              <ExerciseRow key={exercise.id} exercise={exercise} />
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
