import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  Layers,
  ListChecks,
  Loader2,
  MousePointerClick,
  NotebookPen,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { SplitPane } from '@/components/editor/split-pane'
import { MarkdownViewer, extractHeadings } from '@/components/markdown'
import { PageHeader } from '@/components/page-header'
import { ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { CodeWorkbench } from '@/features/editor/code-workbench'
import { LessonNotesPanel } from '@/features/notes/lesson-notes-panel'
import { ApiError, api } from '@/lib/api'
import { cn, formatMinutes, levelLabel, plural } from '@/lib/utils'
import { useCourse, useLessonContent } from '@/services/queries'

/** Подсвечивает в оглавлении раздел, который сейчас на экране. */
function useActiveHeading(ids: string[], enabled: boolean) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)

  useEffect(() => {
    if (!enabled || ids.length === 0) return
    if (typeof IntersectionObserver === 'undefined') return
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-72px 0px -65% 0px', threshold: 0 },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [ids, enabled])

  return active
}

function LessonSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-1/3 animate-pulse-soft rounded bg-surface-muted" />
      <div className="h-10 w-2/3 animate-pulse-soft rounded bg-surface-muted" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-3 animate-pulse-soft rounded bg-surface-muted',
                index % 3 === 0 ? 'w-4/5' : 'w-full',
              )}
            />
          ))}
        </div>
        <div className="h-[420px] animate-pulse-soft rounded-xl bg-surface-muted" />
      </div>
    </div>
  )
}

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const course = useCourse()
  const content = useLessonContent(lessonId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const openedRef = useRef<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [selection, setSelection] = useState<{ text: string; stamp: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const theoryRef = useRef<HTMLDivElement>(null)
  const theoryBodyRef = useRef<HTMLDivElement>(null)

  const markdown = content.data?.markdown ?? ''
  const headings = useMemo(() => extractHeadings(markdown), [markdown])
  const headingIds = useMemo(() => headings.map((heading) => heading.id), [headings])
  const activeHeading = useActiveHeading(headingIds, Boolean(content.data))

  // Открытие урока фиксируется в SQLite: так работают «Продолжить», история
  // активности и дневной план.
  useEffect(() => {
    if (!lessonId || !content.data || openedRef.current === lessonId) return
    openedRef.current = lessonId
    api
      .openLesson(lessonId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        void queryClient.invalidateQueries({ queryKey: ['progress'] })
        void queryClient.invalidateQueries({ queryKey: ['activity'] })
      })
      .catch(() => {
        openedRef.current = null
      })
  }, [content.data, lessonId, queryClient])

  // Выделение внутри теории превращается в кандидата на заметку.
  const captureSelection = () => {
    const selectionApi = typeof window === 'undefined' ? null : window.getSelection()
    const text = selectionApi?.toString().replace(/\s+/g, ' ').trim() ?? ''
    const inside = Boolean(
      selectionApi &&
        theoryBodyRef.current &&
        selectionApi.anchorNode &&
        theoryBodyRef.current.contains(selectionApi.anchorNode),
    )
    setSelectedText(inside && text.length >= 3 ? text : '')
  }

  const complete = async () => {
    if (!lessonId) return
    setCompleting(true)
    try {
      const result = await api.completeLesson(lessonId)
      toast.success(
        result.already_completed ? 'Урок уже был отмечен пройденным' : 'Урок отмечен пройденным',
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lesson-content', lessonId] }),
        queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
        queryClient.invalidateQueries({ queryKey: ['course'] }),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
      ])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось отметить урок')
    } finally {
      setCompleting(false)
    }
  }

  const goToNext = () => {
    const next = content.data?.next
    if (!next) return
    if (!next.available) {
      toast.info('Материал следующего урока ещё готовится')
      return
    }
    navigate(`/learning/${next.id}`)
  }

  if (content.isPending) return <LessonSkeleton />

  const notReady =
    content.isError &&
    content.error instanceof ApiError &&
    (content.error.code === 'content_not_ready' || content.error.code === 'lesson_not_found')

  if (notReady) {
    return (
      <NotReadyLesson
        lessonId={lessonId ?? ''}
        message={
          (content.error as ApiError).code === 'lesson_not_found'
            ? 'Такого урока нет в программе курса.'
            : 'Материал этого урока ещё готовится: теория и примеры появятся в следующих обновлениях.'
        }
        courseError={course.isError ? course.error.message : null}
        onRetry={() => void content.refetch()}
      />
    )
  }

  if (content.isError) {
    return <ErrorState message={content.error.message} onRetry={() => void content.refetch()} />
  }

  const { lesson, prev, next, starter_code: starterCode } = content.data
  const completed = lesson.status === 'completed'
  const modulePercent =
    lesson.module_total > 0 ? Math.round((lesson.module_completed / lesson.module_total) * 100) : 0

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', `${location.pathname}#${id}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
        <Link to="/learning" className="inline-flex items-center gap-1 hover:text-fg">
          <ArrowLeft className="size-3.5" />
          Обучение
        </Link>
        <ChevronRight className="size-3" />
        <span>Модуль {lesson.module_number}</span>
        <ChevronRight className="size-3" />
        <span className="text-fg-muted">Урок {lesson.number}</span>
      </div>

      <PageHeader
        eyebrow={`Модуль ${lesson.module_number} · ${lesson.module_title}`}
        title={lesson.title}
        description={lesson.summary}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{levelLabel(lesson.module_level)}</Badge>
            {completed ? (
              <Badge variant="success">
                <Check className="size-3" />
                Пройден
              </Badge>
            ) : lesson.status === 'in_progress' ? (
              <Badge variant="warning">В процессе</Badge>
            ) : (
              <Badge variant="outline">Не начат</Badge>
            )}
            <Button
              size="sm"
              variant={completed ? 'secondary' : 'default'}
              onClick={() => void complete()}
              disabled={completing}
            >
              {completing ? <Loader2 className="animate-spin" /> : <Check />}
              {completed ? 'Отметить повторно' : 'Урок пройден'}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />~{formatMinutes(lesson.minutes)} чтения
        </span>
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="size-3.5" />
          Урок {lesson.position} из {lesson.total} в курсе
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Layers className="size-3.5" />
          {lesson.module_completed} из {lesson.module_total}{' '}
          {plural(lesson.module_total, 'урока', 'уроков', 'уроков')} в модуле
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-fg-subtle">
          <MousePointerClick className="size-3.5" />
          Перетащите границу между теорией и редактором
        </span>
      </div>

      <div className="lg:h-[calc(100vh-14rem)] lg:min-h-[620px]">
        <SplitPane
          storageKey="lesson"
          initialRatio={0.46}
          minRatio={0.28}
          maxRatio={0.7}
          leftLabel="Теория урока"
          rightLabel="Редактор кода"
          className="h-full"
          left={
            <div ref={theoryRef} className="flex h-full min-h-0 flex-col gap-3 lg:pr-3">
              <Card className="shrink-0">
                <CardHeader className="border-b border-line py-2.5">
                  <CardTitle className="flex items-center gap-2 text-[13px]">
                    <Target className="size-4 text-primary" />
                    Цели обучения
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2.5 pb-3">
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {lesson.objectives.map((objective) => (
                      <li
                        key={objective}
                        className="flex items-start gap-2 text-[12.5px] text-fg-muted"
                      >
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                        <span>{objective}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {headings.length > 0 ? (
                <nav
                  aria-label="Содержание урока"
                  className="-mx-0.5 flex shrink-0 gap-1 overflow-x-auto px-0.5 pb-1"
                >
                  {headings
                    .filter((heading) => heading.level === 2)
                    .map((heading) => (
                      <button
                        key={heading.id}
                        type="button"
                        onClick={() => scrollToHeading(heading.id)}
                        className={cn(
                          'shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                          activeHeading === heading.id
                            ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                            : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
                        )}
                      >
                        {heading.text}
                      </button>
                    ))}
                </nav>
              ) : null}

              <div
                ref={theoryBodyRef}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                className="relative min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-surface px-5 py-4 shadow-card"
              >
                {selectedText ? (
                  <div className="sticky top-0 z-10 -mx-3 -mt-2 mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/90 px-2 py-1.5 backdrop-blur">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-primary">
                      Выделено: «{selectedText.slice(0, 60)}
                      {selectedText.length > 60 ? '…' : ''}»
                    </span>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[11.5px]"
                      onClick={() => {
                        setSelection({ text: selectedText, stamp: Date.now() })
                        setSelectedText('')
                      }}
                    >
                      <NotebookPen className="size-3" />В заметку
                    </Button>
                  </div>
                ) : null}
                <MarkdownViewer markdown={markdown} />
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 pt-0.5">
                {prev ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/learning/${prev.id}`}>
                      <ArrowLeft />
                      <span className="max-w-[150px] truncate">{prev.title}</span>
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/learning">
                      <ArrowLeft />
                      Программа курса
                    </Link>
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-fg-subtle">
                    {lesson.module_completed}/{lesson.module_total} в модуле · {modulePercent}%
                  </span>
                  {next?.available ? (
                    <Button size="sm" variant="outline" onClick={goToNext}>
                      Далее
                      <ArrowRight />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          }
          right={
            <div className="flex h-full min-h-[520px] flex-col lg:h-full lg:pl-1">
              <CodeWorkbench
                draftKey={`lesson-${lesson.id}`}
                starter={starterCode || 'package main\n\nfunc main() {\n\t// ваш код\n}\n'}
                source="lesson"
                refId={lesson.id}
                className="h-full"
                extraActions={
                  <span className="hidden items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-[11px] text-fg-subtle xl:inline-flex">
                    <ListChecks className="size-3" />
                    {lesson.title}
                  </span>
                }
              />
            </div>
          }
        />
      </div>

      <LessonNotesPanel
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        selectionDraft={selection}
        onSelectionUsed={() => setSelection(null)}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Info className="size-3.5" />
          Прогресс модуля: {lesson.module_completed} из {lesson.module_total}
        </p>
        <div className="min-w-[120px] max-w-[200px] flex-1">
          <Progress value={modulePercent} height={4} label="Прогресс модуля" />
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link to="/learning">
            <ArrowLeft />
            Программа курса
          </Link>
        </Button>
        {next?.available ? (
          <Button size="sm" onClick={goToNext}>
            {next.title.length > 30 ? 'Следующий урок' : `Далее: ${next.title}`}
            <ArrowRight />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function NotReadyLesson({
  lessonId,
  message,
  onRetry,
  courseError,
}: {
  lessonId: string
  message: string
  onRetry: () => void
  courseError: string | null
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Материал готовится"
        description={message}
        actions={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Проверить снова
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <Info className="size-4 text-primary" />
              Что уже работает
            </p>
            <ul className="space-y-1.5 text-[13px] text-fg-muted">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                Программа курса и структура модулей
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                Пятнадцать уроков с теорией, практикой и встроенным редактором
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                Запуск Go-кода, gofmt и история запусков
              </li>
            </ul>
            <p className="text-[12px] leading-relaxed text-fg-subtle">
              Тексты остальных уроков добавляются постепенно: файл{' '}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">
                content/lessons/&lt;модуль&gt;/{lessonId}.md
              </code>{' '}
              достаточно положить на диск и нажать «Перечитать контент» в настройках.
            </p>
            {courseError ? (
              <p className="text-[12px] text-danger">Программа курса: {courseError}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px]">
              <ListChecks className="size-4 text-fg-subtle" />
              Где искать готовое
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[12px] text-fg-muted">
            <p>Откройте программу курса — доступные уроки отмечены значком запуска.</p>
            <Button asChild size="sm" variant="secondary" className="w-full">
              <Link to="/learning">
                К программе
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
