// Тест навигации мобильного приложения.
//
// Expo Router строит маршруты по файлам, поэтому опечатка в имени экрана или
// ссылка на несуществующий маршрут ломает переход — но не типы (строки
// `router.push('/notes')` проверяются только при сборке). Этот тест сверяет
// файловую структуру app/ с тем, что перечислено в layout'ах и куда ведут
// ссылки из экранов.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = resolve(root, 'app')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const files = walk(appDir)

interface Route {
  /** Имя сегмента без групп и расширения: index, learn, lesson/[lessonId]. */
  pattern: string[]
  file: string
}

/** Файловое дерево → маршруты. Группы `(auth)`/`(tabs)` в URL не участвуют. */
const routes: Route[] = files
  .map((file) => {
    const segments = relative(appDir, file).replace(/\.tsx?$/, '').split(/[\\/]/)
    const name = segments[segments.length - 1]!
    if (name === '_layout' || name.startsWith('+')) return null
    const parts = segments.filter((segment) => !segment.startsWith('('))
    if (parts[parts.length - 1] === 'index') parts.pop()
    return { pattern: parts, file }
  })
  .filter((route): route is Route => route !== null)

function matches(pattern: string[], path: string[]): boolean {
  if (pattern.length !== path.length) return false
  return pattern.every((segment, index) => segment.startsWith('[') || segment === path[index])
}

function pathOf(href: string): string[] {
  // Группы в URL не участвуют: `/(tabs)/learn` и `/learn` — один и тот же экран.
  return href
    .split('?')[0]!
    .split('/')
    .filter((segment) => segment && !segment.startsWith('('))
}

function resolves(href: string): boolean {
  const path = pathOf(href)
  return routes.some((route) => matches(route.pattern, path))
}

const rootLayout = readFileSync(resolve(appDir, '_layout.tsx'), 'utf8')
const tabsLayout = readFileSync(resolve(appDir, '(tabs)', '_layout.tsx'), 'utf8')

describe('файловые маршруты', () => {
  it('находит все экраны приложения', () => {
    const names = routes.map((route) => route.pattern.join('/') || '(index)')
    expect(names).toEqual(
      expect.arrayContaining([
        '(index)',
        'learn',
        'code',
        'cards',
        'profile',
        'login',
        'register',
        'reset',
        'lesson/[lessonId]',
        'exercise/[exerciseId]',
        'notes',
        'quizzes',
        'achievements',
        'settings',
      ]),
    )
  })

  it('не содержит файлов-заглушек вне маршрутов', () => {
    // Каждый .tsx в app/ кроме layout'ов и служебных +-файлов — это экран.
    const screens = files.filter((file) => file.endsWith('.tsx'))
    expect(screens.length).toBe(routes.length + countLayouts())
  })
})

function countLayouts(): number {
  return files.filter((file) => file.endsWith('_layout.tsx')).length
}

describe('Stack в app/_layout.tsx', () => {
  const names = [...rootLayout.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((match) => match[1]!)

  it('объявляет все корневые маршруты', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        '(auth)',
        '(tabs)',
        'lesson/[lessonId]',
        'exercise/[exerciseId]',
        'notes',
        'quizzes',
        'achievements',
        'settings',
      ]),
    )
  })

  it.each(names)('экран "%s" существует на диске', (name) => {
    const candidates = [`${name}.tsx`, join(name, '_layout.tsx'), join(name, 'index.tsx')]
    const exists = candidates.some((candidate) => files.includes(resolve(appDir, candidate)))
    expect(exists, `нет файла для Stack.Screen "${name}"`).toBe(true)
  })
})

describe('нижняя навигация', () => {
  const tabs = [...tabsLayout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((match) => match[1]!)

  it('содержит ровно пять вкладок из ТЗ', () => {
    expect(tabs).toEqual(['index', 'learn', 'code', 'cards', 'profile'])
  })

  it.each(tabs)('вкладка "%s" существует на диске', (name) => {
    expect(files).toContain(resolve(appDir, '(tabs)', `${name}.tsx`))
  })

  it('каждая вкладка подписана по-русски', () => {
    for (const title of ['Главная', 'Учёба', 'Код', 'Карточки', 'Профиль']) {
      expect(tabsLayout).toContain(`title: '${title}'`)
    }
  })
})

describe('ссылки в экранах', () => {
  const links = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return [...source.matchAll(/router\.(?:push|replace)\(\s*'([^']+)'/g)].map((match) => ({
      href: match[1]!,
      file: relative(root, file),
    }))
  })

  it('находит ссылки в экранах', () => {
    // Если ссылки перестанут находиться, остальные проверки станут пустыми.
    expect(links.length).toBeGreaterThan(5)
  })

  it.each(links)('$file → $href ведёт на существующий маршрут', ({ href }) => {
    // Шаблонные пути вроде `/lesson/${id}` собираются из сегментов: проверяем
    // их через подстановку значения динамического сегмента.
    const concrete = href.replace(/\$\{[^}]+\}/g, 'sample-id')
    expect(resolves(concrete), `ссылка "${href}" никуда не ведёт`).toBe(true)
  })

  it('не оставляет ссылок на несуществующие разделы', () => {
    // Первый сегмент пути должен совпадать с известным маршрутом либо быть
    // динамическим (`lesson/…`, `exercise/…`), который проверен выше.
    const known = new Set(routes.map((route) => route.pattern[0]).filter(Boolean))
    for (const { href, file } of links) {
      const segments = pathOf(href)
      if (segments.length === 0) continue // ссылка на корень группы, например /(tabs)
      expect(known.has(segments[0]!), `${file}: неизвестный раздел в "${href}"`).toBe(true)
    }
  })
})
