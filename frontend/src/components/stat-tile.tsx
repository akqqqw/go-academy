import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

const accents = {
  primary: 'text-primary bg-primary-soft',
  success: 'text-success bg-success-soft',
  warning: 'text-warning bg-warning-soft',
  violet: 'text-violet bg-violet-soft',
  danger: 'text-danger bg-danger-soft',
  neutral: 'text-fg-muted bg-surface-muted',
} as const

export type StatAccent = keyof typeof accents

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'neutral',
  progress,
  className,
  footer,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: StatAccent
  progress?: number
  className?: string
  footer?: ReactNode
}) {
  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium uppercase tracking-wide text-fg-subtle">
          {label}
        </span>
        <span className={cn('grid size-7 place-items-center rounded-md', accents[accent])}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-fg sm:text-2xl">
          {value}
        </span>
        {hint ? <span className="truncate text-xs text-fg-subtle">{hint}</span> : null}
      </div>
      {typeof progress === 'number' ? (
        <Progress value={progress} height={4} label={label} />
      ) : null}
      {footer}
    </div>
  )
}
