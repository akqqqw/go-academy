// Мобильная веб-версия: safe-area и тач-зоны.
//
// В песочнице нет браузера, поэтому проверяем статически то, что легко
// сломать при следующей правке вёрстки: viewport с viewport-fit=cover,
// отступы под вырез и home-indicator, минимальный размер тач-целей и
// применение темы до первой отрисовки (без вспышки белого экрана).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const indexHtml = read('frontend/index.html')
const topbar = read('frontend/src/components/layout/topbar.tsx')
const sidebar = read('frontend/src/components/layout/sidebar.tsx')
const shell = read('frontend/src/components/layout/app-shell.tsx')

describe('viewport и вырез экрана', () => {
  it('разрешает рисовать под вырезом (viewport-fit=cover)', () => {
    expect(indexHtml).toContain('viewport-fit=cover')
  })

  it('шапка учитывает верхний safe-area', () => {
    expect(topbar).toContain('pt-[env(safe-area-inset-top)]')
    // Высота тоже растёт: иначе padding сжал бы содержимое фиксированной шапки.
    expect(topbar).toContain('h-[calc(3.5rem+env(safe-area-inset-top))]')
  })

  it('боковая панель не заезжает под индикатор жеста', () => {
    expect(sidebar).toContain('pb-[calc(0.5rem+env(safe-area-inset-bottom))]')
  })

  it('контент страницы не прилипает к нижнему краю', () => {
    expect(shell).toContain('pb-[calc(1.5rem+env(safe-area-inset-bottom))]')
  })
})

describe('тач-зоны', () => {
  it('пункт навигации не меньше 44 px на мобильном', () => {
    // h-11 = 44 px; на десктопе строка компактнее (lg:h-9).
    expect(sidebar).toContain('h-11')
    expect(sidebar).toContain('lg:h-9')
  })

  it('кнопка открытия меню не меньше 44 px на мобильном', () => {
    expect(topbar).toContain('size-11')
    expect(sidebar).toContain('size-11')
  })

  it('кнопка сворачивания панели есть только на десктопе', () => {
    // size-8 (32 px) допустим лишь там, где нет пальца: элемент скрыт до lg.
    const collapse = /className="hidden size-8 [^"]*lg:grid"/.exec(sidebar)
    expect(collapse, 'кнопка сворачивания должна быть hidden + lg:grid').not.toBeNull()
  })
})

describe('тема до первой отрисовки', () => {
  it('скрипт в head применяет сохранённую тему', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'))
    expect(head).toContain('goacademy-theme')
    expect(head).toContain("classList.toggle('dark'")
    expect(head).toContain('dataset.theme')
  })

  it('сообщает браузеру обе схемы', () => {
    expect(indexHtml).toContain('<meta name="color-scheme" content="dark light" />')
  })

  it('уважает системную настройку и уменьшение анимаций', () => {
    expect(indexHtml).toContain('prefers-color-scheme: dark')
    expect(indexHtml).toContain('goacademy-reduced-motion')
    expect(indexHtml).toContain('reduced-motion')
  })
})
