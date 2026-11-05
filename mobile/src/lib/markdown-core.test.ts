import { describe, expect, it } from 'vitest'

import { parseMarkdown, splitInline } from './markdown-core'

describe('parseMarkdown', () => {
  it('делит текст на заголовки и абзацы', () => {
    const blocks = parseMarkdown('# Заголовок\n\nПервый абзац\nс переносом.\n\n## Второй')
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Заголовок' },
      { kind: 'paragraph', text: 'Первый абзац с переносом.' },
      { kind: 'heading', level: 2, text: 'Второй' },
    ])
  })

  it('выносит блок кода и сохраняет язык', () => {
    const blocks = parseMarkdown('```go\nfunc main() {}\n```')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({ kind: 'code', language: 'go', code: 'func main() {}' })
  })

  it('различает маркированный и нумерованный список', () => {
    const blocks = parseMarkdown('- раз\n- два\n\n1. один\n2. два')
    expect(blocks).toEqual([
      { kind: 'list', ordered: false, items: ['раз', 'два'] },
      { kind: 'list', ordered: true, items: ['один', 'два'] },
    ])
  })

  it('склеивает перенесённую строку списка с пунктом', () => {
    const blocks = parseMarkdown('- длинный пункт\n  продолжение')
    expect(blocks[0]).toEqual({ kind: 'list', ordered: false, items: ['длинный пункт продолжение'] })
  })

  it('распознаёт цитату', () => {
    const blocks = parseMarkdown('> важно\n> очень')
    expect(blocks[0]).toEqual({ kind: 'quote', text: 'важно очень' })
  })

  it('распознаёт таблицу и отбрасывает строку разделителя', () => {
    const blocks = parseMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(blocks[0]).toEqual({
      kind: 'table',
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
    })
  })

  it('распознаёт горизонтальную линию', () => {
    expect(parseMarkdown('---')[0]).toEqual({ kind: 'divider' })
  })

  it('переживает незакрытый блок кода', () => {
    const blocks = parseMarkdown('```go\nfmt.Println(1)')
    expect(blocks).toEqual([{ kind: 'code', language: 'go', code: 'fmt.Println(1)' }])
  })

  it('не падает на пустом тексте', () => {
    expect(parseMarkdown('')).toEqual([])
  })

  it('не считает заголовком решётку без пробела', () => {
    const blocks = parseMarkdown('#тег')
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: '#тег' })
  })
})

describe('splitInline', () => {
  it('размечает жирный, курсив, код и ссылку', () => {
    expect(splitInline('**жирный** и *курсив*, `code`, [ссылка](https://go.dev)')).toEqual([
      { kind: 'bold', text: 'жирный' },
      { kind: 'text', text: ' и ' },
      { kind: 'italic', text: 'курсив' },
      { kind: 'text', text: ', ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: ', ' },
      { kind: 'link', text: 'ссылка' },
    ])
  })

  it('оставляет обычный текст одним куском', () => {
    expect(splitInline('без разметки')).toEqual([{ kind: 'text', text: 'без разметки' }])
  })

  it('берёт текст ссылки, а не её url', () => {
    const parts = splitInline('[документация](https://pkg.go.dev/fmt)')
    expect(parts).toEqual([{ kind: 'link', text: 'документация' }])
  })
})
