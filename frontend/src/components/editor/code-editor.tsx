import Editor, { type OnMount } from '@monaco-editor/react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { EDITOR_LANGUAGE, configureMonaco, currentMonacoTheme } from '@/lib/monaco'
import { cn } from '@/lib/utils'

export interface CodeEditorHandle {
  /** Переводит курсор и прокручивает редактор к строке. */
  revealLine: (line: number, column?: number) => void
  /** Возвращает текущий код (на случай рассинхронизации состояния). */
  getValue: () => string
  /** Ставит фокус в редактор. */
  focus: () => void
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  /** Вызывается по Ctrl/Cmd+Enter. */
  onRun?: () => void
  /** Вызывается по Ctrl/Cmd+S. */
  onSave?: () => void
  /** Вызывается по Shift+Alt+F. */
  onFormat?: () => void
  fontSize?: number
  tabSize?: number
  readOnly?: boolean
  className?: string
  /** Тема переключается снаружи, чтобы не читать DOM на каждый рендер. */
  theme?: 'dark' | 'light'
  ariaLabel?: string
}

/**
 * CodeEditor — обёртка над Monaco с локальной загрузкой, Go-подсветкой и
 * горячими клавишами. Компонент не знает про API: всё общение через колбэки.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    value,
    onChange,
    onRun,
    onSave,
    onFormat,
    fontSize = 14,
    tabSize = 4,
    readOnly = false,
    className,
    theme,
    ariaLabel = 'Редактор Go-кода',
  },
  ref,
) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [ready, setReady] = useState(false)

  // Колбэки держим в ref: иначе подписка на клавиши пересоздавалась бы.
  const handlers = useRef({ onRun, onSave, onFormat })
  handlers.current = { onRun, onSave, onFormat }

  useImperativeHandle(
    ref,
    () => ({
      revealLine(line, column = 1) {
        const editor = editorRef.current
        if (!editor) return
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column })
        editor.focus()
      },
      getValue() {
        return editorRef.current?.getValue() ?? value
      },
      focus() {
        editorRef.current?.focus()
      },
    }),
    [value],
  )

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    setReady(true)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handlers.current.onRun?.()
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handlers.current.onSave?.()
    })
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        handlers.current.onFormat?.()
      },
    )
  }, [])

  // Автоопределение темы, если она не передана явно.
  const [detectedTheme, setDetectedTheme] = useState(currentMonacoTheme)
  useEffect(() => {
    if (theme) return
    const observer = new MutationObserver(() => setDetectedTheme(currentMonacoTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [theme])

  const activeTheme = theme === 'dark' ? 'go-academy-dark' : theme === 'light' ? 'go-academy-light' : detectedTheme

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden', className)}
      data-editor-ready={ready ? 'true' : 'false'}
      aria-label={ariaLabel}
      role="group"
    >
      <Editor
        language={EDITOR_LANGUAGE}
        value={value}
        theme={activeTheme}
        beforeMount={() => configureMonaco()}
        onMount={handleMount}
        onChange={(next) => onChange(next ?? '')}
        loading={
          <div className="flex h-full items-center justify-center text-[12px] text-fg-subtle">
            Загружаем редактор…
          </div>
        }
        options={{
          readOnly,
          fontSize,
          tabSize,
          fontFamily:
            '"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontLigatures: true,
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'line',
          roundedSelection: false,
          padding: { top: 12, bottom: 12 },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
          overviewRulerBorder: false,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: { indentation: true, bracketPairs: false },
          detectIndentation: false,
          insertSpaces: true,
          wordWrap: 'off',
          contextmenu: true,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          glyphMargin: false,
          folding: true,
          tabCompletion: 'on',
          // Встроенные подсказки Monaco для Go неполны: не обещаем IntelliSense.
          hover: { enabled: 'on', delay: 300 },
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  )
})
