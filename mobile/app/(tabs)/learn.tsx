import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { CourseResponse, LessonMeta } from '@shared/types'
import { flattenLessons, lessonState, moduleProgress, searchLessons } from '@shared/content'
import { levelLabel, plural } from '@shared/utils'

import { api } from '@/api/endpoints'
import { allLocalLessonStatuses } from '@/db/cache'
import { useCachedQuery } from '@/hooks/use-cached-query'
import {
  Badge,
  Body,
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
import { FormInput } from '@/ui/form'
import { useTheme } from '@/ui/theme-context'

export default function LearnScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [offlineStatuses, setOfflineStatuses] = useState<Record<string, string>>({})

  const course = useCachedQuery<CourseResponse>('course', api.course, { ttl: 0 })

  // Если сервер недоступен, статусы уроков берём из локального кэша: экран
  // продолжает показывать реальный прогресс, а не пустые карточки.
  void useMemo(() => {
    void allLocalLessonStatuses().then(setOfflineStatuses)
  }, [])

  const modules = course.data?.course.modules ?? []
  const statuses = useMemo(() => {
    const merged: Record<string, string> = { ...offlineStatuses }
    for (const module of modules) {
      for (const lesson of module.lessons) {
        if (lesson.status) merged[lesson.id] = lesson.status
      }
    }
    return merged
  }, [modules, offlineStatuses])

  const lessons = useMemo(() => flattenLessons(modules), [modules])
  const filtered = useMemo(() => searchLessons(lessons, query), [lessons, query])
  const filteredIds = useMemo(() => new Set(filtered.map((lesson) => lesson.id)), [filtered])

  return (
    <Screen>
      <ScreenHeader
        title="Учёба"
        subtitle={`${modules.length} ${plural(modules.length, 'модуль', 'модуля', 'модулей')} · ${lessons.length} ${plural(lessons.length, 'урок', 'урока', 'уроков')}`}
      />

      <FormInput
        value={query}
        onChangeText={setQuery}
        placeholder="Поиск по урокам"
        accessibilityLabel="Поиск по урокам"
        autoCorrect={false}
      />

      {course.loading && !course.data ? <LoadingState label="Загружаем программу…" /> : null}
      {course.error && !course.data ? (
        <ErrorState message={course.error} onRetry={() => void course.refresh()} />
      ) : null}

      {modules.map((module) => {
        const progress = moduleProgress(module, statuses)
        const moduleLessons = module.lessons.filter((lesson) => filteredIds.has(lesson.id))
        if (query && moduleLessons.length === 0) return null
        const isOpen = query.length > 0 || expanded === module.id

        return (
          <Card key={module.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setExpanded(isOpen && !query ? null : module.id)}
              style={{ gap: theme.spacing(2) }}
            >
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, gap: 2 }}>
                  <Label>
                    Модуль {module.number} · {levelLabel(module.level)}
                  </Label>
                  <Heading level={3}>{module.title}</Heading>
                  <Caption>{module.summary}</Caption>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.colors.fgSubtle}
                />
              </Row>

              <ProgressBar value={progress.percent} />
              <Row justify="space-between">
                <Caption>
                  {progress.completed} из {progress.total}{' '}
                  {plural(progress.total, 'урока', 'уроков', 'уроков')} · {module.minutes} мин
                </Caption>
                <Badge tone={progress.percent === 100 ? 'success' : 'neutral'}>
                  {progress.percent === 100 ? 'пройден' : `${progress.percent}%`}
                </Badge>
              </Row>
            </Pressable>

            {isOpen ? (
              <View style={{ gap: theme.spacing(1) }}>
                {moduleLessons.map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    state={lessonState(lesson, statuses)}
                    onPress={() => router.push(`/lesson/${lesson.id}`)}
                  />
                ))}
              </View>
            ) : null}
          </Card>
        )
      })}

      {course.data && filtered.length === 0 ? (
        <Card>
          <Body>Ничего не нашлось.</Body>
          <Caption>Попробуйте другое слово — поиск идёт по названию и описанию урока.</Caption>
        </Card>
      ) : null}
    </Screen>
  )
}

function LessonRow({
  lesson,
  state,
  onPress,
}: {
  lesson: LessonMeta
  state: 'not_started' | 'in_progress' | 'completed'
  onPress: () => void
}) {
  const theme = useTheme()
  const icon =
    state === 'completed' ? 'checkmark-circle' : state === 'in_progress' ? 'play-circle' : 'ellipse-outline'
  const color =
    state === 'completed'
      ? theme.colors.success
      : state === 'in_progress'
        ? theme.colors.primary
        : theme.colors.fgSubtle

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lesson.title}. ${state === 'completed' ? 'Пройден' : state === 'in_progress' ? 'В процессе' : 'Не начат'}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing(3),
        paddingVertical: theme.spacing(2.5),
        minHeight: 56,
        opacity: pressed ? 0.7 : 1,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      })}
    >
      <Ionicons name={icon} size={20} color={color} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
          {lesson.number}. {lesson.title}
        </Text>
        <Caption>{lesson.summary}</Caption>
        <Caption>
          {lesson.minutes} мин
          {state === 'in_progress' ? ' · в процессе' : ''}
          {lesson.available ? '' : ' · скоро'}
        </Caption>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.fgSubtle} />
    </Pressable>
  )
}
