// Заглушка Monaco для тестов: jsdom не умеет canvas и воркеры, поэтому
// настоящий редактор в тестах заменяется на textarea с тем же контрактом.
import { forwardRef, useImperativeHandle } from 'react'

export interface CodeEditorHandle {
  revealLine: (line: number, column?: number) => void
  getValue: () => string
  focus: () => void
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  onRun?: () => void
  onSave?: () => void
  onFormat?: () => void
  readOnly?: boolean
  ariaLabel?: string
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, onRun, ariaLabel = 'Редактор Go-кода', readOnly = false },
  ref,
) {
  useImperativeHandle(ref, () => ({
    revealLine: () => undefined,
    getValue: () => value,
    focus: () => undefined,
  }))

  return (
    <div data-testid="monaco-stub" className="h-full">
      <textarea
        aria-label={ariaLabel}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            onRun?.()
          }
        }}
        className="h-full min-h-[320px] w-full resize-none bg-transparent p-3 font-mono text-[12px] outline-none"
        spellCheck={false}
      />
    </div>
  )
})
