import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Clock,
  Eraser,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RunDiagnostic, RunResult, RunStatus } from '@/types'

/** Подписи статусов запуска. */
const STATUS_LABELS: Record<RunStatus, string> = {
  ok: 'Выполнено успешно',
  runtime_error: 'Ошибка выполнения',
  compile_error: 'Ошибка компиляции',
  timeout: 'Превышен лимит времени',
  rejected: 'Запуск отклонён',
  internal: 'Внутренняя ошибка',
}

const STATUS_STYLES: Record<RunStatus, string> = {
  ok: 'bg-success-soft text-success',
  runtime_error: 'bg-danger-soft text-danger',
  compile_error: 'bg-danger-soft text-danger',
  timeout: 'bg-warning-soft text-warning',
  rejected: 'bg-warning-soft text-warning',
  internal: 'bg-danger-soft text-danger',
}

function StatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className="size-3.5" />
    case 'timeout':
      return <Clock className="size-3.5" />
    case 'rejected':
      return <Ban className="size-3.5" />
    case 'internal':
      return <CircleSlash className="size-3.5" />
    default:
      return <XCircle className="size-3.5" />
  }
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} мс`
  return `${(ms / 1000).toFixed(2)} с`
}

interface ConsolePanelProps {
  result: RunResult | null
  running: boolean
  checking?: boolean
  onClear: () => void
  onJumpToLine: (line: number, column?: number) => void
  className?: string
  /** Высота консоли ограничена, потому что она живёт под редактором. */
  compact?: boolean
}

/**
 * ConsolePanel показывает результат запуска: статус, время, потоки вывода и
 * список ошибок с номерами строк. Клик по ошибке переводит курсор в редактор.
 */
export function ConsolePanel({
  result,
  running,
  checking = false,
  onClear,
  onJumpToLine,
  className,
  compact = true,
}: ConsolePanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<'stdout' | 'stderr'>('stdout')
  const scrollRef = useRef<HTMLDivElement>(null)

  const diagnostics: RunDiagnostic[] = useMemo(() => result?.diagnostics ?? [], [result])
  const hasStderr = Boolean(result && (result.stderr.trim() || diagnostics.length > 0))

  // При ошибке автоматически открываем вкладку с ошибками.
  useEffect(() => {
    if (!result) return
    setTab(result.status === 'ok' ? 'stdout' : hasStderr ? 'stderr' : 'stdout')
  }, [result, hasStderr])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [result])

  const empty = !result && !running

  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card',
        className,
      )}
      aria-label="Консоль выполнения"
    >
      <header className="flex items-center gap-2 border-b border-line bg-surface-inset/60 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:text-fg"
          aria-expanded={!collapsed}
        >
          <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
          <Terminal className="size-3.5" />
          Консоль
        </button>

        <div className="ml-1 flex items-center gap-1" role="tablist" aria-label="Поток вывода">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stdout'}
            onClick={() => setTab('stdout')}
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] transition-colors',
              tab === 'stdout' ? 'bg-surface text-fg shadow-card' : 'text-fg-subtle hover:text-fg',
            )}
          >
            stdout
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stderr'}
            onClick={() => setTab('stderr')}
            className={cn(
              'relative rounded px-1.5 py-0.5 text-[11px] transition-colors',
              tab === 'stderr' ? 'bg-surface text-fg shadow-card' : 'text-fg-subtle hover:text-fg',
            )}
          >
            ошибки
            {diagnostics.length > 0 ? (
              <span className="ml-1 rounded-full bg-danger-soft px-1 text-[10px] font-medium text-danger">
                {diagnostics.length}
              </span>
            ) : null}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {running || checking ? (
            <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
              <Loader2 className="size-3 animate-spin" />
              {checking ? 'Проверяем сборку…' : 'Выполняем…'}
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
              <span className="hidden items-center gap-2 font-mono text-[10.5px] text-fg-subtle sm:flex">
                {result.build_ms > 0 ? <span>сборка {formatDuration(result.build_ms)}</span> : null}
                <span>выполнение {formatDuration(result.duration_ms)}</span>
                {result.exit_code !== 0 ? <span>код {result.exit_code}</span> : null}
              </span>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            disabled={!result}
            aria-label="Очистить консоль"
            title="Очистить консоль"
          >
            <Eraser />
          </Button>
        </div>
      </header>

      {collapsed ? null : (
        <div
          ref={scrollRef}
          className={cn(
            'overflow-auto bg-[var(--code-bg)] px-3 py-2 font-mono text-[12px] leading-[1.6]',
            compact ? 'h-[168px]' : 'h-[280px]',
          )}
        >
          {empty ? (
            <p className="py-6 text-center font-sans text-[12px] text-fg-subtle">
              Нажмите «Запустить» (Ctrl+Enter) — вывод программы появится здесь.
            </p>
          ) : tab === 'stdout' ? (
            result?.stdout ? (
              <pre className="whitespace-pre-wrap break-words text-[var(--code-fg)]">{result.stdout}</pre>
            ) : (
              <p className="font-sans text-[12px] text-fg-subtle">
                {result ? 'Программа ничего не вывела в stdout.' : 'Нет вывода.'}
              </p>
            )
          ) : (
            <div className="space-y-2">
              {result?.message && result.status !== 'ok' ? (
                <p className="flex items-start gap-1.5 font-sans text-[12px] text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{result.message}</span>
                </p>
              ) : null}

              {diagnostics.length > 0 ? (
                <ul className="space-y-1">
                  {diagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.line}-${diagnostic.column}-${index}`}>
                      <button
                        type="button"
                        onClick={() => onJumpToLine(diagnostic.line || 1, diagnostic.column || 1)}
                        className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-muted"
                        title="Перейти к строке"
                      >
                        <span className="shrink-0 rounded bg-danger-soft px-1 font-sans text-[10px] font-medium text-danger">
                          стр. {diagnostic.line || '?'}
                        </span>
                        <span className="whitespace-pre-wrap break-words text-danger/90">
                          {diagnostic.message}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {result?.stderr.trim() ? (
                <pre className="whitespace-pre-wrap break-words text-[var(--code-fg)] opacity-80">
                  {result.stderr}
                </pre>
              ) : null}

              {!result?.stderr.trim() && diagnostics.length === 0 ? (
                <p className="font-sans text-[12px] text-fg-subtle">Ошибок нет.</p>
              ) : null}

              {result?.truncated ? (
                <p className="font-sans text-[11px] text-warning">
                  Вывод обрезан: превышен лимит размера. Цикл с бесконечной печатью остановлен.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
