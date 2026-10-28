import {
  BookOpen,
  FolderPlus,
  FolderTree,
  Link2,
  Loader2,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { NoteEditor } from '@/features/notes/note-editor'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { useNote, useNotes } from '@/services/queries'
import { useQueryClient } from '@tanstack/react-query'
import type { Note } from '@/types'

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

/** NoteRow — карточка заметки в списке. */
function NoteRow({
  note,
  active,
  onOpen,
}: {
  note: Note
  active: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
        active
          ? 'border-primary/40 bg-primary-soft/50'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted/40',
      )}
    >
      <div className="flex items-center gap-1.5">
        {note.pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{note.title}</span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-fg-subtle">
          {formatDate(note.updated_at)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-fg-muted">{note.excerpt}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {note.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] text-fg-muted"
          >
            #{tag}
          </span>
        ))}
        {note.lesson_id ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-violet">
            <Link2 className="size-2.5" />
            урок
          </span>
        ) : null}
      </div>
    </button>
  )
}

export function NotesPage() {
  const { noteId } = useParams<{ noteId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [folder, setFolder] = useState<string>('')
  const [tag, setTag] = useState<string>('')
  const [query, setQuery] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null)
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null)
  const [folderRename, setFolderRename] = useState('')

  const filters = useMemo(
    () => ({
      folder: folder || undefined,
      tag: tag || undefined,
      q: query.trim() || undefined,
      pinned: pinnedOnly || undefined,
    }),
    [folder, pinnedOnly, query, tag],
  )

  const notesQuery = useNotes(filters)
  const noteQuery = useNote(noteId)
  const data = notesQuery.data
  const folders = data?.folders ?? []
  const stats = data?.stats

  const selected = noteQuery.data?.note ?? null

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notes'] }),
      noteId ? queryClient.invalidateQueries({ queryKey: ['note', noteId] }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ['lesson-notes'] }),
    ])
  }

  const createNote = async () => {
    setCreating(true)
    try {
      const response = await api.createNote({
        title: 'Новая заметка',
        body: '',
        folder: folder || undefined,
        tags: tag ? [tag] : undefined,
      })
      await refresh()
      navigate(`/notes/${response.note.id}`)
      toast.success('Заметка создана')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать заметку')
    } finally {
      setCreating(false)
    }
  }

  const deleteNote = async (id: string) => {
    try {
      await api.deleteNote(id)
      toast.success('Заметка удалена')
      if (noteId === id) navigate('/notes')
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить заметку')
    }
  }

  const createFolder = async () => {
    const name = folderDraft.trim()
    if (!name) return
    try {
      const response = await api.createFolder(name)
      setFolderDraft('')
      await refresh()
      setFolder(response.folder.name)
      toast.success(`Папка «${response.folder.name}» создана`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать папку')
    }
  }

  const renameFolder = async () => {
    if (!editingFolder) return
    try {
      await api.renameFolder(editingFolder.id, folderRename)
      await refresh()
      setEditingFolder(null)
      toast.success('Папка переименована')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось переименовать папку')
    }
  }

  const deleteFolder = async () => {
    if (!folderToDelete) return
    try {
      await api.deleteFolder(folderToDelete.id)
      if (folder === folderToDelete.name) setFolder('')
      await refresh()
      toast.success('Папка удалена, заметки перенесены в «Общее»')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить папку')
    } finally {
      setFolderToDelete(null)
    }
  }

  // Если открыт прямой адрес /notes/<id>, а такой заметки нет в текущем фильтре,
  // список всё равно должен показать её существование — фильтры не сбрасываем.
  useEffect(() => {
    if (!noteId) return
    if (noteQuery.isError) {
      toast.error('Заметка не найдена')
      navigate('/notes')
    }
  }, [navigate, noteId, noteQuery.isError])

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Личное"
        title="Заметки"
        description="Собственные записи в Markdown: папки, теги и связь с уроками. Текст хранится в Supabase и сохраняется автоматически."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="primary">
              <NotebookPen className="size-3" />
              {stats?.total ?? 0} {plural(stats?.total ?? 0, 'заметка', 'заметки', 'заметок')}
            </Badge>
            <Button size="sm" onClick={() => void createNote()} disabled={creating}>
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              Новая заметка
            </Button>
          </div>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Заметок', value: stats?.total ?? 0, icon: NotebookPen },
          { label: 'Слов', value: stats?.words ?? 0, icon: Tag },
          { label: 'Папок', value: stats?.folders ?? 0, icon: FolderTree },
          { label: 'Связано с уроками', value: stats?.linked ?? 0, icon: BookOpen },
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

      <div className="grid gap-3 lg:grid-cols-[200px_minmax(220px,300px)_1fr] lg:items-start">
        {/* Папки */}
        <aside className="rounded-xl border border-line bg-surface p-2 shadow-card">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Папки</span>
            <button
              type="button"
              onClick={() => setShowFolders(true)}
              className="rounded p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg"
              aria-label="Добавить папку"
            >
              <FolderPlus className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFolder('')}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px] transition-colors',
              folder === '' ? 'bg-primary-soft font-medium text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
            )}
          >
            <span>Все заметки</span>
            <span className="tabular-nums text-[11px]">{stats?.total ?? 0}</span>
          </button>
          {folders.map((item) => (
            <div key={item.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => setFolder(item.name)}
                className={cn(
                  'flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
                  folder === item.name
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="ml-1 shrink-0 tabular-nums text-[11px]">{item.count}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingFolder({ id: item.id, name: item.name })
                  setFolderRename(item.name)
                }}
                aria-label={`Переименовать папку ${item.name}`}
                className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
              >
                <Pencil className="size-3" />
              </button>
              {item.name !== 'Общее' ? (
                <button
                  type="button"
                  onClick={() => setFolderToDelete({ id: item.id, name: item.name })}
                  aria-label={`Удалить папку ${item.name}`}
                  className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              ) : null}
            </div>
          ))}

          <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => setPinnedOnly((value) => !value)}
              className={cn(
                'inline-flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] transition-colors',
                pinnedOnly ? 'bg-primary-soft font-medium text-primary' : 'text-fg-muted hover:text-fg',
              )}
            >
              <Pin className="size-3" />
              Только закреплённые
            </button>
          </div>
        </aside>

        {/* Список заметок */}
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-line bg-surface p-2 shadow-card">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по заметкам"
              aria-label="Поиск по заметкам"
              className="h-8 pl-8 text-[12.5px]"
            />
          </div>

          {data && data.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {data.tags.slice(0, 8).map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => setTag(tag === item.tag ? '' : item.tag)}
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[10.5px] transition-colors',
                    tag === item.tag
                      ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  #{item.tag} <span className="text-fg-subtle">{item.count}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="min-h-[240px] flex-1 space-y-1.5 overflow-y-auto pr-0.5 lg:max-h-[calc(100vh-24rem)]">
            {notesQuery.isPending ? <LoadingState label="Загружаем заметки…" /> : null}
            {notesQuery.isError ? (
              <ErrorState message={notesQuery.error.message} onRetry={() => void notesQuery.refetch()} />
            ) : null}
            {data && data.notes.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title="Заметок нет"
                description={
                  query || tag || folder || pinnedOnly
                    ? 'Под выбранные фильтры ничего не подошло.'
                    : 'Создайте первую заметку или добавьте её из выделенного текста урока.'
                }
              />
            ) : null}
            {data?.notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                active={note.id === noteId}
                onOpen={() => navigate(`/notes/${note.id}`)}
              />
            ))}
          </div>

          {query || tag || folder || pinnedOnly ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setTag('')
                setFolder('')
                setPinnedOnly(false)
              }}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] text-fg-muted hover:text-fg"
            >
              <X className="size-3" />
              Сбросить фильтры
            </button>
          ) : null}
        </section>

        {/* Редактор */}
        <section className="min-h-[420px]">
          {noteId && noteQuery.isPending ? <LoadingState label="Открываем заметку…" /> : null}
          {noteId && noteQuery.isError ? (
            <ErrorState message="Заметка не найдена" onRetry={() => navigate('/notes')} />
          ) : null}
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              folders={folders}
              onSaved={() => void refresh()}
              onDeleted={(id) => void deleteNote(id)}
              className="lg:max-h-[calc(100vh-15rem)]"
            />
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 text-center">
              <NotebookPen className="size-7 text-fg-subtle" />
              <div>
                <p className="text-[13.5px] font-medium text-fg">Выберите заметку</p>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-fg-muted">
                  Слева — папки и поиск, в центре — список. Заметку можно создать здесь или из
                  выделенного фрагмента теории на странице урока.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void createNote()}>
                <Plus />
                Новая заметка
              </Button>
            </div>
          )}
        </section>
      </div>

      <Dialog open={showFolders} onOpenChange={setShowFolders}>
        <DialogContent className="w-[min(420px,92vw)]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-fg">Новая папка</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 px-5 py-4">
            <Input
              value={folderDraft}
              onChange={(event) => setFolderDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createFolder()
                }
              }}
              placeholder="Например, Шпаргалки"
              aria-label="Название папки"
              autoFocus
            />
            <p className="text-[11.5px] text-fg-subtle">
              Папка нужна для порядка: заметки можно переносить между ними, а удаление папки
              переносит содержимое в «Общее».
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 pb-4">
            <Button variant="ghost" size="sm" onClick={() => setShowFolders(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={() => void createFolder()} disabled={!folderDraft.trim()}>
              Создать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingFolder)} onOpenChange={(open) => !open && setEditingFolder(null)}>
        <DialogContent className="w-[min(420px,92vw)]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-fg">Переименовать папку</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4">
            <Input
              value={folderRename}
              onChange={(event) => setFolderRename(event.target.value)}
              aria-label="Новое название папки"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-2 px-5 pb-4">
            <Button variant="ghost" size="sm" onClick={() => setEditingFolder(null)}>
              Отмена
            </Button>
            <Button size="sm" onClick={() => void renameFolder()} disabled={!folderRename.trim()}>
              Сохранить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(folderToDelete)}
        onOpenChange={() => setFolderToDelete(null)}
        title={`Удалить папку «${folderToDelete?.name ?? ''}»?`}
        description="Заметки не пропадут: они переедут в папку «Общее»."
        confirmLabel="Удалить папку"
        destructive
        onConfirm={() => void deleteFolder()}
      />
    </div>
  )
}
