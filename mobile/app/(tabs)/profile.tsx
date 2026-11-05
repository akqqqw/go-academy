import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { Alert, Pressable, Text, View } from 'react-native'

import type { ProgressResponse, Settings as SettingsType, ThemePreference } from '@shared/types'
import { formatFullDate, formatRelativeDate, plural } from '@shared/utils'

import { api } from '@/api/endpoints'
import { useAuth } from '@/auth/auth-context'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { useSettingsStore } from '@/store/settings'
import { useSync } from '@/sync/sync-context'
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  Heading,
  Label,
  ProgressBar,
  Row,
  Screen,
  ScreenHeader,
} from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
  { value: 'system', label: 'Как в системе' },
]

export default function ProfileScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { pending, message, online, lastSyncAt, sync } = useSync()
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.update)
  const progress = useCachedQuery<ProgressResponse>('progress', api.progress, { ttl: 0 })

  const snapshot = progress.data?.snapshot
  const email = user?.email ?? '—'
  const createdAt = user?.created_at ?? ''
  const initial = (email[0] ?? '?').toUpperCase()

  function changeTheme(value: ThemePreference) {
    void updateSettings({ theme: value as SettingsType['theme'] }).catch(() => {
      Alert.alert('Не удалось сохранить', 'Проверьте соединение: настройка сохранена только на устройстве.')
    })
  }

  return (
    <Screen>
      <ScreenHeader title="Профиль" subtitle="Аккаунт, прогресс и настройки" />

      <Card>
        <Row gap={3}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: theme.colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 20, fontWeight: '700' }}>{initial}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Heading level={3}>{email}</Heading>
            <Caption>{createdAt ? `в аккаунте с ${formatFullDate(createdAt)}` : 'данные аккаунта'}</Caption>
          </View>
        </Row>

        {snapshot ? (
          <View style={{ gap: theme.spacing(2) }}>
            <Row justify="space-between">
              <Caption>Курс пройден</Caption>
              <Caption>{snapshot.course_percent}%</Caption>
            </Row>
            <ProgressBar value={snapshot.course_percent} />
            <Row justify="space-between">
              <Caption>Уроки</Caption>
              <Caption>
                {snapshot.lessons.completed} из {snapshot.lessons.total}
              </Caption>
            </Row>
            <Row justify="space-between">
              <Caption>Задачи</Caption>
              <Caption>
                {snapshot.exercises.solved} из {snapshot.exercises.total}
              </Caption>
            </Row>
            <Row justify="space-between">
              <Caption>Серия</Caption>
              <Caption>
                {snapshot.streak.current} {plural(snapshot.streak.current, 'день', 'дня', 'дней')} · рекорд{' '}
                {snapshot.streak.longest}
              </Caption>
            </Row>
          </View>
        ) : (
          <Caption>Статистика появится после первой загрузки.</Caption>
        )}
      </Card>

      <Card>
        <Label>Синхронизация</Label>
        <Row justify="space-between">
          <Body style={{ fontSize: theme.fontSize.sm }}>{message}</Body>
          <Badge tone={online ? 'success' : 'warning'}>{online ? 'онлайн' : 'офлайн'}</Badge>
        </Row>
        <Caption>
          {lastSyncAt ? `последняя синхронизация ${formatRelativeDate(new Date(lastSyncAt).toISOString())}` : 'ещё не синхронизировались'}
        </Caption>
        <Button
          title={pending > 0 ? `Отправить изменения (${pending})` : 'Синхронизировать'}
          variant="secondary"
          onPress={() => void sync()}
          disabled={!online}
        />
      </Card>

      <Card>
        <Label>Тема</Label>
        <Row gap={2}>
          {THEMES.map((option) => {
            const active = settings.theme === option.value
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => changeTheme(option.value)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing(1),
                }}
              >
                <Text
                  style={{
                    color: active ? theme.colors.primary : theme.colors.fgMuted,
                    fontSize: theme.fontSize.xs,
                    fontWeight: active ? '700' : '500',
                    textAlign: 'center',
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </Row>
      </Card>

      <Card>
        <Label>Разделы</Label>
        <MenuRow icon="document-text-outline" title="Заметки" onPress={() => router.push('/notes')} />
        <MenuRow icon="clipboard-outline" title="Тесты" onPress={() => router.push('/quizzes')} />
        <MenuRow icon="trophy-outline" title="Достижения" onPress={() => router.push('/achievements')} />
        <MenuRow icon="settings-outline" title="Настройки" onPress={() => router.push('/settings')} />
      </Card>

      <Card>
        <Button
          title="Выйти из аккаунта"
          variant="danger"
          onPress={() =>
            Alert.alert('Выйти?', 'Локальный кэш и очередь изменений будут очищены.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
            ])
          }
        />
        <Caption>Прогресс хранится в Supabase и останется в аккаунте.</Caption>
      </Card>

      <Caption style={{ textAlign: 'center' }}>Go Academy · версия 0.1.0 (mobile)</Caption>
      <View style={{ alignItems: 'center' }}>
        <Ionicons name="logo-github" size={16} color={theme.colors.fgSubtle} />
      </View>
    </Screen>
  )
}

function MenuRow({
  icon,
  title,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Row gap={3}>
        <Ionicons name={icon} size={18} color={theme.colors.fgMuted} />
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSize.md }}>{title}</Text>
      </Row>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.fgSubtle} />
    </Pressable>
  )
}
