import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type { Note, NoteInput } from '@/types'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface UseNoteAutosaveOptions {
  note: Note | null
  /** Задержка автосохранения: достаточно, чтобы не отправлять каждый символ. */
  debounceMs?: number
  onSaved?: (note: Note) => void
}

/**
 * useNoteAutosave — рабочая копия заметки с автосохранением.
 *
 * Правки живут в локальном состоянии и уходят на сервер через PUT с задержкой;
 * кнопка «Сохранить» отправляет изменения сразу. Пустое поле заголовка
 * заменяется на первую строку текста уже на сервере, поэтому интерфейс не
 * навязывает название.
 */
export function useNoteAutosave({ note, debounceMs = 900, onSaved }: UseNoteAutosaveOptions) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [folder, setFolder] = useState(note?.folder ?? 'Общее')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [pinned, setPinned] = useState(note?.pinned ?? false)
  const [state, setState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(note?.updated_at ?? null)
  const [error, setError] = useState<string | null>(null)

  const noteId = note?.id ?? null
  const timer = useRef<number | null>(null)
  const dirty = useRef(false)
  // Значения держим в ref: таймер не должен зависеть от перерисовок.
  const values = useRef({ title, body, folder, tags, pinned })
  values.current = { title, body, folder, tags, pinned }

  // При переключении на другую заметку сбрасываем локальные поля.
  useEffect(() => {
    setTitle(note?.title ?? '')
    setBody(note?.body ?? '')
    setFolder(note?.folder ?? 'Общее')
    setTags(note?.tags ?? [])
    setPinned(note?.pinned ?? false)
    setSavedAt(note?.updated_at ?? null)
    setState('idle')
    setError(null)
    dirty.current = false
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (options?: { silent?: boolean }) => {
    if (!noteId) return null
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const snapshot = values.current
    const payload: NoteInput = {
      title: snapshot.title,
      body: snapshot.body,
      folder: snapshot.folder,
      tags: snapshot.tags,
      pinned: snapshot.pinned,
      lesson_id: note?.lesson_id,
    }
    setState('saving')
    setError(null)
    try {
      const response = await api.updateNote(noteId, payload)
      dirty.current = false
      setState('saved')
      setSavedAt(response.note.updated_at)
      onSaved?.(response.note)
      if (!options?.silent) toast.success('Заметка сохранена')
      return response.note
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'не удалось сохранить заметку'
      setState('error')
      setError(message)
      if (!options?.silent) toast.error(message)
      return null
    }
  }

  // Планировщик автосохранения: срабатывает только при реальных изменениях.
  const schedule = () => {
    if (!noteId) return
    dirty.current = true
    setState('dirty')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (dirty.current) void save({ silent: true })
    }, debounceMs)
  }

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  return {
    title,
    setTitle: (value: string) => {
      setTitle(value)
      schedule()
    },
    body,
    setBody: (value: string) => {
      setBody(value)
      schedule()
    },
    folder,
    setFolder: (value: string) => {
      setFolder(value)
      schedule()
    },
    tags,
    setTags: (value: string[]) => {
      setTags(value)
      schedule()
    },
    pinned,
    setPinned: (value: boolean) => {
      setPinned(value)
      schedule()
    },
    state,
    savedAt,
    error,
    dirty: dirty.current,
    save,
  }
}
