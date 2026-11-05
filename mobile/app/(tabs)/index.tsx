import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { DashboardResponse } from '@shared/types'
import { planProgress, studySummary } from '@shared/learning'
import { formatDuration, formatTodayGreeting, greeting, plural } from '@shared/utils'

import { api } from '@/api/endpoints'
import { useCachedQuery } from '@/hooks/use-cached-query'
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
  ProgressRing,
  Row,
  Screen,
  ScreenHeader,
} from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

export default function HomeScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { message, online, sync } = useSync()
  const dashboard = useCachedQuery<DashboardResponse>('dashboard', api.dashboard, { ttl: 0 })
  const refresh = useCallback(async () => {
    await Promise.all([dashboard.refresh(), sync()])
  }, [dashboard, sync])

  const data = dashboard.data
  const plan = data ? planProgress(data.snapshot.plan) : null
  const study = data ? studySummary(data.snapshot) : null

  return (
    <Screen>
      <ScreenHeader
        title={`${greeting()}, продолжаем Go`}
        subtitle={formatTodayGreeting()}
        right={
          <Badge tone={online ? 'success' : 'warning'}>{online ? 'онлайн' : 'офлайн'}</Badge>
        }
      />

      {dashboard.loading && !data ? <LoadingState label="Загружаем сводку…" /> : null}

      {dashboard.error && !data ? (
        <ErrorState message={dashboard.error} onRetry={() => void refresh()} />
      ) : null}

      {data ? (
        <>
          {/* Серия и время: две главные цифры, компактно для одной руки. */}
          <Row gap={3} justify="space-between">
            <Card style={{ flex: 1 }} accent="warning">
              <Row gap={2}>
                <Ionicons name="flame" size={18} color={theme.colors.warning} />
                <Label>Серия</Label>
              </Row>
              <Heading level={2}>{data.snapshot.streak.current} дн.</Heading>
              <Caption>рекорд {data.snapshot.streak.longest} дн.</Caption>
            </Card>
            <Card style={{ flex: 1 }} accent="primary">
              <Row gap={2}>
                <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
                <Label>Сегодня</Label>
              </Row>
              <Heading level={2}>{study?.todayMinutes ?? 0} мин</Heading>
              <Caption>всего {formatDuration(data.snapshot.study.total_seconds)}</Caption>
            </Card>
          </Row>

          {/* Продолжение обучения — самый заметный элемент экрана. */}
          {data.continue_lesson ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Продолжить урок ${data.continue_lesson.lesson_title}`}
              onPress={() => router.push(`/lesson/${data.continue_lesson?.lesson_id}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Card accent="primary">
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, gap: theme.spacing(1) }}>
                    <Label>Продолжить обучение</Label>
                    <Heading level={3}>{data.continue_lesson.lesson_title}</Heading>
                    <Caption>
                      Модуль {data.continue_lesson.module_number} ·{' '}
                      {data.continue_lesson.module_title} · урок{' '}
                      {data.continue_lesson.lesson_number}
                    </Caption>
                  </View>
                  <Badge tone="primary">{data.continue_lesson.minutes} мин</Badge>
                </Row>

                <View style={{ gap: theme.spacing(1.5) }}>
                  <ProgressBar value={data.continue_lesson.module_stat.percent} />
                  <Caption>
                    Модуль пройден на {data.continue_lesson.module_stat.percent}% ·{' '}
                    {data.continue_lesson.module_stat.completed} из{' '}
                    {data.continue_lesson.module_stat.total} уроков
                  </Caption>
                </View>

                <Button title="Продолжить" onPress={() => router.push(`/lesson/${data.continue_lesson?.lesson_id}`)} />
              </Card>
            </Pressable>
          ) : (
            <Card>
              <Body>Программа курса пуста — проверьте содержимое каталога content.</Body>
            </Card>
          )}

          {/* Дневные цели и план: кольцо — прогресс пунктов, минуты отдельно. */}
          <Card>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: theme.spacing(1) }}>
                <Heading level={3}>План на сегодня</Heading>
                <Caption>
                  Выполнено {plan?.done ?? 0} из {plan?.total ?? 0}
                </Caption>
              </View>
              <View style={{ alignItems: 'center', gap: theme.spacing(1) }}>
                <ProgressRing value={plan?.percent ?? 0} size={56} strokeWidth={5}>
                  <Text
                    style={{ color: theme.colors.fg, fontSize: theme.fontSize.sm, fontWeight: '700' }}
                  >
                    {plan?.percent ?? 0}%
                  </Text>
                </ProgressRing>
                <Caption>
                  {study?.todayMinutes ?? 0}/{study?.goalMinutes ?? 0} мин
                </Caption>
              </View>
            </Row>

            <View style={{ gap: theme.spacing(2) }}>
              {data.snapshot.plan.map((item) => (
                <Row key={item.id} gap={2} align="flex-start">
                  <Ionicons
                    name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={item.done ? theme.colors.success : theme.colors.fgSubtle}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: item.done ? theme.colors.fgMuted : theme.colors.fg,
                        fontSize: theme.fontSize.sm,
                        textDecorationLine: item.done ? 'line-through' : 'none',
                      }}
                    >
                      {item.label}
                    </Text>
                    <Caption>
                      {item.id === 'lesson'
                        ? item.done
                          ? 'Урок открыт сегодня'
                          : 'Ещё не открывали урок'
                        : `${item.current} из ${item.target}`}
                    </Caption>
                  </View>
                </Row>
              ))}
            </View>

            {study && study.remainingMinutes > 0 ? (
              <Caption>
                До дневной цели осталось {study.remainingMinutes}{' '}
                {plural(study.remainingMinutes, 'минута', 'минуты', 'минут')}
              </Caption>
            ) : (
              <Caption>Цель по времени выполнена — отличная работа.</Caption>
            )}
          </Card>

          {/* Короткая статистика: без длинной веб-страницы. */}
          <Row gap={3}>
            <Card style={{ flex: 1 }}>
              <Label>Уроки</Label>
              <Heading level={2}>
                {data.snapshot.lessons.completed}
                <Text style={{ color: theme.colors.fgSubtle, fontSize: theme.fontSize.md }}>
                  /{data.snapshot.lessons.total}
                </Text>
              </Heading>
              <ProgressBar value={data.snapshot.lessons.percent} />
            </Card>
            <Card style={{ flex: 1 }}>
              <Label>Задачи</Label>
              <Heading level={2}>
                {data.snapshot.exercises.solved}
                <Text style={{ color: theme.colors.fgSubtle, fontSize: theme.fontSize.md }}>
                  /{data.snapshot.exercises.total}
                </Text>
              </Heading>
              <ProgressBar value={data.snapshot.exercises.percent} tone="success" />
            </Card>
          </Row>

          {data.achievements && data.achievements.length > 0 ? (
            <Card>
              <Row justify="space-between">
                <Heading level={3}>Последние достижения</Heading>
                <Pressable accessibilityRole="link" onPress={() => router.push('/achievements')}>
                  <Body style={{ color: theme.colors.primary, fontSize: theme.fontSize.sm }}>Все</Body>
                </Pressable>
              </Row>
              <View style={{ gap: theme.spacing(2) }}>
                {data.achievements.slice(0, 3).map((achievement) => (
                  <Row key={achievement.code} gap={3} align="flex-start">
                    <Ionicons name="trophy-outline" size={18} color={theme.colors.violet} />
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontSize: theme.fontSize.sm }}>{achievement.title}</Body>
                      <Caption>{achievement.description}</Caption>
                    </View>
                  </Row>
                ))}
              </View>
            </Card>
          ) : null}

          <Card>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Body style={{ fontSize: theme.fontSize.sm }}>{message}</Body>
                <Caption>{dashboard.fromCache ? 'данные из локального кэша' : 'данные с сервера'}</Caption>
              </View>
              <Button title="Обновить" variant="secondary" onPress={() => void refresh()} />
            </Row>
          </Card>
        </>
      ) : null}

    </Screen>
  )
}
