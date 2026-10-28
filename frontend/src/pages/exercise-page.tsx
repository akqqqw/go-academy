import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  History,
  Info,
  Lightbulb,
  ListChecks,
  Loader2,
  ShieldAlert,
  Target,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { SplitPane } from '@/components/editor/split-pane'
import { MarkdownViewer } from '@/components/markdown'
import { PageHeader } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CodeWorkbench } from '@/features/editor/code-workbench'
import { ApiError, api } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { useExercise } from '@/services/queries'
import type { ExerciseDifficulty, ExerciseSubmitResponse } from '@/types'

const DIFFICULTY_LABELS: Record<ExerciseDifficulty, string> = {
  easy: 'Лёгкая',
  medium: 'Средняя',
  hard: 'Сложная',
}

const DIFFICULTY_VARIANTS: Record<ExerciseDifficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Подписи статусов попыток на странице задания. */
const ATTEMPT_LABELS: Record<string, string> = {
  ok: 'все проверки пройдены',
  test_failed: 'не все проверки',
  compile_error: 'ошибка компиляции',
  timeout: 'таймаут',
  rejected: 'отклонено',
  internal: 'ошибка сервера',
}

export function ExercisePage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const queryClient = useQueryClient()
  const exerciseQuery = useExercise(exerciseId)
  const [openHint, setOpenHint] = useState<number | null>(null)
  const [showSolution, setShowSolution] = useState(false)
  const [solution, setSolution] = useState<string | null>(null)
  const [loadingSolution, setLoadingSolution] = useState(false)
  const [lastResult, setLastResult] = useState<ExerciseSubmitResponse | null>(null)

  const data = exerciseQuery.data?.exercise

  const openSolution = async () => {
    if (!exerciseId) return
    setShowSolution(true)
    if (solution) return
    setLoadingSolution(true)
    try {
      const response = await api.exerciseSolution(exerciseId)
      setSolution(response.solution)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить решение')
      setShowSolution(false)
    } finally {
      setLoadingSolution(false)
    }
  }

  const onSubmitFinished = async (response: ExerciseSubmitResponse) => {
    setLastResult(response)
    if (response.solved && exerciseId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] }),
        queryClient.invalidateQueries({ queryKey: ['exercises'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
      ])
    }
  }

  if (exerciseQuery.isPending) return <LoadingState label="Загружаем задание…" />

  if (exerciseQuery.isError) {
    const notFound =
      exerciseQuery.error instanceof ApiError && exerciseQuery.error.code === 'exercise_not_found'
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/practice">
            <ArrowLeft />
            Все задания
          </Link>
        </Button>
        <ErrorState
          message={
            notFound
              ? 'Такого задания нет: возможно, каталог практики обновился.'
              : exerciseQuery.error.message
          }
          onRetry={notFound ? undefined : () => void exerciseQuery.refetch()}
        />
      </div>
    )
  }

  if (!data) return null

  const solved = data.progress.solved || lastResult?.solved === true
  const attempts = data.progress.attempts

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
        <Link to="/practice" className="inline-flex items-center gap-1 hover:text-fg">
          <ArrowLeft className="size-3.5" />
          Практика
        </Link>
        <ChevronRight className="size-3" />
        <span>
          Модуль {data.module_number} · {data.module_title}
        </span>
      </div>

      <PageHeader
        eyebrow={`Задание · ${DIFFICULTY_LABELS[data.difficulty]}`}
        title={data.title}
        description={data.summary}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={DIFFICULTY_VARIANTS[data.difficulty]}>
              {DIFFICULTY_LABELS[data.difficulty]}
            </Badge>
            {solved ? (
              <Badge variant="success">
                <CheckCircle2 className="size-3" />
                Решено
              </Badge>
            ) : attempts > 0 ? (
              <Badge variant="warning">
                <History className="size-3" />
                Попыток: {attempts}
              </Badge>
            ) : (
              <Badge variant="outline">Не начато</Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => void openSolution()}>
              <Eye />
              Показать решение
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="size-3.5" />
          {data.checks.length} {plural(data.checks.length, 'проверка', 'проверки', 'проверок')}{' '}
          настоящими Go-тестами
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />~{data.minutes} мин
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Target className="size-3.5" />
          {data.topics.join(' · ')}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-fg-subtle">
          <ShieldAlert className="size-3.5" />
          Код выполняется локально, это не песочница
        </span>
      </div>

      <div className="lg:h-[calc(100vh-14rem)] lg:min-h-[620px]">
        <SplitPane
          storageKey="exercise"
          initialRatio={0.44}
          minRatio={0.3}
          maxRatio={0.7}
          leftLabel="Условие задания"
          rightLabel="Решение"
          className="h-full"
          left={
            <div className="flex h-full min-h-0 flex-col gap-3 lg:pr-3">
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
                <MarkdownViewer markdown={data.statement} />

                <section className="mt-5 border-t border-line pt-4">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                    <ListChecks className="size-4 text-primary" />
                    Что проверяется
                  </h2>
                  <ul className="mt-2 space-y-1">
                    {data.checks.map((check) => {
                      const outcome = lastResult?.result.tests.find((test) => test.name === check.name)
                      return (
                        <li
                          key={check.name}
                          className="flex items-start gap-2 text-[12.5px] text-fg-muted"
                        >
                          {outcome ? (
                            outcome.passed ? (
                              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                            ) : (
                              <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-danger" />
                            )
                          ) : (
                            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                          )}
                          <span>{check.title}</span>
                        </li>
                      )
                    })}
                  </ul>
                </section>

                {data.hints.length > 0 ? (
                  <section className="mt-4 border-t border-line pt-4">
                    <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                      <Lightbulb className="size-4 text-warning" />
                      Подсказки
                    </h2>
                    <div className="mt-2 space-y-1.5">
                      {data.hints.map((hint, index) => {
                        const open = openHint === index
                        return (
                          <div
                            key={hint}
                            className="rounded-lg border border-line bg-surface-inset/60"
                          >
                            <button
                              type="button"
                              onClick={() => setOpenHint(open ? null : index)}
                              aria-expanded={open}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted hover:text-fg"
                            >
                              <ChevronDown
                                className={cn(
                                  'size-3.5 shrink-0 transition-transform',
                                  open && 'rotate-180',
                                )}
                              />
                              Подсказка {index + 1}
                            </button>
                            {open ? (
                              <p className="border-t border-line/60 px-2.5 py-2 text-[12.5px] leading-relaxed text-fg-muted">
                                {hint}
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {data.prev ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/practice/${data.prev.id}`}>
                      <ArrowLeft />
                      <span className="max-w-[140px] truncate">{data.prev.title}</span>
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/practice">
                      <ArrowLeft />
                      Все задания
                    </Link>
                  </Button>
                )}
                {data.next ? (
                  <Button asChild variant="outline" size="sm" className="ml-auto">
                    <Link to={`/practice/${data.next.id}`}>
                      <span className="max-w-[160px] truncate">{data.next.title}</span>
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          }
          right={
            <div className="flex h-full min-h-[560px] flex-col lg:h-full lg:pl-1">
              <CodeWorkbench
                draftKey={`exercise-${data.id}`}
                starter={data.starter_code}
                source="exercise"
                refId={data.id}
                className="h-full"
                submit={(code) => api.submitExercise(data.id, code)}
                onSubmitFinished={(response) => void onSubmitFinished(response)}
                extraActions={
                  <span className="hidden items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-[11px] text-fg-subtle xl:inline-flex">
                    <ListChecks className="size-3" />
                    {data.checks.length} проверок
                  </span>
                }
              />
            </div>
          }
        />
      </div>

      {data.attempts.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-line py-2.5">
            <CardTitle className="flex items-center gap-2 text-[13px]">
              <History className="size-4 text-primary" />
              История попыток
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2.5 pb-3">
            <ul className="space-y-1">
              {data.attempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted"
                >
                  <span className="tabular-nums text-fg-subtle">
                    {formatDateTime(attempt.created_at)}
                  </span>
                  <span
                    className={cn(
                      'font-medium',
                      attempt.status === 'ok' ? 'text-success' : 'text-fg-muted',
                    )}
                  >
                    {attempt.passed}/{attempt.total} ·{' '}
                    {ATTEMPT_LABELS[attempt.status] ?? attempt.status}
                  </span>
                  <span className="tabular-nums text-fg-subtle">{attempt.duration_ms} мс</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <Info className="size-3" />
              Попытки сохраняются в SQLite и учитываются в статистике и дневном плане.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={showSolution} onOpenChange={setShowSolution}>
        <DialogContent className="max-h-[76vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Эталонное решение</DialogTitle>
          </DialogHeader>
          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            <p className="mb-3 text-[12px] text-fg-muted">
              Сравните со своим вариантом: полезнее понять подход, чем скопировать код.
            </p>
            {loadingSolution ? (
              <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
                <Loader2 className="size-3.5 animate-spin" />
                Загружаем решение…
              </p>
            ) : (
              <MarkdownViewer markdown={`\`\`\`go\n${solution ?? ''}\n\`\`\``} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
