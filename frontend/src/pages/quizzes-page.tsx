import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Award,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  History,
  Loader2,
  Play,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { cn, levelLabel, plural } from '@/lib/utils'
import { useQuizzes } from '@/services/queries'
import type { QuizAttempt, QuizSummary } from '@/types'

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function summaryLine(attempt: QuizAttempt) {
  return `${attempt.score}/${attempt.total} · ${attempt.percent}%`
}

function QuizCard({ quiz }: { quiz: QuizSummary }) {
  const progress = quiz.progress
  const started = progress.attempts > 0

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex h-full flex-col gap-2 pt-3.5 pb-3">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg',
              progress.solved_once ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary',
            )}
          >
            <ClipboardList className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-fg">{quiz.title}</p>
            <p className="text-[10.5px] text-fg-subtle">
              {quiz.module > 0 ? `Модуль ${quiz.module} · ` : ''}
              {levelLabel(quiz.level)} · {quiz.questions}{' '}
              {plural(quiz.questions, 'вопрос', 'вопроса', 'вопросов')}
            </p>
          </div>
          {progress.solved_once ? (
            <Badge variant="success">
              <CheckCircle2 className="size-3" />
              сдан
            </Badge>
          ) : started ? (
            <Badge variant="warning">в процессе</Badge>
          ) : (
            <Badge variant="outline">новый</Badge>
          )}
        </div>

        <p className="line-clamp-2 min-h-[32px] text-[11.5px] leading-relaxed text-fg-muted">
          {quiz.description}
        </p>

        <div className="mt-auto space-y-1.5">
          <Progress
            value={progress.best_percent}
            height={4}
            label={`Лучший результат: ${progress.best_percent}%`}
          />
          <div className="flex flex-wrap items-center gap-x-2 text-[10.5px] text-fg-subtle">
            <span>лучший: {progress.best_percent}%</span>
            <span>· попыток: {progress.attempts}</span>
            {progress.last_at ? <span>· {formatDate(progress.last_at)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-7 flex-1" asChild>
            <Link to={`/quizzes/${quiz.id}`}>
              <Play className="size-3.5" />
              {started ? 'Пройти снова' : 'Начать тест'}
            </Link>
          </Button>
          <span className="text-[10.5px] text-fg-subtle">порог {quiz.pass_threshold}%</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function QuizzesPage() {
  const queryClient = useQueryClient()
  const query = useQuizzes()

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['quizzes'] })
    await queryClient.invalidateQueries({ queryKey: ['quiz'] })
  }

  const stats = query.data?.stats
  const quizzes = query.data?.quizzes ?? []
  const history = query.data?.history ?? []
  const totalQuestions = quizzes.reduce((sum, quiz) => sum + quiz.questions, 0)
  const solved = quizzes.filter((quiz) => quiz.progress.solved_once).length

  const source = query.data?.source
  const reloadContent = async () => {
    try {
      await api.reloadContent()
      await refresh()
      toast.success('Контент перечитан: вопросы обновлены')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось перечитать контент')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Проверка знаний"
        title="Тесты"
        description="Викторины по модулям с вопросами пяти типов: один и несколько ответов, верно/неверно, короткий ответ и разбор Go-кода. После проверки — объяснение к каждому вопросу."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">
              <CircleHelp className="size-3" />
              {totalQuestions} {plural(totalQuestions, 'вопрос', 'вопроса', 'вопросов')}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => void reloadContent()}>
              <RefreshCw className="size-3.5" />
              Перечитать контент
            </Button>
          </div>
        }
      />

      {query.isPending ? <LoadingState label="Загружаем тесты…" /> : null}
      {query.isError ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : null}

      {stats ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Сдано тестов', value: `${solved} из ${quizzes.length}`, icon: Award },
            { label: 'Попыток', value: stats.attempts, icon: History },
            { label: 'Средний результат', value: `${stats.average}%`, icon: TrendingUp },
            { label: 'Лучший результат', value: `${stats.best}%`, icon: Target },
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

      {query.data && quizzes.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Викторин нет"
          description="Файл content/quizzes/quizzes.json пуст или не найден. Нажмите «Перечитать контент»."
          action={
            <Button size="sm" variant="outline" onClick={() => void reloadContent()}>
              <RefreshCw className="size-3.5" />
              Перечитать контент
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {quizzes.map((quiz) => (
          <QuizCard key={quiz.id} quiz={quiz} />
        ))}
      </div>

      {history.length > 0 ? (
        <Card>
          <CardContent className="space-y-1.5 pt-3.5 pb-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
              <History className="size-3.5 text-primary" />
              Последние попытки
            </p>
            <ul className="divide-y divide-line">
              {history.slice(0, 6).map((attempt) => {
                const quiz = quizzes.find((item) => item.id === attempt.quiz_id)
                return (
                  <li key={attempt.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[11.5px]">
                    <span className="min-w-0 flex-1 truncate text-fg-muted">
                      {quiz?.title ?? attempt.quiz_id}
                    </span>
                    <span className={attempt.passed ? 'text-success' : 'text-warning'}>
                      {summaryLine(attempt)}
                    </span>
                    <span className="text-fg-subtle">{formatDate(attempt.created_at)}</span>
                    {quiz ? (
                      <Link
                        to={`/quizzes/${quiz.id}`}
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        открыть
                        <ArrowRight className="size-3" />
                      </Link>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {query.isFetching && !query.isPending ? (
        <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Loader2 className="size-3 animate-spin" />
          Обновляем прогресс…
        </p>
      ) : null}

      {source ? (
        <p className="text-[11px] text-fg-subtle">
          Источник вопросов: <code>{source}</code>. Правильные ответы и объяснения хранятся на
          сервере и приходят только после проверки.
        </p>
      ) : null}
    </div>
  )
}
