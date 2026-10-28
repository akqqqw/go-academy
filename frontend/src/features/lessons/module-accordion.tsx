import { CheckCircle2, ChevronDown, Circle, Clock3, Lock, PlayCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn, formatMinutes, levelLabel, plural } from '@/lib/utils'
import type { CourseModule, LessonMeta } from '@/types'

const levelVariant = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'danger',
} as const

function LessonRow({
  lesson,
  moduleNumber,
  query,
}: {
  lesson: LessonMeta
  moduleNumber: number
  query: string
}) {
  const content = (
    <>
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold tabular-nums',
          lesson.available
            ? 'border-primary/25 bg-primary-soft text-primary'
            : 'border-line bg-surface-muted text-fg-subtle',
        )}
      >
        {lesson.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[13px] font-medium',
              lesson.status === 'completed' ? 'text-fg-muted' : 'text-fg',
            )}
          >
            {lesson.title}
          </span>
          {lesson.available ? null : (
            <Lock className="size-3 shrink-0 text-fg-subtle" aria-label="Контент готовится" />
          )}
        </span>
        {query ? (
          <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">{lesson.summary}</span>
        ) : null}
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-fg-subtle sm:flex">
        <Clock3 className="size-3" />
        {lesson.minutes} мин
      </span>
      {!lesson.available ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-subtle">скоро</span>
      ) : lesson.status === 'completed' ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Урок пройден" />
      ) : lesson.status === 'in_progress' ? (
        <Circle className="size-4 shrink-0 fill-warning/30 text-warning" aria-label="Урок в процессе" />
      ) : (
        <PlayCircle className="size-4 shrink-0 text-fg-subtle transition-colors group-hover:text-primary" />
      )}
    </>
  )

  const baseClass =
    'group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors'

  if (!lesson.available) {
    return (
      <div
        className={cn(baseClass, 'cursor-default opacity-70')}
        title="Теория урока появится на следующем этапе"
        aria-disabled
      >
        {content}
      </div>
    )
  }

  return (
    <Link
      to={`/learning/${lesson.id}`}
      className={cn(baseClass, 'hover:border-line hover:bg-surface-muted')}
    >
      {content}
      <span className="sr-only">
        Урок {moduleNumber}.{lesson.number}
      </span>
    </Link>
  )
}

export function ModuleAccordion({
  module,
  expanded,
  onToggle,
  query = '',
}: {
  module: CourseModule
  expanded: boolean
  onToggle: () => void
  query?: string
}) {
  const completed = Math.round((module.progress / 100) * module.lessons.length)
  const allReady = module.ready === module.lessons.length

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-surface shadow-card transition-colors',
        expanded ? 'border-line-strong' : 'border-line hover:border-line-strong',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted/50"
      >
        <span
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border font-mono text-[12px] font-semibold tabular-nums',
            module.progress > 0
              ? 'border-primary/30 bg-primary-soft text-primary'
              : 'border-line bg-surface-muted text-fg-muted',
          )}
        >
          {String(module.number).padStart(2, '0')}
        </span>

        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-fg">{module.title}</span>
            <Badge variant={levelVariant[module.level as keyof typeof levelVariant] ?? 'default'}>
              {levelLabel(module.level)}
            </Badge>
            {module.progress === 100 ? <Badge variant="success">Пройден</Badge> : null}
            {!allReady ? (
              <Badge variant="outline">{module.ready} из {module.lessons.length} готово</Badge>
            ) : null}
          </span>
          <span className="block text-[12px] leading-relaxed text-fg-muted">{module.summary}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-fg-subtle">
            <span>
              {module.lessons.length}{' '}
              {plural(module.lessons.length, 'урок', 'урока', 'уроков')}
            </span>
            <span>·</span>
            <span>{formatMinutes(module.minutes)}</span>
            <span>·</span>
            <span>
              {completed} пройдено · {module.progress}%
            </span>
          </span>
          <span className="block max-w-md pt-1">
            <Progress value={module.progress} height={4} label={`Прогресс модуля ${module.title}`} />
          </span>
        </span>

        <ChevronDown
          className={cn(
            'mt-1 size-4 shrink-0 text-fg-subtle transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded ? (
        <div className="space-y-0.5 border-t border-line bg-surface-inset/50 p-2">
          {module.lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              moduleNumber={module.number}
              query={query}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
