import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  GraduationCap,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useDebouncedValue } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { SearchResult } from '@/types'

const quickLinks: SearchResult[] = [
  {
    type: 'section',
    id: 'quick-learning',
    title: 'Программа обучения',
    subtitle: 'Все 14 модулей курса',
    route: '/learning',
    available: true,
    score: 0,
  },
  {
    type: 'section',
    id: 'quick-progress',
    title: 'Мой прогресс',
    subtitle: 'Статистика и календарь активности',
    route: '/progress',
    available: true,
    score: 0,
  },
  {
    type: 'section',
    id: 'quick-settings',
    title: 'Настройки',
    subtitle: 'Тема, цели и резервные копии',
    route: '/settings',
    available: true,
    score: 0,
  },
]

const typeLabels: Record<string, string> = {
  lesson: 'Урок',
  module: 'Модуль',
  section: 'Раздел',
  note: 'Заметка',
  exercise: 'Задача',
  card: 'Карточка',
  function: 'Функция Go',
}

function iconFor(type: string) {
  switch (type) {
    case 'lesson':
      return BookOpen
    case 'module':
      return GraduationCap
    case 'card':
      return Layers
    case 'section':
      return ArrowRight
    default:
      return Sparkles
  }
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const debounced = useDebouncedValue(query.trim(), 160)

  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length > 1,
    staleTime: 30_000,
  })

  const results = useMemo(() => {
    if (debounced.length > 1) return data?.results ?? []
    return quickLinks
  }, [data, debounced])

  useEffect(() => {
    if (open) {
      setActiveIndex(0)
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(timer)
    }
    setQuery('')
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [debounced])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const activate = (item: SearchResult) => {
    if (!item.available) return
    onOpenChange(false)
    navigate(item.route)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) =>
        results.length === 0 ? 0 : (index - 1 + results.length) % results.length,
      )
    } else if (event.key === 'Enter') {
      const item = results[activeIndex]
      if (item) {
        event.preventDefault()
        activate(item)
      }
    } else if (event.key === 'Escape') {
      onOpenChange(false)
    } else if (event.key === 'Home') {
      setActiveIndex(0)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose aria-describedby={undefined} className="top-[10vh] max-w-2xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Глобальный поиск</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Поиск по урокам, модулям и разделам…"
            aria-label="Поисковый запрос"
            className="h-6 w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="hidden rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {isError ? (
            <p className="px-3 py-6 text-center text-sm text-danger">
              Не удалось выполнить поиск. Проверьте соединение с сервером.
            </p>
          ) : null}

          {!isError && results.length === 0 && debounced.length > 1 && !isFetching ? (
            <p className="px-3 py-8 text-center text-sm text-fg-muted">
              По запросу «{debounced}» ничего не найдено.
            </p>
          ) : null}

          {!isError && debounced.length <= 1 ? (
            <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Быстрый переход
            </p>
          ) : null}

          {results.map((item, index) => {
            const Icon = iconFor(item.type)
            const active = index === activeIndex
            return (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                data-index={index}
                disabled={!item.available}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => activate(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  active ? 'bg-primary-soft text-fg' : 'text-fg-muted hover:bg-surface-muted',
                  !item.available && 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface',
                    active && 'border-primary/30 text-primary',
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">{item.subtitle}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-subtle">
                  {typeLabels[item.type] ?? item.type}
                </span>
                {active ? <CornerDownLeft className="size-3 shrink-0 text-fg-subtle" /> : null}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-3">
            <span>↑↓ навигация</span>
            <span>↵ открыть</span>
          </span>
          <span>{isFetching ? 'ищем…' : debounced.length > 1 ? `найдено: ${results.length}` : 'Ctrl K'}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
