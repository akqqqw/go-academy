import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
  size = 'default',
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  ariaLabel: string
  size?: 'default' | 'sm'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex gap-0.5 rounded-lg border border-line bg-surface-inset p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors [&_svg]:size-3.5',
              size === 'default' ? 'h-7 px-2.5 text-[13px]' : 'h-6 px-2 text-xs',
              active
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
