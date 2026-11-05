// Дизайн-токены мобильного приложения.
//
// Значения повторяют палитру web (frontend/src/styles/index.css): тёмный фон,
// тёмные поверхности, бирюзовый акцент. Отдельный набор нужен потому, что
// React Native не понимает CSS-переменные и Tailwind-классы.
export type ColorScheme = 'dark' | 'light'

export interface ThemeColors {
  canvas: string
  surface: string
  surfaceRaised: string
  surfaceMuted: string
  border: string
  borderStrong: string
  fg: string
  fgMuted: string
  fgSubtle: string
  primary: string
  primaryFg: string
  primarySoft: string
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  violet: string
  violetSoft: string
  overlay: string
}

export interface Theme {
  scheme: ColorScheme
  colors: ThemeColors
  spacing: (step: number) => number
  radius: { sm: number; md: number; lg: number; pill: number }
  fontSize: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number }
}

export const darkColors: ThemeColors = {
  canvas: '#08090c',
  surface: '#0f1116',
  surfaceRaised: '#12151c',
  surfaceMuted: '#151922',
  border: '#1e222c',
  borderStrong: '#2c3240',
  fg: '#e9ecf4',
  fgMuted: '#939bad',
  fgSubtle: '#6b7385',
  primary: '#26c9e8',
  primaryFg: '#04161c',
  primarySoft: 'rgba(38, 201, 232, 0.12)',
  success: '#43d19b',
  successSoft: 'rgba(67, 209, 155, 0.14)',
  warning: '#f0b429',
  warningSoft: 'rgba(240, 180, 41, 0.14)',
  danger: '#f2555a',
  dangerSoft: 'rgba(242, 85, 90, 0.14)',
  violet: '#a78bfa',
  violetSoft: 'rgba(167, 139, 250, 0.16)',
  overlay: 'rgba(0, 0, 0, 0.6)',
}

export const lightColors: ThemeColors = {
  canvas: '#f5f6f9',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceMuted: '#f0f2f7',
  border: '#e2e5ec',
  borderStrong: '#cdd2dd',
  fg: '#12151c',
  fgMuted: '#5a6373',
  fgSubtle: '#838c9c',
  primary: '#0a7ea4',
  primaryFg: '#ffffff',
  primarySoft: 'rgba(10, 126, 164, 0.1)',
  success: '#15803d',
  successSoft: 'rgba(21, 128, 61, 0.12)',
  warning: '#b45309',
  warningSoft: 'rgba(180, 83, 9, 0.12)',
  danger: '#d1383d',
  dangerSoft: 'rgba(209, 56, 61, 0.1)',
  violet: '#6d4aff',
  violetSoft: 'rgba(109, 74, 255, 0.12)',
  overlay: 'rgba(16, 20, 30, 0.35)',
}

const spacing = (step: number) => step * 4

export function createTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radius: { sm: 8, md: 12, lg: 16, pill: 999 },
    fontSize: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 },
  }
}

/** Минимальный размер тач-цели по гайдлайнам Apple/Google. */
export const MIN_TOUCH_SIZE = 44
