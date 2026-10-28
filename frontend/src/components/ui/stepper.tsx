import { Minus, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  ariaLabel,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  unit?: string
  ariaLabel: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-inset p-0.5">
      <button
        type="button"
        aria-label={`Уменьшить: ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <span
        aria-live="polite"
        className={cn('min-w-14 text-center text-[13px] font-medium tabular-nums text-fg')}
      >
        {value}
        {unit ? <span className="ml-1 text-fg-subtle">{unit}</span> : null}
      </span>
      <button
        type="button"
        aria-label={`Увеличить: ${ariaLabel}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
