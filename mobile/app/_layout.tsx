import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AuthProvider, useAuth } from '@/auth/auth-context'
import { RemindersProvider } from '@/features/notifications/notifications-context'
import { loadSupabaseConfigFromServer, getSupabaseConfig } from '@/lib/config'
import { SyncProvider } from '@/sync/sync-context'
import { useSettingsStore } from '@/store/settings'
import { ThemeProvider, useTheme } from '@/ui/theme-context'

/**
 * Параметры Supabase загружаются до создания клиента: если их нет в сборке,
 * они приходят с бэкенда (GET /api/config) — та же схема, что в web.
 */
async function bootstrapConfig(): Promise<void> {
  if (!getSupabaseConfig().url) {
    await loadSupabaseConfigFromServer()
  }
}

/** Настройки (тема, цели) подтягиваются после появления сессии. */
function SettingsBootstrap({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    if (session) void load()
  }, [session, load])

  if (loading) return null
  return <>{children}</>
}

function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  const theme = useTheme()

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [session, loading, segments, router])

  if (loading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  return <>{children}</>
}

function Screens() {
  const theme = useTheme()
  return (
    <AuthGate>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="lesson/[lessonId]" />
        <Stack.Screen name="exercise/[exerciseId]" />
        <Stack.Screen name="notes" />
        <Stack.Screen name="quizzes" />
        <Stack.Screen name="achievements" />
        <Stack.Screen name="settings" />
      </Stack>
    </AuthGate>
  )
}

function ThemedShell() {
  const theme = useTheme()
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Screens />
    </>
  )
}

function ThemedApp() {
  const preference = useSettingsStore((state) => state.themePreference)
  return (
    <ThemeProvider preference={preference}>
      <RemindersProvider>
        <ThemedShell />
      </RemindersProvider>
    </ThemeProvider>
  )
}

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void bootstrapConfig()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08090c' }}>
        <ActivityIndicator color="#26C9E5" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SyncProvider>
            <SettingsBootstrap>
              <ThemedApp />
            </SettingsBootstrap>
          </SyncProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
