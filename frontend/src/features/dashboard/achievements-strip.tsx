import { ArrowRight, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn, plural } from '@/lib/utils'
import type { Achievement, Snapshot } from '@/types'

const TIER_STYLE: Record<Achievement['tier'], string> = {
  bronze: 'bg-warning-soft text-warning',
  silver: 'bg-surface-muted text-fg-muted',
  gold: 'bg-primary-soft text-primary',
}

/** Блок главной страницы: недавно открытые достижения и прогресс каталога. */
export function AchievementsStrip({
  achievements,
  snapshot,
}: {
  achievements: Achievement[]
  snapshot: Snapshot
}) {
  const stats = snapshot.insights?.achievements

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2.5">
        <CardTitle className="flex items-center gap-2 text-[13px]">
          <Trophy className="size-4 text-primary" />
          Достижения
          {stats ? (
            <Badge variant="primary">
              {stats.unlocked} из {stats.total}
            </Badge>
          ) : null}
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-7">
          <Link to="/achievements">
            Все достижения
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-2 pb-3">
        {stats ? (
          <div className="space-y-1">
            <Progress value={stats.total > 0 ? (stats.unlocked / stats.total) * 100 : 0} height={4} label="Прогресс достижений" />
            <p className="text-[11px] text-fg-subtle">
              Открыто {stats.unlocked} из {stats.total}{' '}
              {plural(stats.total, 'достижения', 'достижений', 'достижений')}
            </p>
          </div>
        ) : null}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {achievements.map((item) => (
            <li
              key={item.code}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-md',
                  TIER_STYLE[item.tier],
                )}
              >
                <Trophy className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-fg">{item.title}</p>
                <p className="truncate text-[10.5px] text-fg-subtle">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
