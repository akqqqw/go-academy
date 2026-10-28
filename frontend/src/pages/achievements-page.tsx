import { Lock, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { cn, plural } from '@/lib/utils'
import { useAchievements } from '@/services/queries'
import type { Achievement, AchievementCategory, AchievementTier } from '@/types'

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  lessons: 'Уроки',
  practice: 'Практика',
  memory: 'Память',
  study: 'Привычка',
}

const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: 'бронза',
  silver: 'серебро',
  gold: 'золото',
}

const TIER_STYLE: Record<AchievementTier, string> = {
  bronze: 'border-warning/40 bg-warning-soft/50 text-warning',
  silver: 'border-line-strong bg-surface-muted text-fg-muted',
  gold: 'border-primary/40 bg-primary-soft text-primary',
}

type Filter = 'all' | AchievementCategory

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'lessons', label: 'Уроки' },
  { value: 'practice', label: 'Практика' },
  { value: 'memory', label: 'Память' },
  { value: 'study', label: 'Привычка' },
]

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function AchievementCard({ item }: { item: Achievement }) {
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-xl border p-3 transition-colors',
        item.unlocked
          ? 'border-primary/30 bg-surface shadow-card'
          : 'border-line bg-surface/70',
      )}
      aria-label={item.title}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg border',
            item.unlocked ? TIER_STYLE[item.tier] : 'border-line bg-surface-muted text-fg-subtle',
          )}
        >
          {item.unlocked ? <Trophy className="size-4" /> : <Lock className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{item.title}</p>
          <p className="text-[10.5px] text-fg-subtle">
            {CATEGORY_LABEL[item.category]} · {TIER_LABEL[item.tier]}
          </p>
        </div>
        {item.unlocked ? (
          <Badge variant="success">открыто</Badge>
        ) : (
          <span className="text-[10.5px] tabular-nums text-fg-subtle">{item.percent}%</span>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-fg-muted">{item.description}</p>

      <div className="mt-auto space-y-1">
        <Progress
          value={item.percent}
          height={4}
          indicatorClassName={item.unlocked ? 'bg-success' : undefined}
          label={`Прогресс достижения ${item.title}`}
        />
        <div className="flex items-center justify-between text-[10.5px] text-fg-subtle">
          <span className="tabular-nums">
            {Math.min(item.current, item.target)} / {item.target} {item.unit}
          </span>
          <span>
            {item.unlocked
              ? formatDate(item.unlocked_at)
              : `осталось ${item.remaining} ${item.unit}`}
          </span>
        </div>
      </div>
    </div>
  )
}

export function AchievementsPage() {
  const query = useAchievements()
  const [filter, setFilter] = useState<Filter>('all')

  const all = query.data?.achievements ?? []
  const stats = query.data?.stats

  const list = useMemo(
    () => (filter === 'all' ? all : all.filter((item) => item.category === filter)),
    [all, filter],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Мотивация"
        title="Достижения"
        description="Награды за уроки, задачи, повторения карточек, тесты и регулярность. Прогресс считается из данных аккаунта, без ручных отметок."
        actions={
          stats ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">
                <Trophy className="size-3" />
                {stats.unlocked} из {stats.total}
              </Badge>
              <Badge variant="outline">{stats.percent}%</Badge>
            </div>
          ) : null
        }
      />

      {query.isPending ? <LoadingState label="Считаем достижения…" /> : null}
      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : null}

      {stats ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Открыто', value: `${stats.unlocked} из ${stats.total}`, tile: 'всего' },
            { label: 'Бронза', value: stats.bronze, tile: 'bronze' },
            { label: 'Серебро', value: stats.silver, tile: 'silver' },
            { label: 'Золото', value: stats.gold, tile: 'gold' },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="flex items-center gap-3 pt-3.5 pb-3">
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-lg',
                    item.tile === 'gold'
                      ? 'bg-primary-soft text-primary'
                      : item.tile === 'silver'
                        ? 'bg-surface-muted text-fg-muted'
                        : item.tile === 'bronze'
                          ? 'bg-warning-soft text-warning'
                          : 'bg-success-soft text-success',
                  )}
                >
                  <Trophy className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{item.label}</p>
                  <p className="text-lg font-semibold tabular-nums text-fg">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {stats && stats.total > 0 ? (
        <div className="space-y-1.5">
          <Progress value={stats.percent} height={6} label="Все достижения" />
          <p className="text-[11px] text-fg-subtle">
            {stats.percent}% достижений открыто · осталось{' '}
            {plural(stats.total - stats.unlocked, 'достижение', 'достижения', 'достижений')}
          </p>
        </div>
      ) : null}

      <Segmented
        value={filter}
        options={FILTERS}
        onChange={setFilter}
        ariaLabel="Категория достижений"
        size="sm"
      />

      {query.data && list.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="В этой категории пока пусто"
          description="Выберите другую категорию или начните заниматься — достижения откроются автоматически."
        />
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((item) => (
          <AchievementCard key={item.code} item={item} />
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-3.5 pb-3 text-[12px] text-fg-muted">
          <span>Дальше можно посмотреть подробную статистику или вернуться к обучению.</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/progress">Статистика</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/learning">Продолжить обучение</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
