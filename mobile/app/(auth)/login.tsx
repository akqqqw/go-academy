import { Link } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { validateLogin } from '@shared/validation'

import { useAuth } from '@/auth/auth-context'
import { Body, Button, Caption, Card, ErrorText, Heading } from '@/ui/components'
import { FormField, FormInput } from '@/ui/form'
import { useTheme } from '@/ui/theme-context'

export default function LoginScreen() {
  const theme = useTheme()
  const { signIn, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    const validation = validateLogin(email, password)
    if (validation) {
      setError(validation)
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) setError(result.error)
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
            <Heading>Вход в Go Academy</Heading>
            <Caption>Продолжите обучение с того места, где остановились.</Caption>
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

            <FormField label="Пароль">
              <FormInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                placeholder="••••••••"
                accessibilityLabel="Пароль"
                onSubmitEditing={() => void onSubmit()}
              />
            </FormField>

            {error ? <ErrorText>{error}</ErrorText> : null}

            <Button title="Войти" onPress={() => void onSubmit()} loading={submitting} disabled={!configured} />

            <Link href="/(auth)/reset" asChild>
              <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Body style={{ color: theme.colors.primary }}>Забыли пароль?</Body>
              </Pressable>
            </Link>
          </Card>

          <View style={{ flexDirection: 'row', gap: theme.spacing(2), justifyContent: 'center' }}>
            <Caption>Нет аккаунта?</Caption>
            <Link href="/(auth)/register" accessibilityRole="link">
              <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
                Зарегистрироваться
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
