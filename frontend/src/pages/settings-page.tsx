import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Download,
  FolderCog,
  Info,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Server,
  Sun,
  Target,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Stepper } from '@/components/ui/stepper'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { cn, formatBytes, formatDateTime, plural } from '@/lib/utils'
import { useMeta } from '@/services/queries'
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settings'
import type { Settings, ThemePreference } from '@/types'

function SettingRow({
  title,
  description,
  children,
  stacked = false,
}: {
  title: string
  description?: string
  children: ReactNode
  stacked?: boolean
}) {
  return (
    <div
      className={cn(
        'flex gap-3 border-b border-line/70 py-3.5 last:border-0 last:pb-0 first:pt-0',
        stacked ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between',
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-[13px] font-medium text-fg">{title}</div>
        {description ? (
          <p className="max-w-xl text-[12px] leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      <div className={cn('shrink-0', stacked ? 'w-full' : '')}>{children}</div>
    </div>
  )
}

const themeOptions: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'dark', label: 'Тёмная', icon: <Moon /> },
  { value: 'light', label: 'Светлая', icon: <Sun /> },
  { value: 'system', label: 'Системная', icon: <Monitor /> },
]

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const saving = useSettingsStore((state) => state.saving)
  const meta = useMeta()
  const queryClient = useQueryClient()
  const [downloading, setDownloading] = useState(false)
  const [reloading, setReloading] = useState(false)

  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: api.backups,
    staleTime: 15_000,
  })

  const save = async (changes: Partial<Settings>) => {
    try {
      await update(changes)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить настройку')
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const name = await api.downloadBackup()
      toast.success(`Резервная копия скачана: ${name}`)
      await queryClient.invalidateQueries({ queryKey: ['backups'] })
      await meta.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать копию')
    } finally {
      setDownloading(false)
    }
  }

  const handleReloadContent = async () => {
    setReloading(true)
    try {
      const result = await api.reloadContent()
      toast.success(`Контент перечитан: ${result.lessons} уроков в программе`)
      await queryClient.invalidateQueries({ queryKey: ['course'] })
      await queryClient.invalidateQueries({ queryKey: ['meta'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось перечитать контент')
    } finally {
      setReloading(false)
    }
  }

  const resetSettings = async () => {
    if (!window.confirm('Сбросить настройки оформления, целей и редактора? Данные обучения останутся.')) {
      return
    }
    await save({
      theme: DEFAULT_SETTINGS.theme,
      sidebar_collapsed: DEFAULT_SETTINGS.sidebar_collapsed,
      reduced_motion: DEFAULT_SETTINGS.reduced_motion,
      daily_goal_minutes: DEFAULT_SETTINGS.daily_goal_minutes,
      daily_goal_exercises: DEFAULT_SETTINGS.daily_goal_exercises,
      daily_goal_cards: DEFAULT_SETTINGS.daily_goal_cards,
      editor_font_size: DEFAULT_SETTINGS.editor_font_size,
      editor_tab_size: DEFAULT_SETTINGS.editor_tab_size,
      code_autosave: DEFAULT_SETTINGS.code_autosave,
    })
    toast.success('Настройки сброшены к значениям по умолчанию')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Приложение"
        title="Настройки"
        description="Тема, дневные цели, параметры редактора и работа с локальными данными. Изменения сохраняются автоматически в SQLite."
        actions={
          <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <Save className={cn('size-3.5', saving && 'animate-pulse-soft text-warning')} />
            {saving ? 'сохраняем…' : 'всё сохранено'}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              Внешний вид
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SettingRow title="Тема оформления" description="Применяется сразу и запоминается.">
              <Segmented
                value={settings.theme}
                options={themeOptions}
                onChange={(theme) => void save({ theme })}
                ariaLabel="Тема оформления"
              />
            </SettingRow>
            <SettingRow
              title="Свёрнутая боковая панель"
              description="Компактная навигация только с иконками на больших экранах."
            >
              <Switch
                checked={settings.sidebar_collapsed}
                onCheckedChange={(checked) => void save({ sidebar_collapsed: checked })}
                aria-label="Свернуть боковую панель"
              />
            </SettingRow>
            <SettingRow
              title="Меньше анимаций"
              description="Отключает плавные переходы — полезно на слабых ноутбуках."
            >
              <Switch
                checked={settings.reduced_motion}
                onCheckedChange={(checked) => void save({ reduced_motion: checked })}
                aria-label="Уменьшить анимации"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              Цели на день
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SettingRow
              title="Минут обучения"
              description="Считается только активное время при открытой вкладке."
            >
              <Stepper
                value={settings.daily_goal_minutes}
                min={5}
                max={240}
                step={5}
                unit="мин"
                ariaLabel="Минут обучения в день"
                onChange={(value) => void save({ daily_goal_minutes: value })}
              />
            </SettingRow>
            <SettingRow title="Практических задач" description="Сколько задач решать за день.">
              <Stepper
                value={settings.daily_goal_exercises}
                min={1}
                max={20}
                ariaLabel="Задач в день"
                onChange={(value) => void save({ daily_goal_exercises: value })}
              />
            </SettingRow>
            <SettingRow title="Карточек для повторения" description="Цель по карточкам на день.">
              <Stepper
                value={settings.daily_goal_cards}
                min={1}
                max={100}
                step={5}
                ariaLabel="Карточек в день"
                onChange={(value) => void save({ daily_goal_cards: value })}
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderCog className="size-4 text-primary" />
              Редактор кода
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SettingRow title="Размер шрифта" description="Для Monaco Editor в уроках и практике.">
              <Stepper
                value={settings.editor_font_size}
                min={11}
                max={22}
                unit="px"
                ariaLabel="Размер шрифта редактора"
                onChange={(value) => void save({ editor_font_size: value })}
              />
            </SettingRow>
            <SettingRow title="Ширина отступа" description="Количество пробелов в табуляции.">
              <Stepper
                value={settings.editor_tab_size}
                min={2}
                max={8}
                unit="проб."
                ariaLabel="Ширина табуляции"
                onChange={(value) => void save({ editor_tab_size: value })}
              />
            </SettingRow>
            <SettingRow
              title="Автосохранение кода"
              description="Черновики решений будут сохраняться в базу при вводе."
            >
              <Switch
                checked={settings.code_autosave}
                onCheckedChange={(checked) => void save({ code_autosave: checked })}
                aria-label="Автосохранение кода"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              Данные и резервные копии
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
              <Download />
              {downloading ? 'Создаём…' : 'Скачать копию'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {meta.isError ? (
              <ErrorState message={meta.error.message} onRetry={() => void meta.refetch()} />
            ) : meta.data ? (
              <>
                <dl className="space-y-2 text-[12px]">
                  {[
                    ['База данных', meta.data.storage.db_path],
                    ['Размер базы', formatBytes(meta.data.storage.db_size_bytes)],
                    ['Версия схемы', `${meta.data.storage.schema_version}`],
                    ['Контент', meta.data.content.content_dir],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-fg-muted">{label}</dt>
                      <dd className="break-all text-right font-mono text-[11px] text-fg">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-lg border border-line bg-surface-inset p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-fg">
                      Резервные копии ·{' '}
                      {backups.data ? backups.data.count : meta.data.storage.backups}
                    </span>
                    <span className="text-[11px] text-fg-subtle">хранятся 5 последних</span>
                  </div>
                  {backups.isError ? (
                    <p className="text-[12px] text-danger">Не удалось получить список копий.</p>
                  ) : backups.data && backups.data.backups.length > 0 ? (
                    <ul className="space-y-1">
                      {backups.data.backups.slice(0, 4).map((backup) => (
                        <li
                          key={backup.name}
                          className="flex items-center justify-between gap-2 font-mono text-[11px] text-fg-muted"
                        >
                          <span className="truncate">{backup.name}</span>
                          <span className="shrink-0 text-fg-subtle">
                            {formatBytes(backup.size_bytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-fg-subtle">
                      Копии создаются автоматически при запуске сервера.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleReloadContent}
                    disabled={reloading}
                  >
                    <RotateCcw />
                    {reloading ? 'Читаем…' : 'Перечитать контент'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetSettings}>
                    <RotateCcw />
                    Сбросить настройки
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse-soft rounded bg-surface-muted" />
                <div className="h-3 w-2/3 animate-pulse-soft rounded bg-surface-muted" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4 text-fg-subtle" />
            О приложении
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meta.data ? (
            <div className="grid gap-x-6 gap-y-3 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Server,
                  label: 'Версия и этап',
                  value: `${meta.data.app.name} ${meta.data.app.version} · ${meta.data.app.stage_label}`,
                },
                {
                  icon: Server,
                  label: 'Среда',
                  value: `${meta.data.runtime.go} · ${meta.data.runtime.os}/${meta.data.runtime.arch}`,
                },
                {
                  icon: Server,
                  label: 'Адрес API',
                  value: meta.data.server.addr,
                },
                {
                  icon: Database,
                  label: 'Контент',
                  value: `${meta.data.content.modules} модулей · ${meta.data.content.lessons} уроков · готово ${meta.data.content.ready_lessons}`,
                },
                {
                  icon: Database,
                  label: 'Материалы практики',
                  value: `${meta.data.content.exercises} задач · ${meta.data.content.flashcards} карточек · ${meta.data.content.quizzes} тестов`,
                },
                {
                  icon: Info,
                  label: 'Обновлено',
                  value: formatDateTime(meta.data.runtime.started_at),
                },
              ].map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
                    {row.label}
                  </div>
                  <div className="flex items-center gap-1.5 text-fg">
                    <row.icon className="size-3.5 shrink-0 text-fg-subtle" />
                    <span className="break-all">{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-fg-muted">Загружаем сведения о сервере…</p>
          )}
          <p className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-fg-subtle">
            Приложение работает локально и не требует интернета. Данные не покидают компьютер;
            достижения и материалы практики появятся в следующих этапах. Текущий статус:{' '}
            <Badge variant="primary">{meta.data?.app.stage_label ?? 'подключение'}</Badge>{' '}
            {meta.data ? `· ${meta.data.content.decks} ${plural(meta.data.content.decks, 'набор', 'набора', 'наборов')} карточек` : null}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
