import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'
import { Platform } from 'react-native'

import { useTheme } from '@/ui/theme-context'

/**
 * Нижняя навигация: пять вкладок из ТЗ — Главная, Учёба, Код, Карточки, Профиль.
 * Остальные разделы (заметки, тесты, достижения, настройки) открываются из
 * профиля и главной, чтобы не перегружать панель.
 */
export default function TabsLayout() {
  const theme = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.fgSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: Platform.select({ ios: 84, android: 64, default: 64 }),
          paddingTop: 6,
          paddingBottom: Platform.select({ ios: 28, android: 8, default: 8 }),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Учёба',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="code"
        options={{
          title: 'Код',
          tabBarIcon: ({ color, size }) => <Ionicons name="terminal-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: 'Карточки',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  )
}
