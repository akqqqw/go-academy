import { ArrowRight, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { CardSkeleton, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { ContinueCard } from '@/features/dashboard/continue-card'
import { CourseProgress } from '@/features/dashboard/course-progress'
import { RecentActivity } from '@/features/dashboard/recent-activity'
import { StatsGrid } from '@/features/dashboard/stats-grid'
import { TodayPlan } from '@/features/dashboard/today-plan'
import { useCourse, useDashboard } from '@/services/queries'
import { formatTodayGreeting, greeting } from '@/lib/utils'

export function DashboardPage() {
  const dashboard = useDashboard()
  const course = useCourse()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatTodayGreeting()}
        title={`${greeting()}, продолжаем Go`}
        description="Короткая сводка обучения: текущий урок, дневные цели и реальная статистика. Все данные хранятся локально."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/learning">
              <GraduationCap />
              Программа курса
            </Link>
          </Button>
        }
      />

      {dashboard.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CardSkeleton rows={4} />
            </div>
            <CardSkeleton rows={5} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <CardSkeleton key={index} rows={2} />
            ))}
          </div>
        </div>
      ) : dashboard.isError ? (
        <ErrorState
          message={dashboard.error.message}
          onRetry={() => void dashboard.refetch()}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {dashboard.data.continue_lesson ? (
                <ContinueCard data={dashboard.data.continue_lesson} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-line bg-surface p-6 text-sm text-fg-muted">
                  Программа курса пуста — проверьте содержимое каталога content.
                </div>
              )}
            </div>
            <TodayPlan snapshot={dashboard.data.snapshot} />
          </div>

          <StatsGrid snapshot={dashboard.data.snapshot} totals={dashboard.data.totals} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentActivity items={dashboard.data.recent} />
            </div>
            {course.data ? (
              <CourseProgress course={course.data} snapshot={dashboard.data.snapshot} />
            ) : course.isPending ? (
              <LoadingState label="Загружаем программу…" />
            ) : (
              <ErrorState
                message={course.error?.message ?? 'Не удалось загрузить программу'}
                onRetry={() => void course.refetch()}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
            <p className="text-[12px] leading-relaxed text-fg-muted">
              Встроенный редактор Go с запуском кода уже работает в уроках и в разделе «Редактор».
              Следующий этап — практические задачи с проверкой через настоящие Go-тесты.
            </p>
            <Button asChild variant="ghost" size="sm">
              <Link to="/learning">
                К урокам
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
