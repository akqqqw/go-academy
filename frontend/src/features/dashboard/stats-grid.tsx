import { studySummary } from '@shared/learning'
import { CheckCircle2, Clock3, Flame, Layers, ListChecks } from 'lucide-react'

import { StatTile } from '@/components/stat-tile'
import { formatDuration } from '@/lib/utils'
import type { Snapshot } from '@/types'

/**
 * Плитки статистики. Все подписи и полосы берутся из одного объекта snapshot:
 * раньше «из N» приходило из totals (контент), а прогресс — из snapshot, и при
 * расхождении источников цифры на плитке противоречили друг другу.
 */
export function StatsGrid({ snapshot }: { snapshot: Snapshot }) {
  const lessons = snapshot.lessons
  const exercises = snapshot.exercises
  const cards = snapshot.cards
  const study = snapshot.study
  const summary = studySummary(snapshot)

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={CheckCircle2}
        label="Уроки"
        value={`${lessons.completed}`}
        hint={`из ${lessons.total}`}
        accent="primary"
        progress={lessons.percent}
        className="animate-fade-up"
      />
      <StatTile
        icon={ListChecks}
        label="Задачи"
        value={`${exercises.solved}`}
        hint={exercises.total > 0 ? `из ${exercises.total}` : 'скоро'}
        accent="success"
        progress={exercises.total > 0 ? exercises.percent : 0}
        className="animate-fade-up stagger-1"
      />
      <StatTile
        icon={Layers}
        label="Карточки"
        value={`${cards.reviewed}`}
        hint={cards.total > 0 ? `из ${cards.total}` : 'скоро'}
        accent="violet"
        progress={cards.total > 0 ? cards.percent : 0}
        className="animate-fade-up stagger-2"
      />
      <StatTile
        icon={Clock3}
        label="Время обучения"
        value={study.total_minutes > 0 ? formatDuration(study.total_seconds) : '0 мин'}
        hint={`за сегодня ${summary.todayMinutes} мин`}
        accent="warning"
        progress={summary.goalPercent}
        className="animate-fade-up stagger-3"
      />
      <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card lg:col-span-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-warning-soft text-warning">
            <Flame className="size-4" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-fg">
              Серия: {snapshot.streak.current} дн. подряд
            </p>
            <p className="text-[11px] text-fg-subtle">
              {snapshot.streak.today_active
                ? 'Сегодняшний день уже засчитан'
                : 'Позанимайтесь сегодня, чтобы продлить серию'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-fg-subtle">Рекорд</p>
          <p className="text-sm font-semibold tabular-nums text-fg">{snapshot.streak.longest} дн.</p>
        </div>
      </div>
    </div>
  )
}
