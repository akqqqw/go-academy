import { BookOpen, FileText, History, ListChecks, Play, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelativeDate } from '@/lib/utils'
import type { RecentItem } from '@/types'

const icons = {
  lesson: BookOpen,
  note: FileText,
  exercise: ListChecks,
  quiz: Sparkles,
  run: Play,
  card: Sparkles,
} as const

export function RecentActivity({ items }: { items: RecentItem[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-fg-subtle" />
          Недавняя активность
        </CardTitle>
        <span className="text-[11px] text-fg-subtle">{items.length > 0 ? `${items.length} событий` : ''}</span>
      </CardHeader>
      <CardContent className="flex-1">
        {items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Пока пусто"
            description="Здесь появятся открытые уроки, заметки и решения задач — как только вы начнёте заниматься."
          />
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = icons[item.type as keyof typeof icons] ?? History
              return (
                <li key={`${item.type}-${item.id}`}>
                  <Link
                    to={item.route}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{item.title}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">{item.subtitle}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">
                      {formatRelativeDate(item.at)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
