import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { Caption, ErrorText } from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

/** Поле формы с подписью и сообщением об ошибке. */
export function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string | null
  hint?: string
  children: React.ReactNode
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: theme.spacing(1.5) }}>
      <Text style={{ color: theme.colors.fgMuted, fontSize: theme.fontSize.sm, fontWeight: '500' }}>
        {label}
      </Text>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error && hint ? <Caption>{hint}</Caption> : null}
    </View>
  )
}

/** Текстовое поле в стиле приложения: тач-цель не меньше 48 pt. */
export function FormInput(props: TextInputProps & { invalid?: boolean }) {
  const theme = useTheme()
  const { invalid, style, ...rest } = props
  return (
    <TextInput
      placeholderTextColor={theme.colors.fgSubtle}
      {...rest}
      style={[
        {
          minHeight: 48,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: invalid ? theme.colors.danger : theme.colors.borderStrong,
          backgroundColor: theme.colors.surfaceMuted,
          color: theme.colors.fg,
          paddingHorizontal: theme.spacing(3),
          fontSize: theme.fontSize.md,
        },
        style,
      ]}
    />
  )
}

/** Многострочное поле (заметки, код). */
export function FormTextarea(props: TextInputProps) {
  const theme = useTheme()
  const { style, ...rest } = props
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor={theme.colors.fgSubtle}
      {...rest}
      style={[
        {
          minHeight: 120,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surfaceMuted,
          color: theme.colors.fg,
          padding: theme.spacing(3),
          fontSize: theme.fontSize.md,
          lineHeight: theme.fontSize.md * 1.5,
        },
        style,
      ]}
    />
  )
}
