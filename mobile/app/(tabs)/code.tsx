import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { RunResult, RunnerStatusResponse } from '@shared/types'
import { validateCodeSize } from '@shared/validation'

import { api } from '@/api/endpoints'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { useSettingsStore } from '@/store/settings'
import { useSync } from '@/sync/sync-context'
import { Badge, Body, Button, Caption, Card, ErrorText, Row, Screen, ScreenHeader } from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

const SAMPLE = `package main

import "fmt"

func main() {
\tfor i := 1; i <= 3; i++ {
\t\tfmt.Println("шаг", i)
\t}
}
`

/** Символы, которых нет на мобильной клавиатуре Go-разработчика. */
const SYMBOLS = ['\t', '{', '}', '(', ')', '[', ']', ':=', ':=', '<-', '"', "'", '`', '+', '*', '&', '|', '!', '=', '<', '>', '%', '/', '\\']

/**
 * Мобильный экран кода.
 *
 * Редактор собран на TextInput с моноширинным шрифтом и панелью символов:
 * Monaco в WebView на телефоне неудобен (клавиатура перекрывает код, 3+ МБ
 * JS). Запуск и проверка идут через тот же `/api/editor/*`, что и в web, —
 * логика и результат одинаковые.
 */
export default function CodeScreen() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ lesson?: string }>()
  const lessonId = typeof params.lesson === 'string' ? params.lesson : ''
  const draftKey = lessonId ? `lesson-${lessonId}` : 'editor'
  const { online } = useSync()

  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.update)
  const runnerStatus = useCachedQuery<RunnerStatusResponse>('runner-status', api.runnerStatus, { ttl: 0 })

  const [code, setCode] = useState(SAMPLE)
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)
  const dirty = useRef(false)

  const fontSize = settings.editor_font_size
  const runnerAvailable = runnerStatus.data?.runner.available ?? true

  // Черновик из аккаунта: продолжение с любого устройства.
  useEffect(() => {
    let cancelled = false
    void api
      .getDraft(draftKey)
      .then((draft) => {
        if (!cancelled && draft.draft?.code && !dirty.current) {
          setCode(draft.draft.code)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [draftKey])

  useEffect(() => {
    if (!settings.code_autosave || !dirty.current) return
    const timer = setTimeout(() => void saveDraft(code, true), 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сохраняем по изменению кода
  }, [code, settings.code_autosave])

  const saveDraft = useCallback(
    async (value: string, silent = false) => {
      if (!silent) setSaving(true)
      try {
        await api.saveDraft(draftKey, value)
        if (!silent) setMessage('Черновик сохранён в аккаунте')
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Не удалось сохранить черновик')
        }
      } finally {
        if (!silent) setSaving(false)
      }
    },
    [draftKey],
  )

  const run = useCallback(async () => {
    const sizeError = validateCodeSize(code)
    if (sizeError) {
      setError(sizeError)
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const response = await api.runCode(code, lessonId ? 'lesson' : 'editor', lessonId)
      setResult(response)
      if (settings.code_autosave) void saveDraft(code, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить код')
    } finally {
      setRunning(false)
    }
  }, [code, lessonId, saveDraft, settings.code_autosave])

  const insert = useCallback((token: string) => {
    dirty.current = true
    setCode((value) => value + token)
    inputRef.current?.focus()
  }, [])

  const status = useMemo(() => {
    if (!online) return { tone: 'warning' as const, text: 'нет сети' }
    if (!runnerAvailable) return { tone: 'danger' as const, text: 'Go недоступен' }
    return { tone: 'success' as const, text: 'Go готов' }
  }, [online, runnerAvailable])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) }}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="Код"
            subtitle={lessonId ? `Задание урока ${lessonId}` : 'Свободный редактор'}
            right={<Badge tone={status.tone}>{status.text}</Badge>}
          />

          {runnerStatus.data && !runnerStatus.data.runner.available ? (
            <Card accent="warning">
              <Body style={{ fontSize: theme.fontSize.sm }}>
                Go-тулчейн недоступен на сервере: запуск и проверка кода не работают. Остальные разделы
                приложения продолжают работать.
              </Body>
              <Caption>{runnerStatus.data.runner.warning || 'Запуск кода недоступен в этом окружении.'}</Caption>
            </Card>
          ) : null}

          <Card style={{ gap: theme.spacing(2) }}>
            <Row justify="space-between">
              <Caption>{lessonId ? `lesson-${lessonId}` : 'editor'} · черновик в аккаунте</Caption>
              <Row gap={2}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Уменьшить шрифт"
                  onPress={() => void updateSettings({ editor_font_size: Math.max(11, fontSize - 1) })}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="remove-circle-outline" size={20} color={theme.colors.fgMuted} />
                </Pressable>
                <Caption>{fontSize}</Caption>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Увеличить шрифт"
                  onPress={() => void updateSettings({ editor_font_size: Math.min(22, fontSize + 1) })}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={theme.colors.fgMuted} />
                </Pressable>
              </Row>
            </Row>

            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(value) => {
                dirty.current = true
                setCode(value)
              }}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textAlignVertical="top"
              accessibilityLabel="Код Go"
              style={{
                minHeight: 280,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceMuted,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                color: theme.colors.fg,
                fontFamily: 'monospace',
                fontSize,
                lineHeight: fontSize * 1.55,
                padding: theme.spacing(3),
              }}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
              <Row gap={2}>
                {SYMBOLS.map((symbol, index) => (
                  <Pressable
                    key={`${symbol}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Вставить ${symbol === '\t' ? 'табуляцию' : symbol}`}
                    onPress={() => insert(symbol)}
                    style={{
                      minWidth: 44,
                      minHeight: 40,
                      paddingHorizontal: theme.spacing(2),
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.colors.surface,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: theme.colors.fg, fontFamily: 'monospace', fontSize: 15 }}>
                      {symbol === '\t' ? '⇥' : symbol}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </ScrollView>

            <Row gap={3}>
              <View style={{ flex: 1 }}>
                <Button title="Запустить" onPress={() => void run()} loading={running} disabled={!online} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Сохранить" variant="secondary" onPress={() => void saveDraft(code)} loading={saving} />
              </View>
            </Row>

            <Row gap={3}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Формат"
                  variant="ghost"
                  onPress={() =>
                    void api
                      .formatCode(code)
                      .then((response) => {
                        setCode(response.code)
                        setMessage('Код отформатирован')
                      })
                      .catch((err: Error) => setError(err.message))
                  }
                  disabled={!online || !runnerAvailable}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Сброс"
                  variant="ghost"
                  onPress={() => {
                    setCode(SAMPLE)
                    setResult(null)
                    setMessage('Редактор сброшен к примеру')
                  }}
                />
              </View>
            </Row>

            {message ? <Caption>{message}</Caption> : null}
            {error ? <ErrorText>{error}</ErrorText> : null}
          </Card>

          {(running || result) && (
            <Card>
              <Row justify="space-between">
                <Body style={{ fontWeight: '600' }}>
                  {result ? (result.status === 'ok' ? 'Выполнено' : 'Ошибка') : 'Выполняем…'}
                </Body>
                {result ? <Caption>{result.duration_ms} мс</Caption> : <ActivityIndicator color={theme.colors.primary} />}
              </Row>

              {result?.stdout ? (
                <Console title="stdout" text={result.stdout} tone="neutral" />
              ) : null}
              {result?.stderr ? <Console title="stderr" text={result.stderr} tone="danger" /> : null}
              {result?.diagnostics?.length ? (
                <View style={{ gap: theme.spacing(1) }}>
                  {result.diagnostics.map((diagnostic, index) => (
                    <View key={index}>
                      <Text style={{ color: theme.colors.danger, fontFamily: 'monospace', fontSize: 12 }}>
                        {diagnostic.line}:{diagnostic.column} {diagnostic.message}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {result && !result.stdout && !result.stderr && !result.diagnostics?.length ? (
                <Caption>Программа ничего не вывела.</Caption>
              ) : null}
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Console({ title, text, tone }: { title: string; text: string; tone: 'neutral' | 'danger' }) {
  const theme = useTheme()
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Caption>{title}</Caption>
      <View
        style={{
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.sm,
          padding: theme.spacing(2.5),
        }}
      >
        <Text
          selectable
          style={{
            color: tone === 'danger' ? theme.colors.danger : theme.colors.fg,
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  )
}
