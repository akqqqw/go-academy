import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'surface-pop fixed left-1/2 top-[12vh] z-50 w-[min(680px,94vw)] -translate-x-1/2',
          'animate-scale-in rounded-xl p-0 focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Закрыть"
            className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 border-b border-line px-5 py-4">{children}</div>
}

/**
 * ConfirmDialog — небольшое подтверждение вместо window.confirm.
 * Используется там, где действие необратимо (сброс кода, удаление черновика).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  destructive = false,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(420px,92vw)]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-fg">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-[12.5px] leading-relaxed text-fg-muted">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-[13px] text-fg transition-colors hover:bg-surface-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
            className={cn(
              'inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium text-white transition-colors',
              destructive ? 'bg-danger hover:bg-danger/90' : 'bg-primary text-primary-fg hover:bg-primary-hover',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
