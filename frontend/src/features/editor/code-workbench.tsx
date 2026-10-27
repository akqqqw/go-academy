import {
  AlignLeft,
  BadgeCheck,
  CheckCircle2,
  CloudOff,
  Info,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { CodeEditor, type CodeEditorHandle } from '@/components/editor/code-editor'
import { ConsolePanel } from '@/components/editor/console-panel'
import { TestResultsPanel } from '@/components/editor/test-results'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { useDraft } from '@/features/editor/use-draft'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useRunnerStatus } from '@/services/queries'
import { useSettingsStore } from '@/store/settings'
import type { ExerciseSubmitResponse, RunResult, RunnerStatus, TestRunResult } from '@/types'

const FALLBACK_STATUS: RunnerStatus = {
  available: false,
  limits: { timeout_ms: 10000, max_output_bytes: 262144, max_code_bytes: 262144, concurrency: 2 },
  warning: 'Запуск кода недоступен: сервер не отвечает.',
  reason: 'нет ответа от локального сервера',
}

interface CodeWorkbenchProps {
  /** Ключ черновика: editor | lesson:<id> | exercise:<id>. */
  draftKey: string
  /** Стартовый код и содержимое «Сбросить». */
  starter: string
  source: 'editor' | 'lesson' | 'exercise'
  refId?: string
  className?: string
  /** Сообщать родителю о запуске (например, для статистики). */
  onRunFinished?: (result: RunResult) => void
  /** Дополнительные действия в панели инструментов. */
  extraActions?: React.ReactNode
  /**
   * Проверка решения задания настоящими тестами. Если обработчик передан,
   * главная кнопка запускает go test, а обычный запуск становится вторичным.
   */
  submit?: (code: string) => Promise<ExerciseSubmitResponse>
  /** Текст главной кнопки в режиме проверки. */
  submitLabel?: string
  onSubmitFinished?: (response: ExerciseSubmitResponse) => void
}

/**
 * CodeWorkbench — редактор Go с запуском, проверкой, форматированием и
 * сохранением черновика. Один и тот же компонент используется в свободном
 * редакторе и в уроке.
 */
export function CodeWorkbench({
  draftKey,
  starter,
  source,
  refId,
  className,
  onRunFinished,
  extraActions,
  submit,
  submitLabel = 'Проверить тестами',
  onSubmitFinished,
}: CodeWorkbenchProps) {
  const settings = useSettingsStore((state) => state.settings)
  const runnerQuery = useRunnerStatus()
  const runner = runnerQuery.data?.runner ?? FALLBACK_STATUS

  const draft = useDraft({
    draftKey,
    fallback: starter,
    autosave: settings.code_autosave,
  })

  const editorRef = useRef<CodeEditorHandle>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [grading, setGrading] = useState(false)
  const [testResult, setTestResult] = useState<TestRunResult | null>(null)

  // Код держим в ref: обработчики шорткатов не должны зависеть от рендера.
  const codeRef = useRef(draft.code)
  codeRef.current = draft.code

  const run = useCallback(async () => {
    if (running) return
    if (!runner.available) {
      toast.error(runner.reason ?? 'Go SDK недоступен на этом компьютере')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const response = await api.runCode({ code: codeRef.current, source, ref_id: refId })
      setResult(response)
      onRunFinished?.(response)
      if (response.status === 'timeout') {
        toast.warning(response.message ?? 'Превышен лимит времени выполнения')
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'не удалось выполнить код'
      toast.error(message)
      setResult({
        status: 'internal',
        exit_code: -1,
        duration_ms: 0,
        build_ms: 0,
        stdout: '',
        stderr: message,
        truncated: false,
        timed_out: false,
        diagnostics: null,
        message,
      })
    } finally {
      setRunning(false)
    }
  }, [onRunFinished, refId, runner.available, runner.reason, running, source])

  const grade = useCallback(async () => {
    if (!submit || grading) return
    if (!runner.available) {
      toast.error(runner.reason ?? 'Go SDK недоступен на этом компьютере')
      return
    }
    setGrading(true)
    setTestResult(null)
    try {
      const response = await submit(codeRef.current)
      setTestResult(response.result)
      onSubmitFinished?.(response)
      if (response.solved) {
        toast.success('Все проверки пройдены — задание решено')
      } else if (response.result.status === 'test_failed' || response.result.status === 'compile_error') {
        toast.error(response.result.message ?? 'Решение не прошло проверки')
      } else if (response.result.status === 'timeout') {
        toast.warning('Проверка остановлена по лимиту времени')
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'не удалось проверить решение'
      toast.error(message)
      setTestResult({
        status: 'internal',
        passed: 0,
        total: 0,
        tests: [],
        duration_ms: 0,
        build_ms: 0,
        stdout: '',
        stderr: message,
        truncated: false,
        timed_out: false,
        diagnostics: null,
        message,
      })
    } finally {
      setGrading(false)
    }
  }, [grading, onSubmitFinished, runner.available, runner.reason, submit])

  const check = useCallback(async () => {
    if (checking) return
    if (!runner.available) {
      toast.error(runner.reason ?? 'Go SDK недоступен на этом компьютере')
      return
    }
    setChecking(true)
    try {
      const response = await api.checkCode({ code: codeRef.current, source, ref_id: refId })
      setResult(response)
      if (response.status === 'ok') toast.success('Код компилируется')
      else if (response.status === 'compile_error') toast.error('Есть ошибки компиляции')
      else if (response.status === 'rejected') toast.warning(response.message ?? 'Проверка отклонена')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'не удалось проверить код')
    } finally {
      setChecking(false)
    }
  }, [checking, refId, runner.available, runner.reason, source])

  const format = useCallback(async () => {
    if (formatting) return
    setFormatting(true)
    try {
      const response = await api.formatCode({ code: codeRef.current })
      if (response.status === 'ok') {
        draft.setCode(response.code)
        toast.success('Код отформатирован через gofmt')
      } else {
        const first = response.diagnostics?.[0]
        toast.error(
          first
            ? `Не удалось отформатировать: строка ${first.line}: ${first.message}`
            : 'Не удалось отформатировать код',
        )
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'форматирование не удалось')
    } finally {
      setFormatting(false)
    }
  }, [draft, formatting])

  const save = useCallback(async () => {
    await draft.save()
    toast.success('Черновик сохранён')
  }, [draft])

  const reset = useCallback(async () => {
    await draft.reset()
    setResult(null)
    setTestResult(null)
    toast.success('Код восстановлен к исходному варианту')
  }, [draft])

  const jumpToLine = useCallback((line: number, column = 1) => {
    editorRef.current?.revealLine(line, column)
  }, [])

  // Глобальные шорткаты работают, даже когда фокус вне редактора.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key === 'Enter') {
        event.preventDefault()
        if (submit) void grade()
        else void run()
      }
      if (modifier && event.key.toLowerCase() === 's') {
        const target = event.target as HTMLElement | null
        // Не перехватываем Ctrl+S в других формах.
        if (target && !target.closest('[data-workbench]')) return
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [grade, run, save, submit])

  const saveLabel =
    draft.state === 'saving'
      ? 'Сохраняем…'
      : draft.state === 'saved'
        ? 'Сохранено'
        : draft.state === 'dirty'
          ? 'Есть изменения'
          : draft.state === 'error'
            ? 'Ошибка сохранения'
            : settings.code_autosave
              ? 'Автосохранение'
              : 'Не сохранено'

  return (
    <div
      data-workbench
      className={cn('flex min-h-0 flex-col gap-2', className)}
      aria-label="Рабочая область редактора"
    >
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 shadow-card">
        {submit ? (
          <>
            <Tooltip side="bottom" content={`Запустить скрытые тесты задания (лимит ${(runner.limits.timeout_ms / 1000).toFixed(0)} с)`}>
              <Button
                size="sm"
                onClick={() => void grade()}
                disabled={grading || !runner.available}
                className="font-medium"
              >
                {grading ? <Loader2 className="animate-spin" /> : <ListChecks />}
                {submitLabel}
                <kbd className="ml-1 hidden rounded border border-white/25 px-1 text-[10px] font-normal opacity-80 sm:inline">
                  Ctrl+↵
                </kbd>
              </Button>
            </Tooltip>
            <Tooltip side="bottom" content="Обычный запуск программы без тестов">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void run()}
                disabled={running || grading || !runner.available}
              >
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                Запустить
              </Button>
            </Tooltip>
          </>
        ) : (
          <Tooltip
            side="bottom"
            content={
              runner.available
                ? `Собрать и запустить (лимит ${(runner.limits.timeout_ms / 1000).toFixed(0)} с)`
                : (runner.reason ?? 'Go SDK не найден')
            }
          >
            <Button
              size="sm"
              onClick={() => void run()}
              disabled={running || !runner.available}
              className="font-medium"
            >
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              Запустить
              <kbd className="ml-1 hidden rounded border border-white/25 px-1 text-[10px] font-normal opacity-80 sm:inline">
                Ctrl+↵
              </kbd>
            </Button>
          </Tooltip>
        )}

        <Tooltip side="bottom" content="Только компиляция: код не выполняется">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void check()}
            disabled={checking || running || grading || !runner.available}
          >
            {checking ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
            Проверить
          </Button>
        </Tooltip>

        <Tooltip side="bottom" content="Форматирование gofmt (Shift+Alt+F)">
          <Button size="sm" variant="ghost" onClick={() => void format()} disabled={formatting}>
            {formatting ? <Loader2 className="animate-spin" /> : <AlignLeft />}
            Формат
          </Button>
        </Tooltip>

        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />

        <Tooltip side="bottom" content="Сохранить черновик в локальную базу (Ctrl+S)">
          <Button size="sm" variant="ghost" onClick={() => void save()}>
            {draft.state === 'saving' ? <Loader2 className="animate-spin" /> : <Save />}
            Сохранить
          </Button>
        </Tooltip>

        <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
          <RotateCcw />
          Сбросить
        </Button>

        {extraActions}

        <div className="ml-auto flex items-center gap-2 pl-2 text-[11px]">
          <span
            className={cn(
              'inline-flex items-center gap-1',
              draft.state === 'error' ? 'text-danger' : draft.state === 'dirty' ? 'text-warning' : 'text-fg-subtle',
            )}
            title={draft.error ?? undefined}
          >
            {draft.state === 'error' ? (
              <CloudOff className="size-3" />
            ) : draft.state === 'saved' ? (
              <CheckCircle2 className="size-3 text-success" />
            ) : null}
            {saveLabel}
          </span>
          {!runner.available ? (
            <Tooltip
              side="bottom"
              content={runner.reason ?? 'Установите Go SDK и перезапустите сервер'}
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                <ShieldAlert className="size-3" />
                Go не найден
              </span>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <CodeEditor
          ref={editorRef}
          value={draft.code}
          onChange={draft.setCode}
          onRun={() => (submit ? void grade() : void run())}
          onSave={() => void save()}
          onFormat={() => void format()}
          fontSize={settings.editor_font_size}
          tabSize={settings.editor_tab_size}
        />
      </div>

      {submit ? (
        <TestResultsPanel
          result={testResult}
          running={grading}
          onClear={() => setTestResult(null)}
          onJumpToLine={jumpToLine}
          className="shrink-0"
        />
      ) : null}

      <ConsolePanel
        result={result}
        running={running}
        checking={checking}
        onClear={() => setResult(null)}
        onJumpToLine={jumpToLine}
        className="shrink-0"
      />

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
        <Info className="mt-0.5 size-3 shrink-0" />
        <span>
          Код выполняется локальным Go SDK ({(runner.limits.timeout_ms / 1000).toFixed(0)} с, до{' '}
          {Math.round(runner.limits.max_output_bytes / 1024)} КБ вывода,{' '}
          {runner.limits.concurrency}{' '}
          {runner.limits.concurrency === 1 ? 'запуск' : 'запуска'} одновременно). Это ограничение
          ресурсов, а не песочница: программа видит файлы пользователя.
        </span>
      </p>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Вернуть исходный код?"
        description="Текущий код будет заменён стартовым вариантом, а сохранённый черновик удалён из базы. Действие нельзя отменить."
        confirmLabel="Сбросить"
        destructive
        onConfirm={() => void reset()}
      />
    </div>
  )
}
