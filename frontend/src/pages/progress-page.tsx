import { Activity, Clock3, Flame, Layers, ListChecks, Target } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ActivityHeatmap } from '@/components/activity-heatmap'
import { PageHeader } from '@/components/page-header'
import { ProgressRing } from '@/components/progress-ring'
import { CardSkeleton, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { useActivity, useCourse, useProgress } from '@/services/queries'
import { cn, formatDuration, plural } from '@/lib/utils'

type Range = '90' | '182' | '365'

const rangeOptions: { value: Range; label: string }[] = [
  { value: '90', label: '90 дней' },
  { value: '182', label: '6 месяцев' },
  { value: '365', label: 'Год' },
]

export function ProgressPage() {
  const [range, setRange] = useState<Range>('182')
  const progress = useProgress()
  const activity = useActivity(Number(range))
  const course = useCourse()

  const snapshot = progress.data?.snapshot
  const totals = progress.data?.totals

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Статистика"
        title="Ваш прогресс"
        description="Все цифры считаются из локальной базы: уроки, практика, карточки и время занятий. Календарь показывает реальную активность по дням."
        actions={
          snapshot ? (
            <Badge variant={snapshot.streak.today_active ? 'success' : 'outline'} className="h-7 px-2.5">
              <Flame className="size-3.5" />
              Серия {snapshot.streak.current} {plural(snapshot.streak.current, 'день', 'дня', 'дней')}
            </Badge>
          ) : null
        }
      />

      {progress.isPending ? <LoadingState label="Считаем статистику…" /> : null}
      {progress.isError ? (
        <ErrorState message={progress.error.message} onRetry={() => void progress.refetch()} />
      ) : null}

      {snapshot && totals ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4 text-primary" />
                Пройдено курса
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 pb-6">
              <ProgressRing value={snapshot.course_percent} size={132} strokeWidth={9}>
                <div className="text-center">
                  <div className="text-2xl font-semibold tabular-nums text-fg">
                    {snapshot.course_percent}%
                  </div>
                  <div className="text-[11px] text-fg-subtle">курса</div>
                </div>
              </ProgressRing>
              <div className="grid w-full grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-line bg-surface-inset px-2 py-2">
                  <div className="text-lg font-semibold tabular-nums text-fg">
                    {snapshot.lessons.completed}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
                    уроков из {snapshot.lessons.total}
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-surface-inset px-2 py-2">
                  <div className="text-lg font-semibold tabular-nums text-fg">
                    {formatDuration(snapshot.study.total_seconds)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
                    всего времени
                  </div>
                </div>
              </div>
              <Button asChild variant="secondary" size="sm" className="w-full">
                <Link to="/learning">Продолжить обучение</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Календарь активности
              </CardTitle>
              <Segmented
                value={range}
                options={rangeOptions}
                onChange={setRange}
                ariaLabel="Период календаря"
                size="sm"
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {activity.isPending ? (
                <div className="h-[104px] animate-pulse-soft rounded-lg bg-surface-muted" />
              ) : activity.isError ? (
                <ErrorState
                  message={activity.error.message}
                  onRetry={() => void activity.refetch()}
                />
              ) : (
                <ActivityHeatmap days={activity.data.days} />
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    icon: Clock3,
                    label: 'Сегодня',
                    value: formatDuration(snapshot.study.today_seconds),
                  },
                  {
                    icon: Flame,
                    label: 'Текущая серия',
                    value: `${snapshot.streak.current} дн.`,
                  },
                  { icon: Activity, label: 'Рекорд серии', value: `${snapshot.streak.longest} дн.` },
                  {
                    icon: ListChecks,
                    label: 'Точность тестов',
                    value:
                      snapshot.quizzes.answers_total > 0
                        ? `${snapshot.quizzes.accuracy}%`
                        : 'нет данных',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-line bg-surface-inset px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-subtle">
                      <item.icon className="size-3" />
                      {item.label}
                    </div>
                    <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-fg">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-fg-subtle" />
              Модули курса
            </CardTitle>
            {course.data ? (
              <span className="text-[11px] text-fg-subtle">
                {course.data.course.modules.length} модулей
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-1.5">
            {course.isPending ? (
              <CardSkeleton rows={5} />
            ) : course.isError ? (
              <ErrorState
                message={course.error.message}
                onRetry={() => void course.refetch()}
              />
            ) : (
              course.data.course.modules.map((module) => {
                const completed = Math.round((module.progress / 100) * module.lessons.length)
                return (
                  <div
                    key={module.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted/60"
                  >
                    <span
                      className={cn(
                        'w-6 shrink-0 text-center font-mono text-[11px] tabular-nums',
                        module.progress > 0 ? 'text-primary' : 'text-fg-subtle',
                      )}
                    >
                      {String(module.number).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-medium text-fg">
                          {module.title}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">
                          {completed}/{module.lessons.length}
                        </span>
                      </div>
                      <Progress value={module.progress} height={3} className="mt-1" />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Детали</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {snapshot ? (
                [
                  {
                    label: 'Практические задачи',
                    value:
                      totals && totals.exercises > 0
                        ? `${snapshot.exercises.solved} из ${totals.exercises}`
                        : 'раздел готовится',
                  },
                  {
                    label: 'Карточки изучено',
                    value: `${snapshot.cards.reviewed}`,
                  },
                  {
                    label: 'Карточек к повторению',
                    value: `${snapshot.cards.due}`,
                  },
                  {
                    label: 'Тестов пройдено',
                    value:
                      totals && totals.quizzes > 0
                        ? `${snapshot.quizzes.passed} из ${totals.quizzes}`
                        : 'раздел готовится',
                  },
                  {
                    label: 'Уроков в процессе',
                    value: `${snapshot.lessons.in_progress}`,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 border-b border-line/60 pb-2 text-[12px] last:border-0 last:pb-0"
                  >
                    <span className="text-fg-muted">{row.label}</span>
                    <span className="font-medium tabular-nums text-fg">{row.value}</span>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse-soft rounded bg-surface-muted" />
                  <div className="h-3 w-4/5 animate-pulse-soft rounded bg-surface-muted" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Дневные цели</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.plan.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-fg-muted">{item.label}</span>
                    <span className="tabular-nums text-fg-subtle">
                      {item.current}/{item.target}
                    </span>
                  </div>
                  <Progress
                    value={item.target > 0 ? Math.min(100, (item.current / item.target) * 100) : 0}
                    height={4}
                    indicatorClassName={item.done ? 'bg-success' : undefined}
                  />
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to="/settings">Изменить цели</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
