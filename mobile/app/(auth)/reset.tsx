import { Link } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { validateEmail } from '@shared/validation'

import { useAuth } from '@/auth/auth-context'
import { Body, Button, Caption, Card, ErrorText, Heading } from '@/ui/components'
import { FormField, FormInput } from '@/ui/form'
import { useTheme } from '@/ui/theme-context'

export default function ResetPasswordScreen() {
  const theme = useTheme()
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    const validation = validateEmail(email)
    if (validation) {
      setError(validation)
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await resetPassword(email)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else setSent(true)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.spacing(5), gap: theme.spacing(4) }}
          keyboardShouldPersistTaps="handled"
        >
          <Heading>Восстановление пароля</Heading>
          <Caption>Пришлём ссылку для смены пароля на указанный email.</Caption>

          <Card>
            <FormField label="Email">
              <FormInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
                accessibilityLabel="Email"
                onSubmitEditing={() => void onSubmit()}
              />
            </FormField>

            {error ? <ErrorText>{error}</ErrorText> : null}
            {sent ? (
              <Body style={{ color: theme.colors.success }}>
                Письмо отправлено. Откройте ссылку из письма и задайте новый пароль.
              </Body>
            ) : null}

            <Button title="Отправить ссылку" onPress={() => void onSubmit()} loading={submitting} disabled={sent} />
          </Card>

          <Link href="/(auth)/login" accessibilityRole="link">
            <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '600', textAlign: 'center' }}>
              Вернуться ко входу
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
