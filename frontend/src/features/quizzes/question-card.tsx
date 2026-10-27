import { Check, Code2, HelpCircle, Type } from 'lucide-react'

import { MarkdownViewer } from '@/components/markdown'
import { cn } from '@/lib/utils'
import type { QuizQuestion } from '@/types'

const TYPE_LABEL: Record<QuizQuestion['type'], string> = {
  single: 'Один ответ',
  multiple: 'Несколько ответов',
  true_false: 'Верно или неверно',
  input: 'Короткий ответ',
  code: 'Разбор кода',
}

const TYPE_ICON = {
  single: HelpCircle,
  multiple: Check,
  true_false: HelpCircle,
  input: Type,
  code: Code2,
} as const

export function questionTypeLabel(type: QuizQuestion['type']) {
  return TYPE_LABEL[type] ?? 'Вопрос'
}

interface QuestionCardProps {
  question: QuizQuestion
  index: number
  total: number
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

/**
 * QuestionCard — один вопрос викторины.
 *
 * Поддерживает пять типов: одиночный и множественный выбор, верно/неверно,
 * короткий текстовый ответ и вопрос по фрагменту Go-кода.
 */
export function QuestionCard({ question, index, total, value, onChange, disabled }: QuestionCardProps) {
  const Icon = TYPE_ICON[question.type] ?? HelpCircle

  const toggleOption = (id: string) => {
    if (disabled) return
    if (question.type === 'multiple') {
      onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id])
      return
    }
    onChange([id])
  }

  const trueFalseValue = value[0]

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary">
          <Icon className="size-3" />
          {TYPE_LABEL[question.type]}
        </span>
        <span>
          Вопрос {index + 1} из {total}
        </span>
        {question.type === 'multiple' ? (
          <span className="ml-auto">можно выбрать несколько</span>
        ) : null}
      </div>

      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed font-medium text-fg">
        {question.prompt}
      </p>

      {question.code ? (
        <div className="mt-2.5 overflow-hidden rounded-lg border border-line px-3 py-2">
          <MarkdownViewer markdown={'```go\n' + question.code + '\n```'} />
        </div>
      ) : null}

      {question.type === 'input' ? (
        <div className="mt-3">
          <input
            value={value[0] ?? ''}
            onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
            disabled={disabled}
            placeholder="Введите ответ"
            aria-label="Ответ на вопрос"
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-line bg-surface-inset px-3 font-mono text-[13px] text-fg outline-none focus:border-primary/60"
          />
          <p className="mt-1 text-[11px] text-fg-subtle">
            Регистр и лишние пробелы не важны, но формулировка должна совпасть.
          </p>
        </div>
      ) : null}

      {question.type === 'true_false' ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { id: 'true', label: 'Верно' },
            { id: 'false', label: 'Неверно' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={trueFalseValue === option.id}
              onClick={() => toggleOption(option.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                trueFalseValue === option.id
                  ? 'border-primary/50 bg-primary-soft font-medium text-primary'
                  : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-muted/60',
              )}
            >
              <span
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full border',
                  trueFalseValue === option.id ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong',
                )}
              >
                {trueFalseValue === option.id ? <Check className="size-2.5" /> : null}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {question.type !== 'input' && question.type !== 'true_false' ? (
        <ul className="mt-3 space-y-1.5">
          {(question.options ?? []).map((option) => {
            const selected = value.includes(option.id)
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => toggleOption(option.id)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                    selected
                      ? 'border-primary/50 bg-primary-soft/70 text-fg'
                      : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-muted/60',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-4 shrink-0 place-items-center border',
                      question.type === 'multiple' ? 'rounded-[4px]' : 'rounded-full',
                      selected ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong',
                    )}
                  >
                    {selected ? <Check className="size-2.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed">
                    {option.text}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-fg-subtle">{option.id}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
