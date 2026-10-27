import { useMemo } from 'react'

import { cn, formatDuration } from '@/lib/utils'
import type { DayActivity } from '@/types'

/** Уровень активности 0–4, по которому выбирается оттенок клетки. */
function level(seconds: number) {
  if (seconds <= 0) return 0
  if (seconds < 300) return 1
  if (seconds < 900) return 2
  if (seconds < 1800) return 3
  return 4
}

const cellClasses = [
  'bg-surface-muted',
  'bg-primary/20',
  'bg-primary/40',
  'bg-primary/65',
  'bg-primary',
]

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function ActivityHeatmap({
  days,
  className,
  showLegend = true,
}: {
  days: DayActivity[]
  className?: string
  showLegend?: boolean
}) {
  const weeks = useMemo(() => {
    if (days.length === 0) return []
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const first = parseDate(sorted[0].date)
    const offset = (first.getDay() + 6) % 7 // приводим к понедельнику
    const cells: (DayActivity | null)[] = Array.from({ length: offset }, () => null)
    cells.push(...sorted)
    while (cells.length % 7 !== 0) cells.push(null)

    const result: (DayActivity | null)[][] = []
    for (let index = 0; index < cells.length; index += 7) {
      result.push(cells.slice(index, index + 7))
    }
    return result
  }, [days])

  const activeDays = days.filter((day) => day.study_seconds > 0).length
  const totalSeconds = days.reduce((sum, day) => sum + day.study_seconds, 0)

  if (weeks.length === 0) {
    return <p className="text-sm text-fg-muted">Пока нет данных об активности.</p>
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-2">
        <div className="flex flex-col gap-[3px] pt-px text-[9px] leading-[11px] text-fg-subtle">
          {['Пн', '', 'Ср', '', 'Пт', '', ''].map((label, index) => (
            <span key={index} className="h-[11px] w-4">
              {label}
            </span>
          ))}
        </div>
        <div className="flex-1 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-[3px]">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return <div key={dayIndex} className="size-[11px] rounded-[3px] opacity-0" />
                  }
                  const dayLevel = level(day.study_seconds)
                  const date = parseDate(day.date)
                  const formatted = new Intl.DateTimeFormat('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                  }).format(date)
                  const tooltip =
                    day.study_seconds > 0
                      ? `${formatted}: ${formatDuration(day.study_seconds)}`
                      : `${formatted}: без активности`
                  return (
                    <div
                      key={dayIndex}
                      title={tooltip}
                      className={cn(
                        'size-[11px] rounded-[3px] transition-colors',
                        cellClasses[dayLevel],
                        dayLevel === 0 && 'ring-1 ring-inset ring-line/60',
                      )}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-fg-subtle">
        <span>
          {activeDays > 0
            ? `${activeDays} активных дней · ${formatDuration(totalSeconds)} всего`
            : 'Активность появится после первого занятия'}
        </span>
        {showLegend ? (
          <span className="flex items-center gap-1.5">
            меньше
            {cellClasses.map((cellClass, index) => (
              <span key={index} className={cn('size-[10px] rounded-[2px]', cellClass)} />
            ))}
            больше
          </span>
        ) : null}
      </div>
    </div>
  )
}
