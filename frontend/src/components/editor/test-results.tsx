import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Clock,
  Eraser,
  ListChecks,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RunDiagnostic, TestRunResult, TestStatus } from '@/types'

import { formatDuration } from './console-panel'

const STATUS_LABELS: Record<TestStatus, string> = {
  ok: 'Все проверки пройдены',
  test_failed: 'Не все проверки пройдены',
  compile_error: 'Ошибка компиляции',
  timeout: 'Превышен лимит времени',
  rejected: 'Проверка отклонена',
  internal: 'Внутренняя ошибка',
}

const STATUS_STYLES: Record<TestStatus, string> = {
  ok: 'bg-success-soft text-success',
  test_failed: 'bg-warning-soft text-warning',
  compile_error: 'bg-danger-soft text-danger',
  timeout: 'bg-warning-soft text-warning',
  rejected: 'bg-warning-soft text-warning',
  internal: 'bg-danger-soft text-danger',
}

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className="size-3.5" />
    case 'timeout':
      return <Clock className="size-3.5" />
    case 'rejected':
      return <Ban className="size-3.5" />
    case 'internal':
      return <CircleSlash className="size-3.5" />
    case 'test_failed':
      return <AlertTriangle className="size-3.5" />
    default:
      return <XCircle className="size-3.5" />
  }
}

interface TestResultsPanelProps {
  result: TestRunResult | null
  running: boolean
  onClear: () => void
  onJumpToLine: (line: number, column?: number) => void
  className?: string
}

/**
 * TestResultsPanel показывает итог проверки решения настоящими Go-тестами:
 * статус, счётчик пройденных проверок, время и вывод каждой проверки.
 * Клик по диагностике переводит курсор в редактор на нужную строку.
 */
export function TestResultsPanel({
  result,
  running,
  onClear,
  onJumpToLine,
  className,
}: TestResultsPanelProps) {
  const [openTest, setOpenTest] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const diagnostics: RunDiagnostic[] = result?.diagnostics ?? []
  const failed = result?.tests.filter((test) => !test.passed) ?? []

  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card',
        className,
      )}
      aria-label="Результаты проверки"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-inset/60 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:text-fg"
          aria-expanded={!collapsed}
        >
          <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
          <ListChecks className="size-3.5" />
          Проверки
        </button>

        {running ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <Loader2 className="size-3 animate-spin text-primary" />
            Запускаем go test…
          </span>
        ) : result ? (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                STATUS_STYLES[result.status],
              )}
            >
              <StatusIcon status={result.status} />
              {STATUS_LABELS[result.status]}
            </span>
            {result.total > 0 ? (
              <span className="text-[11px] font-medium tabular-nums text-fg-muted">
                {result.passed}/{result.total}
              </span>
            ) : null}
            <span className="text-[11px] tabular-nums text-fg-subtle">
              {formatDuration(result.duration_ms)}
              {result.build_ms > 0 ? ` · сборка ${formatDuration(result.build_ms)}` : ''}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-fg-subtle">
            Решение проверяется настоящими Go-тестами на сервере
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {result ? (
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={onClear}>
              <Eraser className="size-3.5" />
              Очистить
            </Button>
          ) : null}
        </div>
      </header>

      {collapsed ? null : (
        <div className="max-h-[260px] overflow-y-auto px-2.5 py-2 text-[12px]">
          {!result && !running ? (
            <p className="py-3 text-center text-[11.5px] text-fg-subtle">
              Нажмите «Проверить тестами» — увидите, какие проверки проходят, а какие нет.
            </p>
          ) : null}

          {result ? (
            <>
              {result.tests.length > 0 ? (
                <ul className="space-y-1">
                  {result.tests.map((test) => {
                    const isOpen = openTest === test.name || (!test.passed && failed.length <= 3)
                    return (
                      <li
                        key={test.name}
                        className={cn(
                          'rounded-lg border px-2 py-1.5',
                          test.passed
                            ? 'border-success/25 bg-success-soft/40'
                            : 'border-danger/25 bg-danger-soft/30',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenTest(isOpen ? null : test.name)}
                          className="flex w-full items-center gap-2 text-left"
                          aria-expanded={isOpen}
                        >
                          {test.passed ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                          ) : test.skipped ? (
                            <CircleSlash className="size-3.5 shrink-0 text-fg-subtle" />
                          ) : (
                            <XCircle className="size-3.5 shrink-0 text-danger" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{test.title}</span>
                          <span className="shrink-0 font-mono text-[10.5px] text-fg-subtle">
                            {test.name}
                          </span>
                          {test.duration_ms > 0 ? (
                            <span className="shrink-0 tabular-nums text-[10.5px] text-fg-subtle">
                              {formatDuration(Math.round(test.duration_ms))}
                            </span>
                          ) : null}
                          {test.output ? (
                            <ChevronDown
                              className={cn(
                                'size-3 shrink-0 text-fg-subtle transition-transform',
                                isOpen && 'rotate-180',
                              )}
                            />
                          ) : null}
                        </button>
                        {isOpen && test.output ? (
                          <pre className="mt-1 max-h-40 overflow-auto rounded border border-line/70 bg-surface-inset px-2 py-1.5 font-mono text-[11px] leading-relaxed text-fg-muted">
                            {test.output}
                          </pre>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}

              {result.message && result.tests.length === 0 ? (
                <p className="py-1.5 text-[11.5px] text-fg-muted">{result.message}</p>
              ) : null}

              {diagnostics.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {diagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.file}-${diagnostic.line}-${index}`}>
                      <button
                        type="button"
                        onClick={() => onJumpToLine(diagnostic.line, diagnostic.column)}
                        className="flex w-full items-start gap-1.5 rounded border border-danger/25 bg-danger-soft/30 px-2 py-1 text-left font-mono text-[11px] text-danger transition-colors hover:bg-danger-soft/60"
                      >
                        <span className="shrink-0 tabular-nums">
                          {diagnostic.file}:{diagnostic.line}
                          {diagnostic.column ? `:${diagnostic.column}` : ''}
                        </span>
                        <span className="min-w-0 break-words">{diagnostic.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {result.stderr.trim() ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-fg-subtle hover:text-fg">
                    <Terminal className="mr-1 inline size-3" />
                    Вывод go test
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded border border-line/70 bg-surface-inset px-2 py-1.5 font-mono text-[11px] leading-relaxed text-fg-muted">
                    {result.stderr.trim()}
                  </pre>
                </details>
              ) : null}

              {result.truncated ? (
                <p className="mt-1 text-[11px] text-warning">
                  Вывод обрезан: решение напечатало слишком много.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}
