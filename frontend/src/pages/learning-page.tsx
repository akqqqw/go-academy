import { BookOpen, Clock3, Filter, Info, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { ModuleAccordion } from '@/features/lessons/module-accordion'
import { useCourse, useDashboard } from '@/services/queries'
import { formatMinutes, plural } from '@/lib/utils'

type LevelFilter = 'all' | 'beginner' | 'intermediate' | 'advanced'

const levelOptions: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'beginner', label: 'Начальный' },
  { value: 'intermediate', label: 'Средний' },
  { value: 'advanced', label: 'Продвинутый' },
]

export function LearningPage() {
  const { data, isPending, isError, error, refetch } = useCourse()
  const dashboard = useDashboard()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [expanded, setExpanded] = useState<string[] | null>(null)

  const modules = useMemo(() => {
    if (!data) return []
    const lowered = query.trim().toLowerCase()
    return data.course.modules
      .filter((module) => level === 'all' || module.level === level)
      .map((module) => {
        if (!lowered) return { module, matches: null as string[] | null }
        const matches = module.lessons
          .filter(
            (lesson) =>
              lesson.title.toLowerCase().includes(lowered) ||
              lesson.summary.toLowerCase().includes(lowered),
          )
          .map((lesson) => lesson.id)
        const moduleMatches =
          module.title.toLowerCase().includes(lowered) ||
          module.summary.toLowerCase().includes(lowered)
        return { module, matches: moduleMatches ? null : matches }
      })
      .filter(({ matches }) => matches === null || matches.length > 0)
  }, [data, level, query])

  const expandedIds = useMemo(() => {
    // При активном поиске раскрываем все совпавшие модули, иначе — текущий модуль.
    if (query.trim()) return modules.map(({ module }) => module.id)
    if (expanded) return expanded
    if (!data) return []
    const withProgress = data.course.modules.find((module) => module.progress > 0)
    return [withProgress?.id ?? data.course.modules[0]?.id].filter(Boolean)
  }, [data, expanded, modules, query])

  const toggle = (id: string) => {
    setExpanded((current) => {
      const list = current ?? expandedIds
      return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
    })
  }

  const lessonsDone = dashboard.data?.snapshot.lessons.completed ?? 0
  const totalProgress = dashboard.data?.snapshot.lessons.percent ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Программа"
        title={data ? data.course.title : 'Обучение'}
        description={
          data
            ? data.course.description
            : 'Загружаем программу курса из локального каталога content.'
        }
        actions={
          data ? (
            <Badge variant="primary" className="h-7 px-2.5 text-[12px]">
              {data.course.modules.length} модулей · {data.course.lesson_count} уроков
            </Badge>
          ) : null
        }
      />

      {isPending ? <LoadingState label="Загружаем программу курса…" /> : null}
      {isError ? <ErrorState message={error.message} onRetry={() => void refetch()} /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">
                  Средний прогресс курса
                </p>
                <span className="text-sm font-semibold tabular-nums text-fg">{totalProgress}%</span>
              </div>
              <Progress value={totalProgress} className="mt-2" height={6} label="Прогресс курса" />
              <p className="mt-2 text-[11px] text-fg-subtle">
                {lessonsDone} уроков завершено · {formatMinutes(data.course.minutes)} материала
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Готово к изучению</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {data.course.ready_count}
              </p>
              <p className="text-[11px] text-fg-subtle">
                из {data.course.lesson_count}{' '}
                {plural(data.course.lesson_count, 'урока', 'уроков', 'уроков')}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Длительность</p>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-fg">
                <Clock3 className="size-4 text-fg-subtle" />
                {Math.round(data.course.minutes / 60)} ч
              </p>
              <p className="text-[11px] text-fg-subtle">при чтении без практики</p>
            </div>
          </div>

          {data.course.ready_count === 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3 text-[12px] leading-relaxed text-fg-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                Программа курса уже загружена. Тексты уроков добавляются на следующем этапе: файлы
                Markdown в <code className="font-mono text-[11px] text-fg">content/lessons</code>{' '}
                автоматически станут доступны здесь и откроются в интерактивном режиме.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти модуль или урок…"
                className="h-9 pl-8 pr-8"
                aria-label="Фильтр по программе"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Очистить фильтр"
                  className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-fg-subtle hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Filter className="size-3.5 text-fg-subtle" />
              <Segmented
                value={level}
                options={levelOptions}
                onChange={setLevel}
                ariaLabel="Фильтр по уровню"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {modules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
                Ничего не найдено. Попробуйте другой запрос или сбросьте фильтр уровня.
                <Button
                  variant="ghost"
                  size="sm"
                  className="mx-auto mt-2 block"
                  onClick={() => {
                    setQuery('')
                    setLevel('all')
                  }}
                >
                  <BookOpen />
                  Показать все модули
                </Button>
              </div>
            ) : (
              modules.map(({ module }) => (
                <ModuleAccordion
                  key={module.id}
                  module={module}
                  query={query}
                  expanded={expandedIds.includes(module.id)}
                  onToggle={() => toggle(module.id)}
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
