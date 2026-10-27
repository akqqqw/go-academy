import {
  CheckCircle2,
  CloudOff,
  Eye,
  FolderInput,
  Link2,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { MarkdownViewer } from '@/components/markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useNoteAutosave } from '@/features/notes/use-note-autosave'
import { cn } from '@/lib/utils'
import type { Note, NoteFolder } from '@/types'

/** Поле тегов: значения вводятся через запятую или Enter. */
function TagsField({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...tags]
    for (const part of parts) {
      if (!next.includes(part) && next.length < 12) next.push(part)
    }
    onChange(next)
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-inset px-2 py-1.5">
      <Tag className="size-3.5 shrink-0 text-fg-subtle" />
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {tag}
          <button
            type="button"
            aria-label={`Убрать тег ${tag}`}
            onClick={() => onChange(tags.filter((item) => item !== tag))}
            className="rounded-full p-0.5 hover:bg-primary/15"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            commit(draft)
          } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={tags.length === 0 ? 'теги через запятую' : 'ещё тег'}
        aria-label="Теги заметки"
        className="min-w-[90px] flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  )
}

interface NoteEditorProps {
  note: Note
  folders: NoteFolder[]
  onSaved: (note: Note) => void
  onDeleted: (id: string) => void
  className?: string
}

/**
 * NoteEditor — редактор одной заметки: заголовок, папка, теги, Markdown-текст
 * и предпросмотр. Всё сохраняется автоматически; кнопка «Сохранить» нужна для
 * явного подтверждения и работает даже при отключённом автосохранении.
 */
export function NoteEditor({ note, folders, onSaved, onDeleted, className }: NoteEditorProps) {
  const editor = useNoteAutosave({ note, onSaved })
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const status = useMemo(() => {
    switch (editor.state) {
      case 'saving':
        return { icon: Loader2, label: 'Сохраняем…', className: 'text-fg-muted', spin: true }
      case 'saved':
        return { icon: CheckCircle2, label: 'Сохранено', className: 'text-success', spin: false }
      case 'dirty':
        return { icon: Save, label: 'Есть изменения', className: 'text-warning', spin: false }
      case 'error':
        return { icon: CloudOff, label: 'Ошибка сохранения', className: 'text-danger', spin: false }
      default:
        return { icon: CheckCircle2, label: 'Автосохранение', className: 'text-fg-subtle', spin: false }
    }
  }, [editor.state])

  const StatusIcon = status.icon

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-card">
        <Input
          value={editor.title}
          onChange={(event) => editor.setTitle(event.target.value)}
          placeholder="Заголовок заметки"
          aria-label="Заголовок заметки"
          className="h-8 min-w-[160px] flex-1 border-transparent bg-transparent px-1 text-[15px] font-medium shadow-none focus:border-line"
        />

        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
          <FolderInput className="size-3.5" />
          <select
            value={editor.folder}
            onChange={(event) => editor.setFolder(event.target.value)}
            aria-label="Папка заметки"
            className="h-7 rounded-md border border-line bg-surface-inset px-1.5 text-[12px] text-fg outline-none focus:border-primary/60"
          >
            {!folders.some((folder) => folder.name === editor.folder) ? (
              <option value={editor.folder}>{editor.folder}</option>
            ) : null}
            {folders.map((folder) => (
              <option key={folder.id} value={folder.name}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>

        <span className={cn('inline-flex items-center gap-1 text-[11px]', status.className)}>
          <StatusIcon className={cn('size-3', status.spin && 'animate-spin')} />
          {status.label}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5"
            onClick={() => editor.setPinned(!editor.pinned)}
            title={editor.pinned ? 'Снять закрепление' : 'Закрепить заметку'}
          >
            {editor.pinned ? <Pin className="size-3.5 text-primary" /> : <PinOff className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => void editor.save()}>
            <Save className="size-3.5" />
            Сохранить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-danger hover:bg-danger-soft/60"
            aria-label="Удалить заметку"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TagsField tags={editor.tags} onChange={editor.setTags} />
        {note.lesson_id ? (
          <Badge variant="violet">
            <Link2 className="size-3" />
            <Link to={`/learning/${note.lesson_id}`} className="hover:underline">
              урок {note.lesson_id}
            </Link>
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-fg-subtle">
          <span>{editor.body.trim() ? `${editor.body.trim().split(/\s+/).length} слов` : 'пусто'}</span>
          <span className="inline-flex items-center gap-1">
            <Switch
              checked={editor.pinned}
              onCheckedChange={editor.setPinned}
              aria-label="Закрепить заметку"
            />
            закрепить
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-line pb-1">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors',
            mode === 'edit' ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:text-fg',
          )}
          aria-pressed={mode === 'edit'}
        >
          <Pencil className="size-3.5" />
          Markdown
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors',
            mode === 'preview' ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:text-fg',
          )}
          aria-pressed={mode === 'preview'}
        >
          <Eye className="size-3.5" />
          Просмотр
        </button>
        <span className="ml-auto text-[11px] text-fg-subtle">
          Markdown, блоки кода Go подсвечиваются
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        {mode === 'edit' ? (
          <textarea
            value={editor.body}
            onChange={(event) => editor.setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void editor.save()
              }
            }}
            placeholder={'Пишите заметку в Markdown.\n\n```go\nfmt.Println("пример")\n```'}
            aria-label="Текст заметки"
            spellCheck={false}
            className="h-full min-h-[320px] w-full resize-none bg-transparent px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
          />
        ) : (
          <div className="h-full min-h-[320px] overflow-y-auto px-5 py-4">
            {editor.body.trim() ? (
              <MarkdownViewer markdown={editor.body} />
            ) : (
              <p className="text-[12.5px] text-fg-subtle">Пока пусто — напишите что-нибудь в Markdown.</p>
            )}
          </div>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-subtle">
        <span>Ctrl+S — сохранить сразу.</span>
        {editor.savedAt ? <span>Изменено: {new Date(editor.savedAt).toLocaleString('ru-RU')}</span> : null}
        {editor.error ? <span className="text-danger">{editor.error}</span> : null}
      </p>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Удалить заметку?"
        description="Заметка и её теги будут удалены из локальной базы. Действие нельзя отменить."
        confirmLabel="Удалить"
        destructive
        onConfirm={() => onDeleted(note.id)}
      />
    </div>
  )
}
