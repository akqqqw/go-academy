import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, Switch, Text, View } from 'react-native'

import type { Settings as SettingsType } from '@shared/types'
import { GOAL_RANGES } from '@shared/validation'

import { useAuth } from '@/auth/auth-context'
import { useReminders } from '@/features/notifications/notifications-context'
import { useSettingsStore } from '@/store/settings'
import { Button, Caption, Card, Heading, Label, Row, Screen, ScreenHeader } from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

export default function SettingsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { user } = useAuth()
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const saving = useSettingsStore((state) => state.saving)
  const [error, setError] = useState<string | null>(null)

  const reminders = useReminders()

  async function change(changes: Partial<SettingsType>) {
    setError(null)
    try {
      await update(changes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройку')
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
      </Row>

      <ScreenHeader
        title="Настройки"
        subtitle={user?.email ? `синхронизируются с ${user.email}` : 'сохраняются на всех устройствах'}
      />

      <Card>
        <Heading level={3}>Дневные цели</Heading>
        <Caption>Цели считает сервер по вашему часовому поясу — серия и план только растут.</Caption>

        <Stepper
          label="Минуты учёбы"
          value={settings.daily_goal_minutes}
          min={GOAL_RANGES.minutes.min}
          max={GOAL_RANGES.minutes.max}
          step={5}
          suffix="мин"
          onChange={(value) => void change({ daily_goal_minutes: value })}
        />
        <Stepper
          label="Разобранные задачи"
          value={settings.daily_goal_exercises}
          min={GOAL_RANGES.exercises.min}
          max={GOAL_RANGES.exercises.max}
          suffix="задач"
          onChange={(value) => void change({ daily_goal_exercises: value })}
        />
        <Stepper
          label="Повторение карточек"
          value={settings.daily_goal_cards}
          min={GOAL_RANGES.cards.min}
          max={GOAL_RANGES.cards.max}
          suffix="карточек"
          onChange={(value) => void change({ daily_goal_cards: value })}
        />
      </Card>

      <Card>
        <Heading level={3}>Редактор</Heading>
        <Stepper
          label="Размер шрифта"
          value={settings.editor_font_size}
          min={EDITOR_LIMITS.font.min}
          max={EDITOR_LIMITS.font.max}
          suffix="pt"
          onChange={(value) => void change({ editor_font_size: value })}
        />
        <Stepper
          label="Ширина табуляции"
          value={settings.editor_tab_size}
          min={EDITOR_LIMITS.tab.min}
          max={EDITOR_LIMITS.tab.max}
          suffix="симв."
          onChange={(value) => void change({ editor_tab_size: value })}
        />
        <Toggle
          label="Автосохранение кода"
          hint="Черновик уходит в аккаунт через 1.5 секунды после правки"
          value={settings.code_autosave}
          onChange={(value) => void change({ code_autosave: value })}
        />
      </Card>

      <Card>
        <Heading level={3}>Внешний вид</Heading>
        <Toggle
          label="Меньше анимаций"
          hint="Отключает лишние переходы, если они мешают"
          value={settings.reduced_motion}
          onChange={(value) => void change({ reduced_motion: value })}
        />
        <Caption>Тема переключается в профиле и следует системной настройке, если выбрано «Как в системе».</Caption>
      </Card>

      <Card>
        <Heading level={3}>Напоминания</Heading>
        <Caption>
          Мягкое напоминание раз в день: сколько осталось до цели и что повторить. Без него серию легко
          потерять — приходят только после вашего согласия, отключаются в один тап.
        </Caption>
        <Toggle
          label="Напоминать о занятиях"
          hint={
            reminders.permission === 'granted'
              ? 'Уведомление приходит в 19:30, если цель ещё не закрыта'
              : reminders.permission === 'denied'
                ? 'Разрешение отклонено — включите уведомления в настройках системы'
                : 'Система спросит разрешение на уведомления'
          }
          value={reminders.enabled}
          onChange={(value) => {
            if (value) void reminders.enable()
            else void reminders.disable()
          }}
        />
      </Card>

      {error ? <Caption style={{ color: theme.colors.danger }}>{error}</Caption> : null}
      {saving ? <Caption>Сохраняем на сервере…</Caption> : null}

      <Card>
        <Label>О приложении</Label>
        <Caption>Go Academy · мобильное приложение 0.1.0</Caption>
        <Caption>Программа курса загружается с сервера, прогресс хранится в Supabase.</Caption>
        <Button
          title="Сбросить локальный кэш"
          variant="secondary"
          onPress={() =>
            Alert.alert(
              'Сбросить кэш?',
              'Локальные копии данных удалятся. Прогресс в аккаунте не пострадает, но неотправленные изменения потеряются.',
              [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Сбросить',
                  style: 'destructive',
                  onPress: () => {
                    void import('@/db/database').then(({ resetLocalData }) =>
                      resetLocalData().then(() =>
                        Alert.alert('Готово', 'Кэш очищен. Данные загрузятся заново.'),
                      ),
                    )
                  },
                },
              ],
            )
          }
        />
      </Card>
    </Screen>
  )
}

/** Ограничения размеров редактора повторяют серверный реестр настроек. */
const EDITOR_LIMITS = {
  font: { min: 11, max: 22 },
  tab: { min: 2, max: 8 },
} as const

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix: string
  onChange: (value: number) => void
}) {
  const theme = useTheme()
  return (
    <Row justify="space-between">
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSize.sm }}>{label}</Text>
        <Caption>
          {value} {suffix} · от {min} до {max}
        </Caption>
      </View>
      <Row gap={2}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Уменьшить ${label}`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: value <= min ? 0.4 : 1,
          }}
        >
          <Ionicons name="remove" size={18} color={theme.colors.fg} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Увеличить ${label}`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: value >= max ? 0.4 : 1,
          }}
        >
          <Ionicons name="add" size={18} color={theme.colors.fg} />
        </Pressable>
      </Row>
    </Row>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  const theme = useTheme()
  return (
    <Row justify="space-between" align="flex-start" style={{ minHeight: 48 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSize.sm }}>{label}</Text>
        {hint ? <Caption>{hint}</Caption> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
        thumbColor={theme.colors.surface}
      />
    </Row>
  )
}
