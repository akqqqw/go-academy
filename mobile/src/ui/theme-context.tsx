import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'

import { createTheme, type ColorScheme, type Theme } from '@/ui/theme'

const ThemeContext = createContext<Theme>(createTheme('dark'))

/**
 * Тема приложения. Если в настройках выбрано «как в системе», следим за
 * системной схемой; иначе используем явный выбор пользователя, сохранённый
 * в аккаунте и локальном кэше.
 */
export function ThemeProvider({
  preference,
  children,
}: {
  preference: ColorScheme | 'system'
  children: ReactNode
}) {
  const system = useColorScheme()
  const scheme: ColorScheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference
  const theme = useMemo(() => createTheme(scheme), [scheme])
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
