import { ArrowRight, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ProgressRing } from '@/components/progress-ring'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { plural } from '@/lib/utils'
import type { CourseResponse, Snapshot } from '@/types'

export function CourseProgress({
  course,
  snapshot,
}: {
  course: CourseResponse
  snapshot: Snapshot
}) {
  const modules = course.course.modules
  const lessonsDone = snapshot.lessons.completed
  const lessonsTotal = snapshot.lessons.total

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-4 text-primary" />
          Программа курса
        </CardTitle>
        <span className="text-[11px] text-fg-subtle">
          {modules.length} {plural(modules.length, 'модуль', 'модуля', 'модулей')}
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-4">
          <ProgressRing value={snapshot.course_percent} size={64} strokeWidth={6}>
            <span className="text-[13px] font-semibold tabular-nums text-fg">
              {snapshot.course_percent}%
            </span>
          </ProgressRing>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-fg">
              {lessonsDone} из {lessonsTotal}{' '}
              {plural(lessonsTotal, 'урока', 'уроков', 'уроков')} пройдено
            </p>
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              {course.course.ready_count > 0
                ? `Готово к изучению: ${course.course.ready_count} ${plural(course.course.ready_count, 'урок', 'урока', 'уроков')}`
                : 'Теория уроков готовится к публикации на следующем этапе'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {modules.slice(0, 3).map((module) => (
            <Link
              key={module.id}
              to="/learning"
              className="block rounded-lg border border-line bg-surface-inset px-3 py-2 transition-colors hover:border-line-strong"
            >
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-fg-muted">
                  {module.number}. {module.title}
                </span>
                <span className="shrink-0 tabular-nums text-fg-subtle">
                  {module.progress}%
                </span>
              </div>
              <Progress value={module.progress} height={3} className="mt-1.5" />
            </Link>
          ))}
        </div>

        <Button asChild variant="secondary" size="sm" className="mt-auto w-full">
          <Link to="/learning">
            Открыть программу
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
