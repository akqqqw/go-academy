// Разбор Markdown без React Native: чистые функции, которые можно покрыть
// unit-тестами. Отрисовка живёт отдельно в src/ui/markdown.tsx.

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'quote'; text: string }
  | { kind: 'divider' }
  | { kind: 'table'; rows: string[][] }

export type InlinePart = { kind: 'text' | 'bold' | 'italic' | 'code' | 'link'; text: string }

/** Разбирает Markdown на блоки. Инлайновая разметка обрабатывается при рендере. */
export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trimStart().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith('```')) {
        code.push(lines[index] ?? '')
        index += 1
      }
      index += 1
      blocks.push({ kind: 'code', language, code: code.join('\n') })
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line)
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1]!.length as 1 | 2 | 3,
        text: headingMatch[2]!.trim(),
      })
      index += 1
      continue
    }

    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(line.trim())) {
      blocks.push({ kind: 'divider' })
      index += 1
      continue
    }

    if (line.trimStart().startsWith('>')) {
      const quote: string[] = []
      while (index < lines.length && (lines[index] ?? '').trimStart().startsWith('>')) {
        quote.push((lines[index] ?? '').replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ kind: 'quote', text: quote.join(' ').trim() })
      continue
    }

    if (line.includes('|') && /^\s*\|?[\s:-]+\|/.test(lines[index + 1] ?? '')) {
      const rows: string[][] = [splitRow(line)]
      index += 2
      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        rows.push(splitRow(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ kind: 'table', rows })
      continue
    }

    const listMatch = /^(\s*)([-*+]|\d+\.)\s+/.exec(line)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2] ?? '')
      const items: string[] = []
      while (index < lines.length) {
        const current = lines[index] ?? ''
        const match = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(current)
        if (match) {
          items.push(match[3]!.trim())
          index += 1
          continue
        }
        if (current.startsWith('  ') && current.trim() && items.length > 0) {
          items[items.length - 1] = `${items[items.length - 1]} ${current.trim()}`
          index += 1
          continue
        }
        break
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      if (
        !current.trim() ||
        current.trimStart().startsWith('```') ||
        /^#{1,3}\s/.test(current) ||
        current.trimStart().startsWith('>') ||
        /^(\s*)([-*+]|\d+\.)\s+/.test(current)
      ) {
        break
      }
      paragraph.push(current.trim())
      index += 1
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    }
  }

  return blocks
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** Инлайновая разметка: **жирный**, *курсив*, `код`, [ссылка](url). */
export function splitInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, match.index) })
    }
    const token = match[0]
    if (token.startsWith('`')) parts.push({ kind: 'code', text: token.slice(1, -1) })
    else if (token.startsWith('**')) parts.push({ kind: 'bold', text: token.slice(2, -2) })
    else if (token.startsWith('*')) parts.push({ kind: 'italic', text: token.slice(1, -1) })
    else {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)
      parts.push({ kind: 'link', text: linkMatch?.[1] ?? token })
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) parts.push({ kind: 'text', text: text.slice(lastIndex) })
  return parts
}
