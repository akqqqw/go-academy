import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function LoadingState({ label = 'Загружаем данные…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5 text-sm text-fg-muted">
      <Loader2 className="size-4 animate-spin text-primary" />
      {label}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-5',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-danger">
        <AlertTriangle className="size-4" />
        Не удалось загрузить данные
      </div>
      <p className="text-sm leading-relaxed text-fg-muted">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
          <RefreshCw />
          Повторить
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: typeof Inbox
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface-muted text-fg-subtle">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? (
        <p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-3 w-full" />
      ))}
    </div>
  )
}
