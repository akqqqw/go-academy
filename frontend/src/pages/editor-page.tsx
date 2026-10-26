import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Command,
  FileCode2,
  History,
  Keyboard,
  Loader2,
  Save,
  ShieldAlert,
  Sparkles,
  Terminal,
  Timer,
  XCircle,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { CodeWorkbench } from '@/features/editor/code-workbench'
import { EDITOR_TEMPLATES, templateById } from '@/features/editor/templates'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useRunnerStatus } from '@/services/queries'

const TEMPLATE_STORAGE_KEY = 'goacademy-editor-template'

function readTemplateId(): string {
  try {
    return localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? 'hello'
  } catch {
    return 'hello'
  }
}

/** shortGoVersion превращает «go version go1.23.4 linux/amd64» в «Go 1.23.4». */
export function shortGoVersion(version: string | undefined): string {
  if (!version) return 'Go готов'
  const match = /go(\d+\.\d+(?:\.\d+)?)/.exec(version)
  return match ? `Go ${match[1]}` : version
}

/** formatDateTime показывает время запуска в коротком виде. */
function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const SHORTCUTS = [
  { keys: ['Ctrl', '↵'], label: 'Запустить код' },
  { keys: ['Ctrl', 'S'], label: 'Сохранить черновик' },
  { keys: ['Shift', 'Alt', 'F'], label: 'Форматировать через gofmt' },
  { keys: ['Ctrl', 'Space'], label: 'Автодополнение редактора' },
]

export function EditorPage() {
  const queryClient = useQueryClient()
  const runnerQuery = useRunnerStatus()
  const [templateId, setTemplateId] = useState(readTemplateId)
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null)

  const template = useMemo(() => templateById(templateId), [templateId])

  const draftsQuery = useQuery({
    queryKey: ['drafts-overview'],
    queryFn: api.listDrafts,
    staleTime: 5_000,
  })

  const applyTemplate = useCallback(
    async (id: string) => {
      try {
        // Удаляем черновик, чтобы «Сбросить» возвращал выбранный пример.
        await api.deleteDraft('editor')
      } catch {
        // Черновика могло не быть — это нормально.
      }
      try {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, id)
      } catch {
        // Приватный режим: выбор не запомнится.
      }
      setTemplateId(id)
      void queryClient.invalidateQueries({ queryKey: ['drafts-overview'] })
    },
    [queryClient],
  )

  const runner = runnerQuery.data?.runner
  const runs = draftsQuery.data?.runs ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Инструменты"
        title="Редактор Go"
        description="Свободный редактор с настоящим запуском кода: собирается локальным Go SDK во временном каталоге, вывод и ошибки — в консоли под редактором."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {runner?.available ? (
              <Badge variant="success">
                <CheckCircle2 className="size-3" />
                {shortGoVersion(runner.version)}
              </Badge>
            ) : runnerQuery.isPending ? (
              <Badge variant="outline">
                <Loader2 className="size-3 animate-spin" />
                Проверяем Go
              </Badge>
            ) : (
              <Badge variant="warning">
                <ShieldAlert className="size-3" />
                Go не найден
              </Badge>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="/learning">
                <BookOpen />
                Уроки
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 shadow-card">
            <label
              htmlFor="template-select"
              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
            >
              <FileCode2 className="size-3.5" />
              Пример
            </label>
            <div className="relative">
              <select
                id="template-select"
                value={templateId}
                onChange={(event) => {
                  const next = event.target.value
                  if (next === templateId) return
                  setPendingTemplate(next)
                }}
                className="h-8 appearance-none rounded-md border border-line bg-surface-muted pr-7 pl-2.5 text-[12.5px] text-fg outline-none transition-colors hover:border-line-strong focus-visible:border-primary"
              >
                {EDITOR_TEMPLATES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            </div>
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">{template.description}</p>
            <span className="hidden items-center gap-1 text-[11px] text-fg-subtle sm:flex">
              <Save className="size-3" />
              черновик сохраняется автоматически
            </span>
          </div>

          <div className="h-[calc(100vh-19rem)] min-h-[520px]">
            <CodeWorkbench
              key={templateId}
              draftKey="editor"
              starter={template.code}
              source="editor"
              className="h-full"
              onRunFinished={() => {
                void queryClient.invalidateQueries({ queryKey: ['drafts-overview'] })
                void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
                void queryClient.invalidateQueries({ queryKey: ['activity'] })
              }}
            />
          </div>
        </div>

        <aside className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[13px]">
                <Timer className="size-3.5 text-fg-subtle" />
                Ограничения запуска
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0 text-[12px] text-fg-muted">
              <p className="flex justify-between gap-2">
                <span>Лимит времени</span>
                <span className="font-mono text-fg">
                  {runner ? `${(runner.limits.timeout_ms / 1000).toFixed(0)} с` : '—'}
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span>Вывод на поток</span>
                <span className="font-mono text-fg">
                  {runner ? `${Math.round(runner.limits.max_output_bytes / 1024)} КБ` : '—'}
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span>Размер кода</span>
                <span className="font-mono text-fg">
                  {runner ? `${Math.round(runner.limits.max_code_bytes / 1024)} КБ` : '—'}
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span>Одновременно</span>
                <span className="font-mono text-fg">{runner ? runner.limits.concurrency : '—'}</span>
              </p>
              <p className="pt-1 text-[11px] leading-relaxed text-fg-subtle">
                Зависшая программа завершается принудительно, вывод сверх лимита обрезается.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[13px]">
                <Keyboard className="size-3.5 text-fg-subtle" />
                Горячие клавиши
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.label} className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-fg-muted">{shortcut.label}</span>
                  <span className="flex items-center gap-0.5">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[13px]">
                <History className="size-3.5 text-fg-subtle" />
                Последние запуски
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {draftsQuery.isPending ? (
                <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
                  <Loader2 className="size-3 animate-spin" />
                  Загружаем историю…
                </p>
              ) : runs.length === 0 ? (
                <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                  Здесь появятся запуски: время, длительность и результат.
                </p>
              ) : (
                runs.slice(0, 6).map((run) => (
                  <div key={run.id} className="flex items-center gap-2 text-[11.5px]">
                    {run.ok ? (
                      <CheckCircle2 className="size-3 shrink-0 text-success" />
                    ) : (
                      <XCircle className="size-3 shrink-0 text-danger" />
                    )}
                    <span className="text-fg-muted">{formatDateTime(run.created_at)}</span>
                    <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">
                      {run.duration_ms} мс
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-warning">
              <ShieldAlert className="size-3.5" />
              Не песочница
            </p>
            <p className="text-[11px] leading-relaxed text-fg-muted">
              {runner?.warning ??
                'Локальный запуск ограничивает время и вывод, но не изолирует файловую систему. Для недоверенного кода нужен контейнер с ограничением CPU, памяти и без сети.'}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
              Импорт <code className="font-mono">os/exec</code> и{' '}
              <code className="font-mono">plugin</code> заблокирован: из интерфейса нельзя запустить
              произвольную команду оболочки.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-fg">
              <Sparkles className="size-3.5 text-primary" />
              Что дальше
            </p>
            <p className="text-[11px] leading-relaxed text-fg-muted">
              На этапе 4 этот же движок начнёт проверять практические задачи через настоящие
              Go-тесты: сравнение с эталонным текстом не используется.
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null)
        }}
        title="Сменить пример?"
        description="Текущий код и сохранённый черновик будут заменены выбранным примером."
        confirmLabel="Заменить"
        destructive
        onConfirm={() => {
          const next = pendingTemplate
          setPendingTemplate(null)
          if (!next) return
          void applyTemplate(next).then(() => toast.success('Пример загружен'))
        }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-fg-subtle">
        <span className="inline-flex items-center gap-1.5">
          <Code2 className="size-3.5" />
          Monaco Editor загружается с локального диска
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Terminal className="size-3.5" />
          go build → бинарник → запуск
        </span>
        <span className={cn('inline-flex items-center gap-1.5', 'sm:ml-auto')}>
          <Command className="size-3.5" />
          Ctrl+K — поиск по приложению
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          история сохраняется в SQLite
        </span>
      </div>
    </div>
  )
}
