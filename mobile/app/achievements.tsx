import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { Achievement, AchievementCategory, AchievementsResponse } from '@shared/types'
import { formatRelativeDate, plural } from '@shared/utils'

import { api } from '@/api/endpoints'
import { useCachedQuery } from '@/hooks/use-cached-query'
import {
  Badge,
  Body,
  Caption,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  ScreenHeader,
} from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

const CATEGORIES: { value: AchievementCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'lessons', label: 'Уроки' },
  { value: 'practice', label: 'Практика' },
  { value: 'memory', label: 'Память' },
  { value: 'study', label: 'Учёба' },
]

export default function AchievementsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [filter, setFilter] = useState<AchievementCategory | 'all'>('all')
  const achievements = useCachedQuery<AchievementsResponse>('achievements', api.achievements, { ttl: 0 })

  const list = useMemo(() => {
    const all = achievements.data?.achievements ?? []
    const filtered = filter === 'all' ? all : all.filter((item) => item.category === filter)
    // Сначала открытые, затем ближайшие к открытию.
    return [...filtered].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
      return b.percent - a.percent
    })
  }, [achievements.data, filter])

  const stats = achievements.data?.stats

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
      </Row>

      <ScreenHeader
        title="Достижения"
        subtitle={
          stats
            ? `Открыто ${stats.unlocked} из ${stats.total} · ${stats.percent}%`
            : 'Цели, которые считает сервер'
        }
      />

      {stats ? <ProgressBar value={stats.percent} tone="violet" /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
        {CATEGORIES.map((category) => {
          const active = filter === category.value
          return (
            <Pressable
              key={category.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(category.value)}
              style={{
                minHeight: 40,
                paddingHorizontal: theme.spacing(3),
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: active ? theme.colors.violet : theme.colors.border,
                backgroundColor: active ? theme.colors.surfaceMuted : 'transparent',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: active ? theme.colors.violet : theme.colors.fgMuted,
                  fontSize: theme.fontSize.sm,
                  fontWeight: active ? '700' : '500',
                }}
              >
                {category.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {achievements.loading && !achievements.data ? <LoadingState label="Загружаем достижения…" /> : null}
      {achievements.error && !achievements.data ? (
        <ErrorState message={achievements.error} onRetry={() => void achievements.refresh()} />
      ) : null}

      {list.map((achievement) => (
        <AchievementCard key={achievement.code} achievement={achievement} />
      ))}

      {achievements.data && list.length === 0 ? (
        <Card>
          <Body>В этой категории пока нет достижений.</Body>
        </Card>
      ) : null}
    </Screen>
  )
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const theme = useTheme()
  const tierColor =
    achievement.tier === 'gold'
      ? theme.colors.warning
      : achievement.tier === 'silver'
        ? theme.colors.fgMuted
        : '#b87333'

  return (
    <Card accent={achievement.unlocked ? 'success' : undefined}>
      <Row gap={3} align="flex-start">
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surfaceMuted,
            borderWidth: 1,
            borderColor: achievement.unlocked ? tierColor : theme.colors.border,
            opacity: achievement.unlocked ? 1 : 0.6,
          }}
        >
          <Ionicons
            name={achievement.unlocked ? 'trophy' : 'lock-closed'}
            size={18}
            color={achievement.unlocked ? tierColor : theme.colors.fgSubtle}
          />
        </View>

        <View style={{ flex: 1, gap: theme.spacing(1) }}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1 }}>
              <Heading level={3}>{achievement.title}</Heading>
              <Caption>{achievement.description}</Caption>
            </View>
            {achievement.unlocked ? <Badge tone="success">открыто</Badge> : null}
          </Row>

          <ProgressBar value={achievement.percent} tone={achievement.unlocked ? 'success' : 'primary'} />
          <Row justify="space-between">
            <Caption>
              {achievement.current} из {achievement.target} {achievement.unit}
            </Caption>
            <Caption>
              {achievement.unlocked && achievement.unlocked_at
                ? formatRelativeDate(achievement.unlocked_at)
                : `осталось ${achievement.remaining} ${plural(achievement.remaining, achievement.unit, achievement.unit, achievement.unit)}`}
            </Caption>
          </Row>
        </View>
      </Row>
    </Card>
  )
}
