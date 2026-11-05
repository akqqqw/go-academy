// Лёгкий рендерер Markdown для мобильного экрана урока.
//
// Внешняя библиотека не используется: уроки приходят из того же каталога
// content/, что и в web, и нам нужны только заголовки, абзацы, списки, блоки
// кода, цитаты и таблицы. Свой парсер даёт предсказуемую вёрстку под узкий
// экран, работает офлайн и не тянет лишние зависимости в бандл. Сам разбор
// вынесен в src/lib/markdown-core.ts и покрыт unit-тестами.
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { parseMarkdown, splitInline } from '@/lib/markdown-core'
import { useTheme } from '@/ui/theme-context'

/** Инлайновая разметка: **жирный**, *курсив*, `код`, [ссылка](url). */
function Inline({ text, color }: { text: string; color?: string }) {
  const theme = useTheme()
  const parts = useMemo(() => splitInline(text), [text])

  return (
    <Text
      style={{
        color: color ?? theme.colors.fg,
        fontSize: theme.fontSize.md,
        lineHeight: theme.fontSize.md * 1.6,
      }}
    >
      {parts.map((part, index) => {
        if (part.kind === 'code') {
          return (
            <Text
              key={index}
              style={{
                fontFamily: 'monospace',
                backgroundColor: theme.colors.surfaceMuted,
                color: theme.colors.primary,
              }}
            >
              {' '}
              {part.text}{' '}
            </Text>
          )
        }
        if (part.kind === 'bold') {
          return (
            <Text key={index} style={{ fontWeight: '700' }}>
              {part.text}
            </Text>
          )
        }
        if (part.kind === 'italic') {
          return (
            <Text key={index} style={{ fontStyle: 'italic' }}>
              {part.text}
            </Text>
          )
        }
        if (part.kind === 'link') {
          return (
            <Text key={index} style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}>
              {part.text}
            </Text>
          )
        }
        return <Text key={index}>{part.text}</Text>
      })}
    </Text>
  )
}

/** Отрисовывает Markdown блоками с нативной типографикой. */
export function Markdown({ markdown }: { markdown: string }) {
  const theme = useTheme()
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown])

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            const size =
              block.level === 1 ? theme.fontSize.xl : block.level === 2 ? theme.fontSize.lg : theme.fontSize.md
            return (
              <Text
                key={index}
                accessibilityRole="header"
                style={{
                  color: theme.colors.fg,
                  fontSize: size,
                  fontWeight: '700',
                  marginTop: theme.spacing(2),
                }}
              >
                {block.text}
              </Text>
            )
          }
          case 'paragraph':
            return <Inline key={index} text={block.text} />
          case 'list':
            return (
              <View key={index} style={{ gap: theme.spacing(1.5) }}>
                {block.items.map((item, itemIndex) => (
                  <View key={itemIndex} style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                    <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.md }}>
                      {block.ordered ? `${itemIndex + 1}.` : '•'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Inline text={item} />
                    </View>
                  </View>
                ))}
              </View>
            )
          case 'code':
            return (
              <View
                key={index}
                style={{
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.radius.md,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                  padding: theme.spacing(3),
                  gap: theme.spacing(2),
                }}
              >
                {block.language ? (
                  <Text style={{ color: theme.colors.fgSubtle, fontSize: theme.fontSize.xs }}>
                    {block.language}
                  </Text>
                ) : null}
                <Text
                  selectable
                  style={{
                    color: theme.colors.fg,
                    fontFamily: 'monospace',
                    fontSize: theme.fontSize.sm,
                    lineHeight: theme.fontSize.sm * 1.6,
                  }}
                >
                  {block.code}
                </Text>
              </View>
            )
          case 'quote':
            return (
              <View
                key={index}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: theme.colors.primary,
                  paddingLeft: theme.spacing(3),
                }}
              >
                <Inline text={block.text} color={theme.colors.fgMuted} />
              </View>
            )
          case 'divider':
            return (
              <View
                key={index}
                style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }}
              />
            )
          case 'table':
            return (
              <View
                key={index}
                style={{
                  borderRadius: theme.radius.md,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                  overflow: 'hidden',
                }}
              >
                {block.rows.map((row, rowIndex) => (
                  <View
                    key={rowIndex}
                    style={{
                      flexDirection: 'row',
                      backgroundColor: rowIndex === 0 ? theme.colors.surfaceMuted : 'transparent',
                    }}
                  >
                    {row.map((cell, cellIndex) => (
                      <View key={cellIndex} style={{ flex: 1, padding: theme.spacing(2) }}>
                        <Text
                          style={{
                            color: rowIndex === 0 ? theme.colors.fgMuted : theme.colors.fg,
                            fontSize: theme.fontSize.xs,
                            fontWeight: rowIndex === 0 ? '700' : '400',
                          }}
                        >
                          {cell}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )
          default:
            return null
        }
      })}
    </View>
  )
}
