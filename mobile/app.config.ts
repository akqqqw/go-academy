import type { ConfigContext, ExpoConfig } from 'expo/config'

// Конфигурация Expo. Секретов здесь нет: значения приходят из переменных
// окружения при сборке (`EXPO_PUBLIC_*` попадают в бандл — это публичные
// параметры Supabase, как и в web) либо из `/api/config` в рантайме.
//
// Для EAS: значения задаются в eas.json → build.<profile>.env или командой
// `eas env:create`, а не коммитятся в репозиторий.

const APP_NAME = 'Go Academy'
const SLUG = 'go-academy'
const SCHEME = 'goacademy'

/** Публичный адрес Go-API. В проде — тот же домен, что у web-версии. */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://go-academy-one.vercel.app'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: SLUG,
  version: '0.1.0',
  scheme: SCHEME,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    // Заглушка: владелец проекта меняет на свой идентификатор в App Store Connect.
    bundleIdentifier: 'com.goacademy.app',
    supportsTablet: false,
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    // Заглушка: package name для Google Play Console.
    package: 'com.goacademy.app',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#08090c',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['android.permission.POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#08090c',
        image: './assets/splash.png',
        imageWidth: 180,
      },
    ],
    [
      'expo-notifications',
      {
        // Иконка уведомлений (белый силуэт — требование Android) и цвет акцента.
        icon: './assets/notification-icon.png',
        color: '#25C5E5',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl: API_BASE_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    eas: {
      // Заполняется после `eas init`; placeholder, чтобы конфиг был валиден.
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
})
