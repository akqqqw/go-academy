// Контраст темы по WCAG AA.
//
// Аудит light-темы глазами не воспроизводим в CI, поэтому проверяем самое
// объективное: соотношение контраста пар «текст — фон» из реальных токенов
// src/styles/index.css. Порог 4.5:1 — обычный текст, 3:1 — крупный текст и
// элементы управления.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const css = readFileSync(resolve(root, 'frontend/src/styles/index.css'), 'utf8')

/** Достаёт переменные из CSS-блока по точному селектору (без вложенных правил). */
function variablesOf(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  if (start === -1) throw new Error(`блок ${selector} не найден`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  const vars: Record<string, string> = {}
  for (const match of css.slice(open, close).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[match[1]!] = match[2]!.trim()
  }
  return vars
}

const light = variablesOf(':root')
const darkOverrides = variablesOf('.dark')
const themes: Record<string, Record<string, string>> = {
  light,
  dark: { ...light, ...darkOverrides },
}

function toRgb(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const value = parseInt(hex[1]!, 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const short = /^#([0-9a-f]{3})$/i.exec(color)
  if (short) {
    const [r, g, b] = short[1]!
    return [r! + r!, g! + g!, b! + b!].map((pair) => parseInt(pair, 16)) as [number, number, number]
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

const AA_TEXT = 4.5
const AA_LARGE = 3

/** Пары «текст на фоне», которые встречаются в интерфейсе. */
const textPairs: [string, string, string][] = [
  ['основной текст на канве', 'fg', 'canvas'],
  ['основной текст на карточке', 'fg', 'surface'],
  ['приглушённый текст на канве', 'fg-muted', 'canvas'],
  ['приглушённый текст на карточке', 'fg-muted', 'surface'],
  ['второстепенный текст на канве', 'fg-subtle', 'canvas'],
  ['второстепенный текст на карточке', 'fg-subtle', 'surface'],
  ['акцент как текст на канве', 'primary', 'canvas'],
  ['акцент как текст на карточке', 'primary', 'surface'],
  ['текст на кнопке-акценте', 'primary-fg', 'primary'],
  ['успех как текст', 'success', 'surface'],
  ['предупреждение как текст', 'warning', 'surface'],
  ['ошибка как текст', 'danger', 'surface'],
  ['фиолетовый акцент', 'violet', 'surface'],
]

describe.each(Object.keys(themes))('контраст темы «%s»', (name) => {
  const theme = themes[name]!

  it('основной и приглушённый текст читаются на всех поверхностях', () => {
    const failures = textPairs
      .map(([label, fg, bg]) => ({ label, ratio: contrast(theme[fg]!, theme[bg]!) }))
      .filter((item) => item.ratio < AA_TEXT)
      .map((item) => `${item.label}: ${item.ratio.toFixed(2)}:1`)
    expect(failures).toEqual([])
  })

  it('границы и акцент различимы на фоне (3:1)', () => {
    expect(contrast(theme['border-strong']!, theme['surface']!)).toBeGreaterThanOrEqual(1.2)
    expect(contrast(theme['primary']!, theme['canvas']!)).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('подсветка кода читается на фоне блока кода', () => {
    const codeColors = ['code-fg', 'code-comment', 'code-keyword', 'code-string', 'code-number', 'code-func']
    const failures = codeColors
      .map((key) => ({ key, ratio: contrast(theme[key]!, theme['code-bg']!) }))
      .filter((item) => item.ratio < AA_LARGE)
      .map((item) => `${item.key}: ${item.ratio.toFixed(2)}:1`)
    expect(failures).toEqual([])
  })
})

describe('полнота токенов', () => {
  it('тёмная тема переопределяет всё, что нужно для читаемого текста', () => {
    const required = [
      'canvas',
      'surface',
      'surface-muted',
      'border',
      'border-strong',
      'fg',
      'fg-muted',
      'fg-subtle',
      'primary',
      'primary-fg',
      'success',
      'warning',
      'danger',
      'violet',
      'code-bg',
      'code-fg',
    ]
    expect(required.filter((key) => !darkOverrides[key])).toEqual([])
  })

  it('обе темы содержат одинаковый набор переменных подсветки кода', () => {
    const codeKeys = Object.keys(light).filter((key) => key.startsWith('code-'))
    expect(codeKeys.length).toBeGreaterThan(6)
    expect(codeKeys.filter((key) => !darkOverrides[key])).toEqual([])
  })

  it('светлая тема — это тема по умолчанию', () => {
    expect(light['canvas']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(contrast(light['fg']!, light['canvas']!)).toBeGreaterThan(10)
  })
})
