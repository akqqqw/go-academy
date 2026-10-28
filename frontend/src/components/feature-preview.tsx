import type { LucideIcon } from 'lucide-react'
import { ArrowRight, BookOpen, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface FeatureItem {
  icon: LucideIcon
  title: string
  text: string
}

export function FeaturePreview({
  eyebrow,
  title,
  description,
  icon: Icon,
  stage,
  stageLabel,
  items,
  status,
  note,
  warning,
}: {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  stage: number
  stageLabel: string
  items: FeatureItem[]
  status: ReactNode
  note: ReactNode
  warning?: ReactNode
}) {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="border-b border-line">
            <CardTitle className="flex items-center gap-2">
              <Icon className="size-4 text-primary" />
              Что появится в этом разделе
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.title}
                className="flex gap-2.5 rounded-lg border border-line bg-surface-inset p-3"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                  <item.icon className="size-3.5" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[12px] font-medium text-fg">{item.title}</p>
                  <p className="text-[11px] leading-relaxed text-fg-muted">{item.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Текущий статус</CardTitle>
              <Badge variant="warning">этап {stage}</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px] leading-relaxed text-fg-muted">
              <p className="text-fg">{stageLabel}</p>
              {status}
            </CardContent>
          </Card>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-fg">
              <Info className="size-3.5 text-fg-subtle" />
              Как устроена разработка
            </p>
            <p className="text-[12px] leading-relaxed text-fg-muted">{note}</p>
          </div>

          {warning ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-4 text-[12px] leading-relaxed text-fg-muted">
              {warning}
            </div>
          ) : null}

          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link to="/learning">
              <BookOpen />
              Открыть программу курса
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
