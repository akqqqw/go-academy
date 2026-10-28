import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

export function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-surface-muted transition-colors',
        'data-[state=checked]:border-transparent data-[state=checked]:bg-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-fg-subtle shadow transition-transform',
          'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-primary-fg',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
