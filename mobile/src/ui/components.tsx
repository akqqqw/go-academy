// Нативные примитивы интерфейса. Это не перенос web-компонентов: здесь
// используются Pressable, SafeAreaView, ActivityIndicator и Svg, чтобы
// приложение ощущалось платформенным.
import { useMemo, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'

import { MIN_TOUCH_SIZE, type Theme } from '@/ui/theme'
import { useTheme } from '@/ui/theme-context'

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: ReactNode
  scroll?: boolean
  padded?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const content = (
    <View style={[{ padding: padded ? theme.spacing(4) : 0, gap: theme.spacing(4) }, style]}>
      {children}
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: theme.spacing(10) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  )
}

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'violet'
}) {
  const theme = useTheme()
  const accentColor = accent ? theme.colors[accent] : undefined
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: accentColor ? `${accentColor}55` : theme.colors.border,
          padding: theme.spacing(4),
          gap: theme.spacing(2),
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function Heading({
  children,
  level = 2,
  style,
}: {
  children: ReactNode
  level?: 1 | 2 | 3
  style?: StyleProp<TextStyle>
}) {
  const theme = useTheme()
  const size = level === 1 ? theme.fontSize.xxl : level === 2 ? theme.fontSize.xl : theme.fontSize.lg
  return (
    <Text
      accessibilityRole="header"
      style={[{ color: theme.colors.fg, fontSize: size, fontWeight: '700', letterSpacing: -0.3 }, style]}
    >
      {children}
    </Text>
  )
}

export function Body({
  children,
  muted,
  style,
}: {
  children: ReactNode
  muted?: boolean
  style?: StyleProp<TextStyle>
}) {
  const theme = useTheme()
  return (
    <Text
      style={[
        {
          color: muted ? theme.colors.fgMuted : theme.colors.fg,
          fontSize: theme.fontSize.md,
          lineHeight: theme.fontSize.md * 1.5,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme()
  return (
    <Text style={[{ color: theme.colors.fgSubtle, fontSize: theme.fontSize.sm }, style]}>{children}</Text>
  )
}

export function Label({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <Text
      style={{
        color: theme.colors.fgSubtle,
        fontSize: theme.fontSize.xs,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  )
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
  icon?: ReactNode
}) {
  const theme = useTheme()
  const palette = {
    primary: { bg: theme.colors.primary, fg: theme.colors.primaryFg, border: 'transparent' },
    secondary: { bg: theme.colors.surfaceMuted, fg: theme.colors.fg, border: theme.colors.border },
    ghost: { bg: 'transparent', fg: theme.colors.fgMuted, border: 'transparent' },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger, border: 'transparent' },
  }[variant]

  const inactive = disabled || loading

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_SIZE,
          paddingHorizontal: theme.spacing(4),
          borderRadius: theme.radius.md,
          backgroundColor: palette.bg,
          borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth,
          borderColor: palette.border === 'transparent' ? undefined : palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing(2),
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : icon}
      <Text style={{ color: palette.fg, fontSize: theme.fontSize.md, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'violet'
}) {
  const theme = useTheme()
  const tones = {
    neutral: { bg: theme.colors.surfaceMuted, fg: theme.colors.fgMuted },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primary },
    success: { bg: theme.colors.successSoft, fg: theme.colors.success },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    violet: { bg: theme.colors.violetSoft, fg: theme.colors.violet },
  }[tone]

  return (
    <View
      style={{
        backgroundColor: tones.bg,
        borderRadius: theme.radius.pill,
        paddingHorizontal: theme.spacing(2.5),
        paddingVertical: theme.spacing(1),
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: tones.fg, fontSize: theme.fontSize.xs, fontWeight: '600' }}>{children}</Text>
    </View>
  )
}

export function ProgressBar({ value, tone }: { value: number; tone?: 'primary' | 'success' | 'violet' }) {
  const theme = useTheme()
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={{
        height: 6,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors[tone ?? 'primary'],
        }}
      />
    </View>
  )
}

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  children,
}: {
  value: number
  size?: number
  strokeWidth?: number
  children?: ReactNode
}) {
  const theme = useTheme()
  const clamped = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.surfaceMuted}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
          fill="none"
        />
      </Svg>
      {children}
    </View>
  )
}

export function LoadingState({ label = 'Загружаем данные…' }: { label?: string }) {
  const theme = useTheme()
  return (
    <View style={{ paddingVertical: theme.spacing(10), alignItems: 'center', gap: theme.spacing(3) }}>
      <ActivityIndicator color={theme.colors.primary} />
      <Caption>{label}</Caption>
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const theme = useTheme()
  return (
    <Card accent="warning">
      <Body style={{ color: theme.colors.danger }}>{message}</Body>
      {onRetry ? <Button title="Повторить" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <Text style={{ color: theme.colors.danger, fontSize: theme.fontSize.sm, lineHeight: theme.fontSize.sm * 1.5 }}>
      {children}
    </Text>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const theme = useTheme()
  return (
    <Card>
      <Body>{title}</Body>
      {hint ? <Caption>{hint}</Caption> : null}
      <View style={{ height: theme.spacing(1) }} />
    </Card>
  )
}

export function Row({
  children,
  gap = 2,
  align = 'center',
  justify = 'flex-start',
  style,
}: {
  children: ReactNode
  gap?: number
  align?: ViewStyle['alignItems']
  justify?: ViewStyle['justifyContent']
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: align, justifyContent: justify, gap: theme.spacing(gap * 0.5) },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function Divider() {
  const theme = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />
}

/** Заголовок экрана с подзаголовком: единый ритм на всех вкладках. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Row justify="space-between" align="flex-start" gap={3}>
        <View style={{ flex: 1, gap: theme.spacing(1) }}>
          <Heading level={1}>{title}</Heading>
          {subtitle ? <Caption>{subtitle}</Caption> : null}
        </View>
        {right}
      </Row>
    </View>
  )
}

/** Хук для мемоизации списка стилей (небольшая оптимизация перерисовок). */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme()
  return useMemo(() => factory(theme), [theme, factory])
}
