import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { LessonContentResponse } from '@shared/types'

import { api } from '@/api/endpoints'
import { getLocalLessonProgress, saveLessonScroll, setLocalLessonStatus } from '@/db/cache'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { useSync } from '@/sync/sync-context'
import { enqueue } from '@/sync/queue'
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
} from '@/ui/components'
import { Markdown } from '@/ui/markdown'
import { useTheme } from '@/ui/theme-context'

export default function LessonScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>()
  const id = String(lessonId ?? '')
  const { online, sync } = useSync()

  const content = useCachedQuery<LessonContentResponse>(`lesson-content:${id}`, () => api.lessonContent(id), {
    ttl: 0,
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'not_started' | 'in_progress' | 'completed'>('not_started')
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const lastScroll = useRef(0)
  const openedSent = useRef(false)

  const data = content.data
  // Навигация приходит вместе с уроком: сервер уже учитывает доступность.
  const nav = useMemo(() => ({ prev: data?.prev ?? null, next: data?.next ?? null }), [data])

  // Отмечаем открытие урока один раз и восстанавливаем позицию чтения.
  useEffect(() => {
    if (!data) return
    let cancelled = false

    void (async () => {
      const local = await getLocalLessonProgress(id)
      if (!cancelled && local) {
        setStatus(local.status)
        lastScroll.current = local.scroll
      }
      if (local?.status === 'completed') setStatus('completed')

      if (!openedSent.current) {
        openedSent.current = true
        try {
          await api.lessonOpened(id)
        } catch {
          // Офлайн: открытие уйдёт из очереди при появлении сети.
          await enqueue('lesson_opened', { lesson_id: id })
        }
        await setLocalLessonStatus(id, local?.status === 'completed' ? 'completed' : 'in_progress')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [data, id])

  const markCompleted = useCallback(async () => {
    setSaving(true)
    setStatus('completed')
    await setLocalLessonStatus(id, 'completed')
    try {
      await api.lessonCompleted(id)
    } catch {
      await enqueue('lesson_completed', { lesson_id: id })
    }
    await Promise.all([content.refresh(), sync()])
    setSaving(false)
  }, [id, content, sync])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={['top', 'left', 'right']}>
      <Row justify="space-between" style={{ paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(2) }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.fg} />
        </Pressable>
        <Badge tone={online ? 'neutral' : 'warning'}>{online ? `${data?.lesson.number ?? ''} из ${data?.lesson.total ?? ''}` : 'офлайн'}</Badge>
      </Row>

      {content.loading && !data ? <LoadingState label="Загружаем урок…" /> : null}
      {content.error && !data ? (
        <View style={{ padding: theme.spacing(4) }}>
          <ErrorState message={content.error} onRetry={() => void content.refresh()} />
        </View>
      ) : null}

      {data ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(4), paddingBottom: theme.spacing(12) }}
          scrollEventThrottle={200}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
            const max = Math.max(1, contentSize.height - layoutMeasurement.height)
            const ratio = Math.min(1, Math.max(0, contentOffset.y / max))
            lastScroll.current = ratio
          }}
          onMomentumScrollEnd={() => void saveLessonScroll(id, lastScroll.current)}
        >
          <View style={{ gap: theme.spacing(2) }}>
            <Label>
              Модуль {data.lesson.module_number} · {data.lesson.module_title}
            </Label>
            <Heading>{data.lesson.title}</Heading>
            <Caption>{data.lesson.summary}</Caption>
            <Row gap={2}>
              <Badge tone={status === 'completed' ? 'success' : status === 'in_progress' ? 'primary' : 'neutral'}>
                {status === 'completed' ? 'пройден' : status === 'in_progress' ? 'в процессе' : 'не начат'}
              </Badge>
              <Badge tone="neutral">{data.lesson.minutes} мин</Badge>
            </Row>
            <ProgressBar value={data.lesson.module_total > 0 ? (data.lesson.module_completed / data.lesson.module_total) * 100 : 0} />
            <Caption>
              Модуль: {data.lesson.module_completed} из {data.lesson.module_total} уроков
            </Caption>
          </View>

          {data.lesson.objectives.length > 0 ? (
            <Card>
              <Heading level={3}>Цели урока</Heading>
              {data.lesson.objectives.map((objective) => (
                <Row key={objective} gap={2} align="flex-start">
                  <Ionicons name="ellipse" size={6} color={theme.colors.primary} style={{ marginTop: 7 }} />
                  <Body style={{ flex: 1, fontSize: theme.fontSize.sm }}>{objective}</Body>
                </Row>
              ))}
            </Card>
          ) : null}

          {/* Теория и примеры: один столбец, без узких колонок и вложенных скроллов. */}
          <Markdown markdown={data.markdown} />

          {data.starter_code ? (
            <Card>
              <Row justify="space-between">
                <Heading level={3}>Практика</Heading>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/(tabs)/code?lesson=${id}`)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Body style={{ color: theme.colors.primary, fontSize: theme.fontSize.sm }}>Открыть редактор</Body>
                </Pressable>
              </Row>
              <Caption>
                Задание открывается в отдельном экране «Код»: редактор на телефоне не помещается рядом с теорией.
              </Caption>
            </Card>
          ) : null}

          <Card>
            <Heading level={3}>Итог урока</Heading>
            <Body style={{ fontSize: theme.fontSize.sm }}>
              Отметьте урок пройденным, когда разобрались с теорией и примерами — это влияет на план дня,
              серию и прогресс модуля.
            </Body>
            <Button
              title={status === 'completed' ? 'Урок пройден' : 'Отметить пройденным'}
              onPress={() => void markCompleted()}
              loading={saving}
              disabled={status === 'completed'}
            />
            {!online ? (
              <Caption>Нет сети: отметка сохранится локально и отправится автоматически.</Caption>
            ) : null}
          </Card>

          <Row gap={3}>
            <View style={{ flex: 1 }}>
              <Button
                title="Назад"
                variant="secondary"
                onPress={() => (nav.prev ? router.replace(`/lesson/${nav.prev.id}`) : router.back())}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Далее"
                onPress={() => (nav.next ? router.replace(`/lesson/${nav.next.id}`) : router.back())}
                disabled={!nav.next}
              />
            </View>
          </Row>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/notes')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.sm, textAlign: 'center' }}>
              Заметки к уроку
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  )
}
