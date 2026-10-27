import { cn } from '@/lib/utils'

export interface ProgressProps {
  value: number
  className?: string
  indicatorClassName?: string
  /** Толщина полосы в пикселях. */
  height?: number
  label?: string
}

export function Progress({ value, className, indicatorClassName, height = 6, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-surface-muted', className)}
      style={{ height }}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-500 ease-out',
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
