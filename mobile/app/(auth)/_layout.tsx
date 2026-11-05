import { Stack } from 'expo-router'

import { useTheme } from '@/ui/theme-context'

export default function AuthLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.canvas },
        animation: 'fade',
      }}
    />
  )
}
