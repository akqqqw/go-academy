import { Flame, LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { sectionTitle } from '@/lib/nav'
import { cn, plural } from '@/lib/utils'
import { useDashboard } from '@/services/queries'
import { useSettingsStore } from '@/store/settings'

export function Topbar({
  onOpenSearch,
  onOpenMobileNav,
}: {
  onOpenSearch: () => void
  onOpenMobileNav: () => void
}) {
  const location = useLocation()
  const title = sectionTitle(location.pathname)
  const theme = useSettingsStore((state) => state.settings.theme)
  const update = useSettingsStore((state) => state.update)
  const { data } = useDashboard()
  const streak = data?.snapshot.streak.current ?? 0
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  const nextTheme = isDark ? 'light' : 'dark'

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-xl sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Открыть навигацию"
        className="grid size-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg lg:hidden"
      >
        <Menu className="size-[18px]" />
      </button>

      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[13px] font-medium text-fg">{title}</span>
        <span className="hidden text-[11px] text-fg-subtle sm:inline">Go Academy</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Открыть поиск"
          className={cn(
            'group flex h-8 items-center gap-2 rounded-lg border border-line bg-surface/70 px-2.5 text-[12px] text-fg-subtle transition-colors',
            'hover:border-line-strong hover:text-fg-muted',
            'w-8 justify-center sm:w-[218px] sm:justify-start',
          )}
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Поиск по курсу…</span>
          <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:flex">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>

        <Tooltip content={`Серия: ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд`} side="bottom">
          <Link
            to="/progress"
            aria-label={`Серия дней: ${streak}`}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold transition-colors',
              streak > 0
                ? 'border-warning/25 bg-warning-soft text-warning hover:bg-warning-soft/80'
                : 'border-line bg-surface/70 text-fg-subtle hover:text-fg-muted',
            )}
          >
            <Flame className={cn('size-3.5', streak > 0 && 'fill-warning/20')} />
            <span className="tabular-nums">{streak}</span>
          </Link>
        </Tooltip>

        <Tooltip content={nextTheme === 'dark' ? 'Тёмная тема' : 'Светлая тема'} side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Переключить тему"
            onClick={() => {
              void update({ theme: nextTheme }).catch(() => {
                toast.error('Не удалось переключить тему — сервер недоступен')
              })
            }}
            className="border border-line bg-surface/70"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </Tooltip>

        <Tooltip content={user?.email ? `Выйти (${user.email})` : 'Выйти'} side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Выйти из аккаунта"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void signOut().finally(() => setSigningOut(false))
            }}
            className="border border-line bg-surface/70"
          >
            <LogOut className="size-4" />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}
