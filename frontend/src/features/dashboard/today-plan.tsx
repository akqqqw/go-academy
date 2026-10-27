import { Check, CircleDashed, Target } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ProgressRing } from '@/components/progress-ring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, plural } from '@/lib/utils'
import type { PlanItem, Snapshot } from '@/types'

function PlanRow({ item }: { item: PlanItem }) {
  const percent = item.target > 0 ? Math.min(100, (item.current / item.target) * 100) : 0
  const text =
    item.id === 'exercises'
      ? `${item.current} из ${item.target} ${plural(item.target, 'задачи', 'задач', 'задач')}`
      : item.id === 'cards'
        ? `${item.current} из ${item.target} ${plural(item.target, 'карточки', 'карточек', 'карточек')}`
        : item.id === 'lesson'
          ? item.done
            ? 'Урок открыт сегодня'
            : 'Ещё не открывали урок'
          : item.done
            ? 'Мини-тест пройден'
            : 'Тест не пройден'

  return (
    <Link
      to={item.route}
      className={cn(
        'group flex items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-line hover:bg-surface-muted/70',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
          item.done
            ? 'border-success/30 bg-success-soft text-success'
            : 'border-line-strong text-fg-subtle',
        )}
        aria-hidden
      >
        {item.done ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span
          className={cn(
            'block truncate text-[13px] font-medium',
            item.done ? 'text-fg-muted line-through decoration-line-strong' : 'text-fg',
          )}
        >
          {item.label}
        </span>
        <span className="block text-[11px] text-fg-subtle">{text}</span>
        {item.target > 1 ? (
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-muted">
            <span
              className={cn('block h-full rounded-full transition-all', item.done ? 'bg-success' : 'bg-primary/70')}
              style={{ width: `${percent}%` }}
            />
          </span>
        ) : null}
      </span>
    </Link>
  )
}

export function TodayPlan({ snapshot }: { snapshot: Snapshot }) {
  const minuteGoal = snapshot.goals.minutes
  const minutes = snapshot.study.today_minutes
  const percent = minuteGoal > 0 ? Math.min(100, (minutes / minuteGoal) * 100) : 0
  const completed = snapshot.plan.filter((item) => item.done).length

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            План на сегодня
          </CardTitle>
          <p className="text-[12px] text-fg-muted">
            Выполнено {completed} из {snapshot.plan.length}
          </p>
        </div>
        <ProgressRing value={percent} size={54} strokeWidth={5}>
          <span className="text-[11px] font-semibold tabular-nums text-fg">
            {Math.min(minutes, minuteGoal)}
            <span className="text-fg-subtle">/{minuteGoal}</span>
          </span>
        </ProgressRing>
      </CardHeader>
      <CardContent className="space-y-1">
        {snapshot.plan.map((item) => (
          <PlanRow key={item.id} item={item} />
        ))}
        <p className="pt-2 text-[11px] leading-relaxed text-fg-subtle">
          Цели можно изменить в настройках. Время учитывается, пока вкладка активна.
        </p>
      </CardContent>
    </Card>
  )
}
