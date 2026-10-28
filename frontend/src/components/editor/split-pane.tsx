import { GripVertical } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
  /** Начальная доля левой панели (0–1). */
  initialRatio?: number
  minRatio?: number
  maxRatio?: number
  /** Ключ для сохранения положения разделителя между визитами. */
  storageKey?: string
  className?: string
  leftLabel?: string
  rightLabel?: string
}

const STORAGE_PREFIX = 'goacademy-split-'

function readRatio(storageKey?: string, fallback = 0.5) {
  if (!storageKey) return fallback
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return fallback
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * SplitPane — две области с перетаскиваемым разделителем.
 *
 * Разделитель можно тянуть мышью или стрелками клавиатуры (role="separator"),
 * положение запоминается в localStorage. На узких экранах панели складываются
 * вертикально, и ручка прячется.
 */
export function SplitPane({
  left,
  right,
  initialRatio = 0.5,
  minRatio = 0.25,
  maxRatio = 0.75,
  storageKey,
  className,
  leftLabel = 'Левая панель',
  rightLabel = 'Правая панель',
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(() => readRatio(storageKey, initialRatio))
  const [dragging, setDragging] = useState(false)

  const clamp = useCallback(
    (value: number) => Math.min(maxRatio, Math.max(minRatio, value)),
    [minRatio, maxRatio],
  )

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, String(ratio))
    } catch {
      // Приватный режим: положение просто не запомнится.
    }
  }, [ratio, storageKey])

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      setRatio(clamp((event.clientX - rect.left) / rect.width))
    }
    const onUp = () => setDragging(false)

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [clamp, dragging])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setRatio((value) => clamp(value - step))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setRatio((value) => clamp(value + step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setRatio(clamp(initialRatio))
    }
  }

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-3 lg:flex-row lg:gap-0', className)}>
      <section
        aria-label={leftLabel}
        className="min-w-0 lg:overflow-y-auto"
        style={{ flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 1 }}
      >
        {left}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Разделитель теории и редактора"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(minRatio * 100)}
        aria-valuemax={Math.round(maxRatio * 100)}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDoubleClick={() => setRatio(clamp(initialRatio))}
        onKeyDown={onKeyDown}
        className={cn(
          'group relative hidden shrink-0 cursor-col-resize items-center justify-center lg:flex',
          'w-2.5 outline-none',
        )}
        title="Потяните, чтобы изменить ширину. Двойной клик — сброс."
      >
        <span
          className={cn(
            'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors',
            dragging ? 'bg-primary' : 'bg-line group-hover:bg-line-strong group-focus-visible:bg-primary',
          )}
        />
        <span
          className={cn(
            'relative z-10 grid h-10 w-2.5 place-items-center rounded-full border border-line bg-surface text-fg-subtle opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-visible:opacity-100',
            dragging && 'opacity-100',
          )}
        >
          <GripVertical className="size-2.5" />
        </span>
      </div>

      <section
        aria-label={rightLabel}
        className="min-w-0 lg:overflow-hidden"
        style={{ flexBasis: `${(1 - ratio) * 100}%`, flexGrow: 0, flexShrink: 1 }}
      >
        {right}
      </section>
    </div>
  )
}
