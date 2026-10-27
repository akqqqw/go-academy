import { Check, Copy } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

/** Идентификатор заголовка для оглавления и якорей. */
export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

export interface Heading {
  id: string
  text: string
  level: number
}

/** Достаёт заголовки второго и третьего уровня из Markdown. */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  let insideCode = false

  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      insideCode = !insideCode
      continue
    }
    if (insideCode) continue

    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim())
    if (!match) continue
    const text = match[2].replace(/[*_`]/g, '').trim()
    headings.push({ id: headingId(text), text, level: match[1].length })
  }
  return headings
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    const text = ref.current?.innerText ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="group relative my-4">
      <pre ref={ref} className={cn('hljs', className)}>
        {children}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Скопировано' : 'Скопировать код'}
        className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md border border-line bg-surface/90 px-2 text-[11px] text-fg-muted opacity-0 backdrop-blur transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? 'Готово' : 'Копировать'}
      </button>
    </div>
  )
}

/**
 * Рендерер учебного Markdown.
 *
 * Компонент мемоизирован: текст урока большой, а перерисовка происходит при
 * изменении состояния страницы (например, отметки «пройден»).
 */
export const MarkdownViewer = memo(function MarkdownViewer({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="mt-8 mb-3 scroll-mt-24 border-b border-line pb-2 text-xl font-semibold tracking-tight text-fg first:mt-0">
          {children}
        </h2>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => {
        const id = headingId(textOf(children))
        return (
          <h2
            id={id}
            className="group mt-9 mb-3 scroll-mt-24 border-b border-line pb-2 text-lg font-semibold tracking-tight text-fg first:mt-0"
          >
            {children}
          </h2>
        )
      },
      h3: ({ children }: { children?: React.ReactNode }) => {
        const id = headingId(textOf(children))
        return (
          <h3
            id={id}
            className="mt-6 mb-2 scroll-mt-24 text-[15px] font-semibold text-fg"
          >
            {children}
          </h3>
        )
      },
      h4: ({ children }: { children?: React.ReactNode }) => (
        <h4 className="mt-5 mb-1.5 text-[14px] font-semibold text-fg">{children}</h4>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="my-3.5 text-[14.5px] leading-[1.75] text-fg-muted">{children}</p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="my-3.5 list-disc space-y-1.5 pl-5 text-[14.5px] leading-[1.75] text-fg-muted marker:text-fg-subtle">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="my-3.5 list-decimal space-y-1.5 pl-5 text-[14.5px] leading-[1.75] text-fg-muted marker:text-fg-subtle">
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => <li className="pl-0.5">{children}</li>,
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-fg">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
          href={href}
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noreferrer noopener' : undefined}
          className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
          {children}
        </a>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-4 flex gap-3 rounded-r-lg border-l-2 border-primary/60 bg-primary-soft/40 py-2 pr-3 pl-4">
          <div className="min-w-0 [&>p]:my-1 [&>p]:text-[13.5px] [&>p]:text-fg">
            {children}
          </div>
        </div>
      ),
      hr: () => <hr className="my-8 border-line" />,
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[13px]">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-surface-muted text-left text-fg">{children}</thead>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="border-b border-line px-3 py-2 font-semibold">{children}</th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="border-b border-line/60 px-3 py-1.5 align-top text-fg-muted last:border-0">
          {children}
        </td>
      ),
      code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
        const isBlock = typeof className === 'string' && className.includes('language-')
        if (isBlock) {
          return (
            <code className={cn(className, 'text-[12.5px] leading-[1.65]')} {...props}>
              {children}
            </code>
          )
        }
        return (
          <code
            className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[0.86em] text-fg"
            {...props}
          >
            {children}
          </code>
        )
      },
      pre: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
        <CodeBlock className={className}>{children}</CodeBlock>
      ),
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img src={src} alt={alt ?? ''} className="my-4 max-w-full rounded-lg border border-line" />
      ),
    }),
    [],
  )

  return (
    <div className={cn('markdown-body max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components as never}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
})
