import { create } from 'zustand'

import { api } from '@/api/endpoints'
import { cacheGet, cacheSettings } from '@/db/cache'
import { resetLocalData } from '@/db/database'
import { ApiError } from '@/api/client'
import type { Settings, ThemePreference } from '@shared/types'

/** Значения по умолчанию совпадают с сервером (backend/internal/storage/settings.go). */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  sidebar_collapsed: false,
  reduced_motion: false,
  daily_goal_minutes: 15,
  daily_goal_exercises: 3,
  daily_goal_cards: 10,
  editor_font_size: 14,
  editor_tab_size: 4,
  code_autosave: true,
  onboarding_completed: false,
}

interface SettingsState {
  settings: Settings
  loaded: boolean
  saving: boolean
  offline: boolean
  error: string | null
  /** Тема для ThemeProvider: 'dark' | 'light' | 'system'. */
  themePreference: ThemePreference
  load: () => Promise<void>
  update: (changes: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  saving: false,
  offline: false,
  error: null,
  themePreference: DEFAULT_SETTINGS.theme,

  load: async () => {
    // Сначала показываем кэш: приложение должно открываться без сети.
    const cached = await cacheGet<Settings>('settings', 0)
    if (cached) {
      set({
        settings: { ...DEFAULT_SETTINGS, ...cached },
        themePreference: cached.theme ?? DEFAULT_SETTINGS.theme,
        loaded: true,
      })
    }

    try {
      const response = await api.settings()
      const settings = { ...DEFAULT_SETTINGS, ...response.settings }
      await cacheSettings(settings)
      set({
        settings,
        themePreference: settings.theme,
        loaded: true,
        offline: false,
        error: null,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'не удалось загрузить настройки'
      set({ loaded: true, offline: true, error: cached ? null : message })
    }
  },

  update: async (changes) => {
    const previous = get().settings
    const optimistic = { ...previous, ...changes }
    set({
      settings: optimistic,
      themePreference: optimistic.theme,
      saving: true,
      error: null,
    })

    try {
      const response = await api.updateSettings(changes)
      const settings = { ...DEFAULT_SETTINGS, ...response.settings }
      await cacheSettings(settings)
      set({ settings, themePreference: settings.theme, saving: false, offline: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'не удалось сохранить настройки'
      set({ settings: previous, themePreference: previous.theme, saving: false, error: message })
      throw error
    }
  },
}))

/** Выход из аккаунта: чистим персональный кэш, настройки остаются локально. */
export async function clearLocalCacheOnSignOut(): Promise<void> {
  await resetLocalData()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, themePreference: DEFAULT_SETTINGS.theme, loaded: false })
}
