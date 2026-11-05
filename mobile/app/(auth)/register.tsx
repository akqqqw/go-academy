import { Link } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { validateRegistration } from '@shared/validation'

import { useAuth } from '@/auth/auth-context'
import { Body, Button, Caption, Card, ErrorText, Heading } from '@/ui/components'
import { FormField, FormInput } from '@/ui/form'
import { useTheme } from '@/ui/theme-context'

export default function RegisterScreen() {
  const theme = useTheme()
  const { signUp, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    const validation = validateRegistration(email, password, confirm)
    if (validation) {
      setError(validation)
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await signUp(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.requiresConfirmation) {
      setNotice('Аккаунт создан. Проверьте почту и перейдите по ссылке из письма, затем войдите.')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: theme.spacing(5),
            gap: theme.spacing(5),
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: theme.spacing(2) }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.primaryFg, fontWeight: '800', fontSize: 20 }}>Go</Text>
            </View>
            <Heading>Создать аккаунт</Heading>
            <Caption>Прогресс, заметки и карточки будут доступны на всех устройствах.</Caption>
          </View>

          <Card>
            {!configured ? (
              <ErrorText>
                Supabase не настроен: задайте EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY
                (или SUPABASE_URL и PUBLIC_KEY на бэкенде).
              </ErrorText>
            ) : null}

            <FormField label="Email">
              <FormInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                accessibilityLabel="Email"
              />
            </FormField>

            <FormField label="Пароль" hint="Минимум 6 символов">
              <FormInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="••••••••"
                accessibilityLabel="Пароль"
              />
            </FormField>

            <FormField label="Повторите пароль">
              <FormInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="••••••••"
                accessibilityLabel="Повторите пароль"
                onSubmitEditing={() => void onSubmit()}
              />
            </FormField>

            {error ? <ErrorText>{error}</ErrorText> : null}
            {notice ? <Body style={{ color: theme.colors.success }}>{notice}</Body> : null}

            <Button
              title="Зарегистрироваться"
              onPress={() => void onSubmit()}
              loading={submitting}
              disabled={!configured || Boolean(notice)}
            />
          </Card>

          <View style={{ flexDirection: 'row', gap: theme.spacing(2), justifyContent: 'center' }}>
            <Caption>Уже есть аккаунт?</Caption>
            <Link href="/(auth)/login" accessibilityRole="link">
              <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
                Войти
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
