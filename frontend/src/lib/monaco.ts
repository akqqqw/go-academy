// Настройка Monaco Editor для полностью офлайн-работы.
//
// @monaco-editor/react по умолчанию загружает редактор с CDN — это нарушило бы
// требование «после установки зависимостей интернет не нужен». Поэтому мы
// передаём ему локальный экземпляр monaco-editor и собственный воркер, который
// Vite собирает в отдельный файл.
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

// Подключаем только те возможности редактора, которые нужны для Go: без этого
// Monaco тянет подсветку всех языков и 7-МБ воркер TypeScript.
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/editor/contrib/comment/browser/comment'
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import 'monaco-editor/editor/contrib/format/browser/formatActions'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/editor/contrib/indentation/browser/indentation'
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations'
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor'
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2'
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations'
import 'monaco-editor/languages/definitions/go/register'

/** Язык редактора: Go-подсветка есть в базовых языках Monaco. */
export const EDITOR_LANGUAGE = 'go'

let configured = false

/** configureMonaco один раз подключает локальный monaco и воркер. */
export function configureMonaco() {
  if (configured) return monaco
  configured = true

  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    },
  }
  loader.config({ monaco })
  defineThemes(monaco)
  return monaco
}

const DARK_THEME = 'go-academy-dark'
const LIGHT_THEME = 'go-academy-light'

/** Имена тем, совпадающие с палитрой приложения. */
export const MONACO_THEMES = { dark: DARK_THEME, light: LIGHT_THEME } as const

function defineThemes(api: typeof monaco) {
  api.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7385', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b8a' },
      { token: 'string', foreground: 'a5d6a7' },
      { token: 'number', foreground: '7cc7ff' },
      { token: 'type', foreground: 'ffc078' },
      { token: 'identifier', foreground: 'dbe1ea' },
      { token: 'delimiter', foreground: '9aa4b8' },
      { token: 'operator', foreground: 'ff7b8a' },
    ],
    colors: {
      'editor.background': '#0b0d12',
      'editor.foreground': '#dbe1ea',
      'editorLineNumber.foreground': '#4a5162',
      'editorLineNumber.activeForeground': '#a9b4c6',
      'editor.lineHighlightBackground': '#12151d',
      'editor.selectionBackground': '#2b3a57',
      'editorCursor.foreground': '#5b8def',
      'editorIndentGuide.background1': '#1a1e27',
      'editorIndentGuide.activeBackground1': '#2a3140',
      'editorWidget.background': '#12151d',
      'editorWidget.border': '#262b36',
      'editorBracketMatch.background': '#1d2740',
      'editorBracketMatch.border': '#3f6bd6',
      'scrollbarSlider.background': '#252b3755',
      'scrollbarSlider.hoverBackground': '#2f374555',
      'scrollbarSlider.activeBackground': '#3b455555',
    },
  })

  api.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cf222e' },
      { token: 'string', foreground: '0a3069' },
      { token: 'number', foreground: '0550ae' },
      { token: 'type', foreground: '953800' },
      { token: 'identifier', foreground: '24292f' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#24292f',
      'editorLineNumber.foreground': '#a5adba',
      'editorLineNumber.activeForeground': '#57606a',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editor.selectionBackground': '#dbe7ff',
      'editorCursor.foreground': '#2457d6',
      'editorIndentGuide.background1': '#eef0f4',
      'editorIndentGuide.activeBackground1': '#d6dae2',
      'editorWidget.background': '#f7f8fb',
      'editorWidget.border': '#e2e5ec',
      'editorBracketMatch.background': '#e8efff',
      'editorBracketMatch.border': '#2457d6',
    },
  })
}

/** currentMonacoTheme выбирает тему по разрешённому оформлению документа. */
export function currentMonacoTheme(): string {
  const dark = document.documentElement.classList.contains('dark')
  return dark ? DARK_THEME : LIGHT_THEME
}
