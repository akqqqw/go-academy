import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, ListPlus, Loader2, NotebookPen, Pin, Plus, Quote, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { useLessonNotes } from '@/services/queries'

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

/** Фрагмент теории превращается в цитату Markdown с обратной ссылкой на урок. */
export function quoteFragment(text: string) {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line.trim()}`)
    .join('\n')
}

interface LessonNotesPanelProps {
  lessonId: string
  lessonTitle: string
  /** Текст, добавленный из выделенного фрагмента теории. */
  selectionDraft?: { text: string; stamp: number } | null
  onSelectionUsed?: () => void
}

/**
 * LessonNotesPanel — заметки к текущему уроку. Здесь же создаются новые:
 * обычная заметка или цитата из выделенного фрагмента теории.
 */
export function LessonNotesPanel({
  lessonId,
  lessonTitle,
  selectionDraft,
  onSelectionUsed,
}: LessonNotesPanelProps) {
  const queryClient = useQueryClient()
  const notesQuery = useLessonNotes(lessonId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)

  const notes = notesQuery.data?.notes ?? []

  const openBlank = () => {
    setTitle('')
    setBody('')
    setTags('')
    setOpen(true)
  }

  // Выделение в теории: диалог открывается сразу с цитатой.
  useEffect(() => {
    if (!selectionDraft) return
    setTitle('')
    setBody(quoteFragment(selectionDraft.text))
    setTags('')
    setOpen(true)
    onSelectionUsed?.()
  }, [onSelectionUsed, selectionDraft])

  const save = async () => {
    const text = body.trim()
    if (!text && !title.trim()) {
      toast.error('Заметка пустая: добавьте текст')
      return
    }
    setSaving(true)
    try {
      const response = await api.createNote({
        title: title.trim() || undefined,
        body: text,
        folder: 'Уроки',
        lesson_id: lessonId,
        tags: tags
          .split(',')
          .map((tag) => tag.trim().replace(/^#/, ''))
          .filter(Boolean),
      })
      await queryClient.invalidateQueries({ queryKey: ['lesson-notes'] })
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Заметка сохранена', {
        description: 'Она привязана к уроку и доступна в разделе «Заметки».',
        action: { label: 'Открыть', onClick: () => window.location.assign(`/notes/${response.note.id}`) },
      })
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить заметку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-line py-2.5">
        <CardTitle className="flex items-center gap-2 text-[13px]">
          <NotebookPen className="size-4 text-primary" />
          Заметки к уроку
          {notes.length > 0 ? (
            <Badge variant="primary">
              {notes.length} {plural(notes.length, 'заметка', 'заметки', 'заметок')}
            </Badge>
          ) : null}
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7" onClick={openBlank}>
          <Plus className="size-3.5" />
          Добавить заметку
        </Button>
      </CardHeader>
      <CardContent className="pt-2.5 pb-3">
        {notesQuery.isPending ? (
          <p className="text-[12px] text-fg-subtle">Загружаем заметки…</p>
        ) : null}
        {notesQuery.isError ? (
          <p className="text-[12px] text-danger">Не удалось загрузить заметки к уроку</p>
        ) : null}
        {!notesQuery.isPending && notes.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-fg-muted">
            Заметок пока нет. Добавьте свою или выделите фрагмент теории и нажмите «В заметку» —
            фрагмент сохранится цитатой вместе со ссылкой на урок.
          </p>
        ) : null}

        {notes.length > 0 ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}`}
                  className="group flex h-full flex-col gap-1 rounded-lg border border-line bg-surface px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-surface-muted/40"
                >
                  <span className="flex items-center gap-1.5">
                    {note.pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
                      {note.title}
                    </span>
                    <ArrowUpRight className="size-3 shrink-0 text-fg-subtle group-hover:text-primary" />
                  </span>
                  <span className="line-clamp-2 text-[11.5px] leading-relaxed text-fg-muted">
                    {note.excerpt}
                  </span>
                  <span className="flex items-center gap-2 text-[10.5px] text-fg-subtle">
                    <span>{formatDate(note.updated_at)}</span>
                    {note.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5">
                        <Tag className="size-2.5" />
                        {tag}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(560px,94vw)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold text-fg">
              <ListPlus className="size-4 text-primary" />
              Заметка к уроку «{lessonTitle}»
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 px-5 py-4">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Заголовок (необязательно — возьмётся первая строка)"
              aria-label="Заголовок заметки к уроку"
              className="h-8 text-[13px]"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={'Текст в Markdown.\n\n```go\nfmt.Println("hello")\n```'}
              aria-label="Текст заметки к уроку"
              spellCheck={false}
              className="min-h-[180px] w-full resize-y rounded-lg border border-line bg-surface-inset px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg outline-none focus:border-primary/60"
            />
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Теги через запятую"
              aria-label="Теги заметки к уроку"
              className="h-8 text-[12.5px]"
            />
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
              <Quote className="mt-0.5 size-3 shrink-0" />
              Заметка попадёт в папку «Уроки» и останется связанной с этим уроком.
            </p>
          </div>
          <div className={cn('flex items-center justify-end gap-2 px-5 pb-4')}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <ListPlus className="size-3.5" />}
              Сохранить заметку
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
