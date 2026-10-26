import { create } from 'zustand'

import { ApiError, api } from '@/lib/api'
import type { Settings, ThemePreference } from '@/types'

/** Значения совпадают с настройками по умолчанию на бэкенде. */
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
  error: string | null
  setSettings: (settings: Settings) => void
  /** Оптимистично обновляет настройку и сохраняет её на сервере. */
  update: (changes: Partial<Settings>) => Promise<void>
}

function applyTheme(theme: ThemePreference) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try {
    localStorage.setItem('goacademy-theme', theme)
  } catch {
    // Приватный режим может запрещать localStorage — тема всё равно применится.
  }
}

function applyMotion(reduced: boolean) {
  document.documentElement.classList.toggle('reduced-motion', reduced)
  try {
    localStorage.setItem('goacademy-reduced-motion', String(reduced))
  } catch {
    // ignore
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  saving: false,
  error: null,

  setSettings: (settings) => {
    applyTheme(settings.theme)
    applyMotion(settings.reduced_motion)
    set({ settings, loaded: true, error: null })
  },

  update: async (changes) => {
    const previous = get().settings
    const optimistic = { ...previous, ...changes }
    // Мгновенная реакция интерфейса.
    if (changes.theme) applyTheme(changes.theme)
    if (typeof changes.reduced_motion === 'boolean') applyMotion(changes.reduced_motion)
    set({ settings: optimistic, saving: true, error: null })

    try {
      const response = await api.updateSettings(changes)
      applyTheme(response.settings.theme)
      applyMotion(response.settings.reduced_motion)
      set({ settings: response.settings, saving: false })
    } catch (error) {
      // Откат к серверному состоянию.
      applyTheme(previous.theme)
      applyMotion(previous.reduced_motion)
      const message =
        error instanceof ApiError ? error.message : 'Не удалось сохранить настройку'
      set({ settings: previous, saving: false, error: message })
      throw error
    }
  },
}))

/** Подписка на системную тему нужна, когда выбран режим «системная». */
export function watchSystemTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = () => {
    const { settings } = useSettingsStore.getState()
    if (settings.theme === 'system') applyTheme('system')
  }
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
