import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { CardGrade, Flashcard, FlashcardQueue, FlashcardsOverview } from '@shared/types'
import { plural } from '@shared/utils'

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
  Label,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  ScreenHeader,
} from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

const GRADES: { grade: CardGrade; label: string; tone: 'danger' | 'warning' | 'primary' | 'success' }[] = [
  { grade: 'again', label: 'Снова', tone: 'danger' },
  { grade: 'hard', label: 'Сложно', tone: 'warning' },
  { grade: 'good', label: 'Норм', tone: 'primary' },
  { grade: 'easy', label: 'Легко', tone: 'success' },
]

export default function CardsScreen() {
  const theme = useTheme()
  const { sync } = useSync()
  const overview = useCachedQuery<FlashcardsOverview>('flashcards', api.flashcards, { ttl: 0 })
  const [queue, setQueue] = useState<Flashcard[]>([])
  const [remaining, setRemaining] = useState(0)
  const [current, setCurrent] = useState<Flashcard | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(0)
  const [deck, setDeck] = useState<string>('')

  const loadQueue = useCallback(
    async (deckId = deck) => {
      setLoading(true)
      setError(null)
      try {
        const data: FlashcardQueue = await api.queue(deckId, 20)
        setQueue(data.cards)
        setRemaining(data.remaining)
        setCurrent(data.cards[0] ?? null)
        setRevealed(false)
        setReviewed(0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить очередь')
      } finally {
        setLoading(false)
      }
    },
    [deck],
  )

  useEffect(() => {
    void loadQueue('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- очередь грузим один раз
  }, [])

  const progress = useMemo(() => {
    const total = reviewed + queue.length
    return total > 0 ? Math.round((reviewed / total) * 100) : 0
  }, [reviewed, queue.length])

  const rate = useCallback(
    async (grade: CardGrade) => {
      if (!current) return
      void Haptics.selectionAsync()
      const card = current

      // Оптимистично: карточка уходит из очереди сразу, расписание считает
      // сервер (единый источник правды для всех устройств).
      const rest = queue.slice(1)
      setQueue(rest)
      setCurrent(rest[0] ?? null)
      setRevealed(false)
      setReviewed((value) => value + 1)

      try {
        await api.review(card.id, grade)
      } catch {
        // Офлайн: оценка уходит в очередь и применяется сервером при
        // синхронизации. Расписание считает только сервер — иначе два
        // устройства посчитают интервалы по-разному.
        await enqueue('card_review', { card_id: card.id, grade })
      }
      void sync()
    },
    [current, queue, sync],
  )

  const decks = overview.data?.decks ?? []
  const stats = overview.data?.stats

  return (
    <Screen>
      <ScreenHeader
        title="Карточки"
        subtitle={stats ? `${stats.due} к повторению · ${stats.learned} выучено` : 'Интервальное повторение'}
      />

      {loading ? <LoadingState label="Готовим очередь…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void loadQueue()} /> : null}

      {current ? (
        <>
          <Row justify="space-between">
            <Caption>
              Осталось {remaining + queue.length - 1} · повторено {reviewed}
            </Caption>
            <Badge tone="primary">{current.deck_id}</Badge>
          </Row>
          <ProgressBar value={progress} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ответ показан' : 'Показать ответ'}
            onPress={() => setRevealed(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
          >
            <Card accent="primary" style={{ minHeight: 180, justifyContent: 'center' }}>
              <Label>{revealed ? 'Ответ' : 'Вопрос'}</Label>
              <Heading level={2}>{revealed ? current.back : current.front}</Heading>
              {!revealed ? (
                <Caption>Нажмите на карточку, чтобы увидеть ответ{current.hint ? ' · есть подсказка' : ''}</Caption>
              ) : current.hint ? (
                <Caption>Подсказка: {current.hint}</Caption>
              ) : null}
            </Card>
          </Pressable>

          {revealed ? (
            <View style={{ gap: theme.spacing(2) }}>
              <Caption>Насколько легко вспомнилось?</Caption>
              <Row gap={3}>
                {GRADES.map((item) => (
                  <View key={item.grade} style={{ flex: 1 }}>
                    <Button
                      title={item.label}
                      variant={item.grade === 'good' ? 'primary' : 'secondary'}
                      onPress={() => void rate(item.grade)}
                    />
                  </View>
                ))}
              </Row>
            </View>
          ) : (
            <Button title="Показать ответ" onPress={() => setRevealed(true)} />
          )}
        </>
      ) : (
        !loading && (
          <Card accent="success">
            <Row gap={2}>
              <Ionicons name="checkmark-done" size={20} color={theme.colors.success} />
              <Heading level={3}>Очередь пуста</Heading>
            </Row>
            <Body style={{ fontSize: theme.fontSize.sm }}>
              {reviewed > 0
                ? `Повторено ${reviewed} ${plural(reviewed, 'карточка', 'карточки', 'карточек')}. Загляните позже — расписание подскажет, когда.`
                : 'На сегодня всё повторено. Выберите колоду ниже или загляните позже.'}
            </Body>
            <Button title="Обновить очередь" variant="secondary" onPress={() => void loadQueue()} />
          </Card>
        )
      )}

      {decks.length > 0 ? (
        <Card>
          <Heading level={3}>Колоды</Heading>
          <Caption>Фильтр по модулю помогает повторять то, что проходите сейчас.</Caption>
          <View style={{ gap: theme.spacing(2) }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDeck('')
                void loadQueue('')
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Row justify="space-between">
                <Text style={{ color: theme.colors.fg, fontSize: theme.fontSize.sm }}>Все колоды</Text>
                {deck === '' ? <Badge tone="primary">выбрано</Badge> : null}
              </Row>
            </Pressable>
            {decks.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => {
                  setDeck(item.id)
                  void loadQueue(item.id)
                }}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.fg, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
                      {item.title}
                    </Text>
                    <Caption>
                      {item.total} {plural(item.total, 'карточка', 'карточки', 'карточек')} · к повторению{' '}
                      {item.due}
                    </Caption>
                  </View>
                  {deck === item.id ? <Badge tone="primary">выбрано</Badge> : null}
                </Row>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  )
}
