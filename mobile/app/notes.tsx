import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Modal, Pressable, Text, View } from 'react-native'

import type { Note, NotesResponse } from '@shared/types'
import { formatRelativeDate, plural } from '@shared/utils'
import { validateNote } from '@shared/validation'

import { api } from '@/api/endpoints'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { enqueue } from '@/sync/queue'
import { useSync } from '@/sync/sync-context'
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  Row,
  Screen,
  ScreenHeader,
} from '@/ui/components'
import { FormInput, FormTextarea } from '@/ui/form'
import { useTheme } from '@/ui/theme-context'

export default function NotesScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { online, sync } = useSync()
  const notes = useCachedQuery<NotesResponse>('notes', () => api.notes(), { ttl: 0 })

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = (notes.data?.notes ?? []).filter((note) => {
    if (!query.trim()) return true
    const needle = query.trim().toLowerCase()
    return note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle)
  })

  function openEditor(note: Note | 'new') {
    setEditing(note)
    setTitle(note === 'new' ? '' : note.title)
    setBody(note === 'new' ? '' : note.body)
    setError(null)
  }

  async function save() {
    const validation = validateNote(title, body)
    if (validation) {
      setError(validation)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing === 'new') {
        await api.createNote({ title: title.trim(), body })
      } else if (editing) {
        await api.updateNote(editing.id, { title: title.trim(), body })
      }
      setEditing(null)
      await Promise.all([notes.refresh(), sync()])
    } catch (err) {
      // Офлайн: правка существующей заметки уходит в очередь и не теряется.
      if (editing && editing !== 'new') {
        await enqueue('note_save', {
          id: editing.id,
          input: { title: title.trim(), body, updated_at: new Date().toISOString() },
        })
        setEditing(null)
        Alert.alert('Сохранено на устройстве', 'Заметка отправится на сервер, когда появится сеть.')
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось сохранить заметку')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(note: Note) {
    try {
      await api.deleteNote(note.id)
      await notes.refresh()
    } catch (err) {
      Alert.alert('Не удалось удалить', err instanceof Error ? err.message : 'Попробуйте позже')
    }
  }

  return (
    <Screen>
      <Row justify="space-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.fg} />
        </Pressable>
        <Badge tone={online ? 'success' : 'warning'}>{online ? 'онлайн' : 'офлайн'}</Badge>
      </Row>

      <ScreenHeader
        title="Заметки"
        subtitle={
          notes.data
            ? `${notes.data.stats.total} ${plural(notes.data.stats.total, 'заметка', 'заметки', 'заметок')} · ${notes.data.stats.words} слов`
            : 'Личные записи по урокам'
        }
      />

      <FormInput
        value={query}
        onChangeText={setQuery}
        placeholder="Поиск по заметкам"
        accessibilityLabel="Поиск по заметкам"
        autoCorrect={false}
      />

      <Button title="Новая заметка" onPress={() => openEditor('new')} />

      {notes.loading && !notes.data ? <LoadingState label="Загружаем заметки…" /> : null}
      {notes.error && !notes.data ? (
        <ErrorState message={notes.error} onRetry={() => void notes.refresh()} />
      ) : null}

      {list.map((note) => (
        <Pressable
          key={note.id}
          accessibilityRole="button"
          accessibilityLabel={`Открыть заметку ${note.title}`}
          onPress={() => openEditor(note)}
          onLongPress={() =>
            Alert.alert(note.title || 'Заметка', 'Удалить заметку?', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => void remove(note) },
            ])
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Card>
            <Heading level={3}>{note.title || 'Без названия'}</Heading>
            <Body muted style={{ fontSize: theme.fontSize.sm }}>
              {note.excerpt || note.body}
            </Body>
            <Row justify="space-between">
              <Caption>{note.folder}</Caption>
              <Caption>{formatRelativeDate(note.updated_at)}</Caption>
            </Row>
          </Card>
        </Pressable>
      ))}

      {notes.data && list.length === 0 ? (
        <Card>
          <Body>{query ? 'Ничего не нашлось.' : 'Заметок пока нет — создайте первую.'}</Body>
          <Caption>Долгое нажатие на заметку удаляет её.</Caption>
        </Card>
      ) : null}

      <Modal visible={editing !== null} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.colors.canvas,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              padding: theme.spacing(4),
              gap: theme.spacing(3),
              maxHeight: '90%',
            }}
          >
            <Row justify="space-between">
              <Heading level={3}>{editing === 'new' ? 'Новая заметка' : 'Заметка'}</Heading>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={() => setEditing(null)}
                style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={22} color={theme.colors.fgMuted} />
              </Pressable>
            </Row>

            <FormInput value={title} onChangeText={setTitle} placeholder="Заголовок" accessibilityLabel="Заголовок" />
            <FormTextarea
              value={body}
              onChangeText={setBody}
              placeholder="Текст заметки (Markdown)"
              accessibilityLabel="Текст заметки"
              style={{ minHeight: 200 }}
            />
            {error ? <Caption style={{ color: theme.colors.danger }}>{error}</Caption> : null}
            <Button title="Сохранить" onPress={() => void save()} loading={saving} />
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
