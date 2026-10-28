import { ChevronLeft, ChevronRight, Flame, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Tooltip } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/lib/hooks'
import { groupLabels, navItems, type NavItem } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings'
import { useDashboard } from '@/services/queries'

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <NavLink
      to="/"
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors',
        collapsed && 'justify-center px-0',
      )}
      aria-label="Go Academy — на главную"
    >
      <span className="relative grid size-8 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-primary to-[#00758f] text-[13px] font-bold text-primary-fg shadow-[0_2px_10px_-2px_var(--primary)]">
        Go
      </span>
      {collapsed ? null : (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight text-fg">
            Go Academy
          </span>
          <span className="block truncate text-[11px] leading-tight text-fg-subtle">
            локальный курс
          </span>
        </span>
      )}
    </NavLink>
  )
}

function NavRow({
  item,
  collapsed,
  onNavigate,
  streak,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
  streak?: number
}) {
  const Icon = item.icon

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary-soft text-primary'
            : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary"
            />
          ) : null}
          <Icon className="size-4 shrink-0" />
          {collapsed ? null : <span className="truncate">{item.label}</span>}
          {!collapsed && item.to === '/progress' && streak ? (
            <span className="ml-auto inline-flex items-center gap-0.5 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              <Flame className="size-2.5" />
              {streak}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip content={item.label} side="right">
      <div>{link}</div>
    </Tooltip>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const saving = useSettingsStore((state) => state.saving)
  const { data } = useDashboard()
  const streak = data?.snapshot.streak.current ?? 0
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  // На мобильных панель всегда развёрнута: иконки без подписей там неудобны.
  const compact = collapsed && isDesktop

  const groups: NavItem['group'][] = ['learn', 'practice', 'progress', 'system']

  return (
    <>
      <div
        aria-hidden
        onClick={onCloseMobile}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        aria-label="Основная навигация"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface/95 backdrop-blur-xl transition-[width,transform] duration-200 ease-out',
          'lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0',
          compact ? 'lg:w-[68px]' : 'lg:w-[248px]',
          mobileOpen ? 'w-[264px] translate-x-0' : 'w-[264px] -translate-x-full',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center justify-between gap-2 border-b border-line px-3',
            compact && 'lg:justify-center lg:px-0',
          )}
        >
          <Logo collapsed={compact} />
          <button
            type="button"
            onClick={onCloseMobile}
            className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg lg:hidden"
            aria-label="Закрыть навигацию"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {groups.map((group) => {
            const items = navItems.filter((item) => item.group === group)
            return (
              <div key={group} className="space-y-1">
                {compact ? (
                  <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
                ) : (
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                    {groupLabels[group]}
                  </p>
                )}
                {items.map((item) => (
                  <NavRow
                    key={item.to}
                    item={item}
                    collapsed={compact}
                    streak={streak}
                    onNavigate={onCloseMobile}
                  />
                ))}
              </div>
            )
          })}
        </nav>

        <div
          className={cn(
            'flex items-center gap-2 border-t border-line p-2',
            compact ? 'lg:justify-center' : 'justify-between',
          )}
        >
          {compact ? null : (
            <span className="flex items-center gap-1.5 pl-1.5 text-[11px] text-fg-subtle">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  saving ? 'animate-pulse-soft bg-warning' : 'bg-success',
                )}
              />
              {saving ? 'сохраняем…' : 'данные в аккаунте'}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={compact ? 'Развернуть панель' : 'Свернуть панель'}
            className="hidden size-8 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg lg:grid"
          >
            {compact ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
      </aside>
    </>
  )
}
