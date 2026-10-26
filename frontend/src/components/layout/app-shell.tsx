import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { CommandPalette } from '@/components/layout/command-palette'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useSettingsBootstrap, useMeta } from '@/services/queries'
import { useStudyTimer } from '@/services/use-study-timer'
import { useSettingsStore } from '@/store/settings'

export function AppShell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const collapsed = useSettingsStore((state) => state.settings.sidebar_collapsed)
  const update = useSettingsStore((state) => state.update)
  const { isError: settingsError } = useSettingsBootstrap()
  const meta = useMeta()

  useStudyTimer()

  // Глобальное сочетание клавиш для поиска.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey
      if (isModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // При смене раздела закрываем мобильное меню и прокручиваем страницу наверх.
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => void update({ sidebar_collapsed: !collapsed })}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSearch={() => setPaletteOpen(true)} onOpenMobileNav={() => setMobileOpen(true)} />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1180px]">
            {settingsError ? (
              <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft/50 px-3 py-2 text-[13px] text-warning">
                Не удалось загрузить настройки с сервера — используются значения по умолчанию.
              </div>
            ) : null}
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-2 text-[11px] text-fg-subtle">
            <span>Go Academy · данные хранятся локально в SQLite</span>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <span
                  className={`size-1.5 rounded-full ${meta.isError ? 'bg-danger' : meta.data ? 'bg-success' : 'bg-warning'}`}
                />
                {meta.isError
                  ? 'backend недоступен'
                  : meta.data
                    ? `backend ${meta.data.app.version} · ${meta.data.runtime.go}`
                    : 'подключение…'}
              </span>
              {meta.data ? <span>· {meta.data.app.stage_label}</span> : null}
            </span>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
