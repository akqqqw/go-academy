import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Loader2,
  RotateCcw,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { QuestionCard, questionTypeLabel } from '@/features/quizzes/question-card'
import { api } from '@/lib/api'
import { cn, levelLabel, plural } from '@/lib/utils'
import { useQuiz } from '@/services/queries'
import type { QuizResult } from '@/types'

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} с`
  return `${Math.floor(seconds / 60)} мин ${seconds % 60} с`
}

/** Экран результата: разбор каждого вопроса с объяснением. */
function ResultView({
  result,
  passThreshold,
  onRetry,
}: {
  result: QuizResult
  passThreshold: number
  onRetry: () => void
}) {
  const wrong = result.questions.filter((question) => !question.correct)
  return (
    <div className="space-y-3">
      <Card className={cn('border', result.passed ? 'border-success/40' : 'border-warning/40')}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-4 pb-4">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-full',
              result.passed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
            )}
          >
            {result.passed ? <Trophy className="size-6" /> : <CircleHelp className="size-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-fg">
              {result.passed ? 'Тест сдан' : 'Пока не сдано'} · {result.percent}%
            </p>
            <p className="text-[12px] text-fg-muted">
              {result.score} из {result.total} верно · порог {passThreshold}% ·{' '}
              {formatDuration(result.attempt.duration_ms)}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw className="size-3.5" />
              Пройти заново
            </Button>
            <Button size="sm" asChild>
              <Link to="/quizzes">
                К тестам
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-3.5 pb-3">
          <p className="text-[12.5px] font-medium text-fg">
            Разбор ответов{wrong.length > 0 ? ` · ошибок ${wrong.length}` : ' · ошибок нет'}
          </p>
          <ul className="space-y-2">
            {result.questions.map((question, index) => (
              <li
                key={question.id}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  question.correct ? 'border-success/30 bg-success-soft/30' : 'border-danger/30 bg-danger-soft/30',
                )}
              >
                <div className="flex items-start gap-2">
                  {question.correct ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-fg">
                      {index + 1}. {question.prompt}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      {questionTypeLabel(question.type)}
                      {question.given.length > 0 ? ` · ваш ответ: ${question.given.join(', ')}` : ' · без ответа'}
                    </p>
                    {!question.correct ? (
                      <p className="mt-0.5 text-[11.5px] text-fg">
                        Верно: {question.expected.join(' / ')}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
                      {question.explanation}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const quizQuery = useQuiz(quizId)

  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())

  const quiz = quizQuery.data?.quiz
  const questions = quiz?.questions ?? []
  const current = questions[index]

  const answeredCount = useMemo(
    () => questions.filter((question) => (answers[question.id]?.length ?? 0) > 0).length,
    [answers, questions],
  )

  const setAnswer = (id: string, value: string[]) => {
    setAnswers((previous) => ({ ...previous, [id]: value }))
  }

  const submit = async () => {
    if (!quiz) return
    setSubmitting(true)
    try {
      const response = await api.submitQuiz(quiz.id, answers, Date.now() - startedAt)
      setResult(response)
      await queryClient.invalidateQueries({ queryKey: ['quizzes'] })
      await queryClient.invalidateQueries({ queryKey: ['quiz', quiz.id] })
      await queryClient.invalidateQueries({ queryKey: ['progress'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (response.passed) {
        toast.success(`Тест сдан: ${response.score} из ${response.total}`)
      } else {
        toast.warning(`Пока ${response.percent}% — нужен результат не ниже ${quiz.pass_threshold}%`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось проверить ответы')
    } finally {
      setSubmitting(false)
    }
  }

  const restart = () => {
    setResult(null)
    setAnswers({})
    setIndex(0)
    setStartedAt(Date.now())
    window.scrollTo({ top: 0 })
  }

  if (quizQuery.isPending) return <LoadingState label="Загружаем вопросы…" />
  if (quizQuery.isError || !quiz) {
    return (
      <ErrorState
        message={quizQuery.error?.message ?? 'Тест не найден'}
        onRetry={() => navigate('/quizzes')}
      />
    )
  }

  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={quiz.module > 0 ? `Модуль ${quiz.module} · ${quiz.module_title}` : quiz.module_title}
        title={quiz.title}
        description={quiz.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{levelLabel(quiz.level)}</Badge>
            <Badge variant="primary">
              <CircleHelp className="size-3" />
              {questions.length} {plural(questions.length, 'вопрос', 'вопроса', 'вопросов')}
            </Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/quizzes">
                <ArrowLeft className="size-3.5" />
                Все тесты
              </Link>
            </Button>
          </div>
        }
      />

      {result ? (
        <ResultView result={result} passThreshold={quiz.pass_threshold} onRetry={restart} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[180px] flex-1">
              <Progress value={progress} height={5} label="Отвечено вопросов" />
            </div>
            <span className="text-[11.5px] text-fg-subtle">
              отвечено {answeredCount} из {questions.length} · порог {quiz.pass_threshold}%
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_210px] lg:items-start">
            <div className="space-y-2.5">
              {current ? (
                <QuestionCard
                  key={current.id}
                  question={current}
                  index={index}
                  total={questions.length}
                  value={answers[current.id] ?? []}
                  onChange={(value) => setAnswer(current.id, value)}
                  disabled={submitting}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => setIndex((value) => Math.max(0, value - 1))}
                >
                  <ArrowLeft className="size-3.5" />
                  Назад
                </Button>
                {index + 1 < questions.length ? (
                  <Button size="sm" onClick={() => setIndex((value) => value + 1)}>
                    Далее
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => void submit()}
                  disabled={submitting || answeredCount === 0}
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Проверить ответы
                </Button>
              </div>
              {answeredCount < questions.length ? (
                <p className="text-[11px] text-fg-subtle">
                  Можно отправить и неполный набор: неотвеченные вопросы засчитываются как ошибки.
                </p>
              ) : null}
            </div>

            <aside className="space-y-2 rounded-xl border border-line bg-surface p-2 shadow-card">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                Навигация
              </p>
              <div className="grid grid-cols-7 gap-1">
                {questions.map((question, questionIndex) => {
                  const answered = (answers[question.id]?.length ?? 0) > 0
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => setIndex(questionIndex)}
                      aria-label={`Вопрос ${questionIndex + 1}`}
                      aria-current={questionIndex === index ? 'true' : undefined}
                      className={cn(
                        'grid h-7 place-items-center rounded-md border text-[11px] tabular-nums transition-colors',
                        questionIndex === index
                          ? 'border-primary bg-primary text-primary-fg'
                          : answered
                            ? 'border-primary/40 bg-primary-soft text-primary'
                            : 'border-line bg-surface text-fg-muted hover:border-line-strong',
                      )}
                    >
                      {questionIndex + 1}
                    </button>
                  )
                })}
              </div>
              <div className="space-y-1 border-t border-line px-1 pt-2 text-[11px] text-fg-subtle">
                <p className="flex items-center gap-1.5">
                  <Clock3 className="size-3" />
                  Время учитывается автоматически
                </p>
                <p>
                  Вопросы разных типов: один и несколько ответов, верно/неверно, короткий ответ и
                  разбор кода.
                </p>
              </div>

              {quizQuery.data?.attempts.length ? (
                <div className="border-t border-line px-1 pt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                    Прошлые попытки
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {quizQuery.data.attempts.slice(0, 4).map((attempt) => (
                      <li key={attempt.id} className="flex items-center justify-between text-[11px]">
                        <span className={attempt.passed ? 'text-success' : 'text-fg-muted'}>
                          {attempt.score}/{attempt.total} · {attempt.percent}%
                        </span>
                        <span className="text-fg-subtle">{formatDate(attempt.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
