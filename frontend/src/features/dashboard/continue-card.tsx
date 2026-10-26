import { ArrowRight, BookOpen, Clock3, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatMinutes, plural } from '@/lib/utils'
import type { ContinueCard as ContinueCardData } from '@/types'

const statusLabel: Record<string, { label: string; variant: 'primary' | 'success' | 'default' }> = {
  in_progress: { label: 'В процессе', variant: 'primary' },
  completed: { label: 'Пройден', variant: 'success' },
  not_started: { label: 'Ещё не начат', variant: 'default' },
}

export function ContinueCard({ data }: { data: ContinueCardData }) {
  const status = statusLabel[data.lesson_status] ?? statusLabel.not_started
  const cta = data.lesson_status === 'completed' ? 'Повторить урок' : 'Продолжить'

  return (
    <section className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-4 top-2 select-none font-mono text-[92px] font-bold leading-none text-primary/5"
      >
        {String(data.module_number).padStart(2, '0')}
      </div>

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary" className="gap-1">
            <Layers className="size-3" />
            Модуль {data.module_number} · {data.module_title}
          </Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            Продолжить обучение · урок {data.lesson_number}
          </p>
          <h2 className="text-balance text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            {data.lesson_title}
          </h2>
          <p className="flex items-center gap-3 text-[12px] text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {formatMinutes(data.minutes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3.5" />
              {data.module_stat.completed} из {data.module_stat.total}{' '}
              {plural(data.module_stat.total, 'урока', 'уроков', 'уроков')} модуля
            </span>
          </p>
        </div>

        <div className="max-w-md space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Прогресс модуля</span>
            <span className="font-medium tabular-nums text-fg-muted">{data.module_stat.percent}%</span>
          </div>
          <Progress value={data.module_stat.percent} height={5} label="Прогресс модуля" />
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-2">
        <Button asChild size="lg">
          <Link to={data.route}>
            {cta}
            <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to="/learning">Программа курса</Link>
        </Button>
      </div>
    </section>
  )
}
