// Контраст мобильной темы по WCAG AA.
//
// Палитра повторяет web, но живёт отдельным файлом (React Native не понимает
// CSS-переменные), поэтому проверяем её тем же способом: считаем соотношение
// контраста для пар «текст — фон» в обеих схемах.
import { describe, expect, it } from 'vitest'

import { createTheme, darkColors, lightColors, MIN_TOUCH_SIZE } from './theme'

const AA_TEXT = 4.5
const AA_LARGE = 3

function toRgb(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const value = parseInt(hex[1]!, 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const rgba = /rgba?\(([^)]+)\)/.exec(color)
  if (rgba) {
    const [r, g, b] = rgba[1]!.split(',').map((part) => Number(part.trim()))
    return [r!, g!, b!]
  }
  throw new Error(`не разобран цвет: ${color}`)
}

function luminance(color: string): number {
  const [r, g, b] = toRgb(color).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [number, number]
  return (a + 0.05) / (b + 0.05)
}

const schemes = [
  ['тёмная', darkColors],
  ['светлая', lightColors],
] as const

describe.each(schemes)('контраст мобильной темы «%s»', (_name, colors) => {
  it('текст читается на канве и на карточке', () => {
    const pairs: [string, string, string][] = [
      ['основной на канве', colors.fg, colors.canvas],
      ['основной на карточке', colors.fg, colors.surface],
      ['приглушённый на канве', colors.fgMuted, colors.canvas],
      ['приглушённый на карточке', colors.fgMuted, colors.surface],
      ['второстепенный на канве', colors.fgSubtle, colors.canvas],
      ['второстепенный на карточке', colors.fgSubtle, colors.surface],
      ['акцент как текст', colors.primary, colors.canvas],
      ['текст на кнопке', colors.primaryFg, colors.primary],
      ['успех', colors.success, colors.surface],
      ['предупреждение', colors.warning, colors.surface],
      ['ошибка', colors.danger, colors.surface],
    ]
    const failures = pairs
      .map(([label, fg, bg]) => ({ label, ratio: contrast(fg, bg) }))
      .filter((item) => item.ratio < AA_TEXT)
      .map((item) => `${item.label}: ${item.ratio.toFixed(2)}:1`)
    expect(failures).toEqual([])
  })

  it('акцент различим как элемент управления (3:1)', () => {
    expect(contrast(colors.primary, colors.canvas)).toBeGreaterThanOrEqual(AA_LARGE)
    expect(contrast(colors.borderStrong, colors.surface)).toBeGreaterThanOrEqual(1.2)
  })

  it('текст на мягкой подложке остаётся читаемым', () => {
    // Плашки бейджей: цветной текст на цветной полупрозрачной подложке.
    expect(contrast(colors.warning, colors.surfaceMuted)).toBeGreaterThanOrEqual(AA_LARGE)
    expect(contrast(colors.success, colors.surfaceMuted)).toBeGreaterThanOrEqual(AA_LARGE)
    expect(contrast(colors.danger, colors.surfaceMuted)).toBeGreaterThanOrEqual(AA_LARGE)
  })
})

describe('токены', () => {
  it('обе схемы описывают одинаковый набор цветов', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort())
  })

  it('шрифты и отступы масштабируются предсказуемо', () => {
    const theme = createTheme('dark')
    expect(theme.spacing(1)).toBe(4)
    expect(theme.spacing(4)).toBe(16)
    expect(theme.fontSize.sm).toBeLessThan(theme.fontSize.md)
    expect(theme.fontSize.md).toBeLessThan(theme.fontSize.xl)
  })

  it('минимальная тач-цель соответствует гайдлайнам', () => {
    expect(MIN_TOUCH_SIZE).toBeGreaterThanOrEqual(44)
  })
})
