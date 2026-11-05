import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import {
  ActivityIndicator,
  Alert,
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

import type { ExerciseResponse, ExerciseSolutionResponse, TestRunResult } from '@shared/types'
import { validateCodeSize } from '@shared/validation'

import { api } from '@/api/endpoints'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { useSettingsStore } from '@/store/settings'
import { useSync } from '@/sync/sync-context'
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  ErrorState,
  ErrorText,
  Heading,
  Label,
  LoadingState,
  Row,
} from '@/ui/components'
import { Markdown } from '@/ui/markdown'
import { useTheme } from '@/ui/theme-context'

const SYMBOLS = ['\t', '{', '}', '(', ')', '[', ']', ':=', '==', '!=', '"', '`', '&', '|', '!', '+', '-', '*', '/', '\\', ',', '.', ':']

export default function ExerciseScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>()
  const id = String(exerciseId ?? '')
  const { online, sync } = useSync()
  const settings = useSettingsStore((state) => state.settings)

  const exercise = useCachedQuery<ExerciseResponse>(`exercise:${id}`, () => api.exercise(id), { ttl: 0 })
  const [code, setCode] = useState('')
  const [tab, setTab] = useState<'statement' | 'code'>('statement')
  const [result, setResult] = useState<TestRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hintIndex, setHintIndex] = useState(0)
  const [solution, setSolution] = useState<ExerciseSolutionResponse | null>(null)
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)
  const initialized = useRef(false)

  const detail = exercise.data?.exercise

  // Стартовый код и черновик: черновик важнее, чтобы не потерять правки.
  useEffect(() => {
    if (!detail || initialized.current) return
    initialized.current = true
    setCode(detail.starter_code)
    void api
      .getDraft(`exercise-${id}`)
      .then((draft) => {
        if (draft.draft?.code) setCode(draft.draft.code)
      })
      .catch(() => undefined)
  }, [detail, id])

  const submit = useCallback(async () => {
    const sizeError = validateCodeSize(code)
    if (sizeError) {
      setError(sizeError)
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const response = await api.submitExercise(id, code)
      setResult(response.result)
      void api.saveDraft(`exercise-${id}`, code).catch(() => undefined)
      if (response.solved) {
        Alert.alert('Задача решена', `Пройдено ${response.progress.best_passed} из ${response.progress.best_total} проверок.`)
      }
      await Promise.all([exercise.refresh(), sync()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось проверить решение')
    } finally {
      setRunning(false)
    }
  }, [code, exercise, id, sync])

  const showSolution = useCallback(async () => {
    try {
      const data = await api.exerciseSolution(id)
      setSolution(data)
      setTab('statement')
    } catch (err) {
      Alert.alert('Не удалось загрузить разбор', err instanceof Error ? err.message : 'Попробуйте позже')
    }
  }, [id])

  const fontSize = settings.editor_font_size

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={['top', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing(4),
          paddingVertical: theme.spacing(2),
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.fg} />
        </Pressable>
        <Badge tone={online ? 'neutral' : 'warning'}>{online ? 'онлайн' : 'офлайн'}</Badge>
      </View>

      {exercise.loading && !detail ? <LoadingState label="Загружаем задачу…" /> : null}
      {exercise.error && !detail ? (
        <View style={{ padding: theme.spacing(4) }}>
          <ErrorState message={exercise.error} onRetry={() => void exercise.refresh()} />
        </View>
      ) : null}

      {detail ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
          {/* Две вкладки вместо узкой колонки: условие и код не помещаются рядом. */}
          <View
            style={{
              flexDirection: 'row',
              marginHorizontal: theme.spacing(4),
              padding: 3,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceMuted,
            }}
          >
            {(['statement', 'code'] as const).map((value) => {
              const active = tab === value
              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(value)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: theme.radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? theme.colors.surface : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      color: active ? theme.colors.fg : theme.colors.fgMuted,
                      fontSize: theme.fontSize.sm,
                      fontWeight: active ? '700' : '500',
                    }}
                  >
                    {value === 'statement' ? 'Условие' : 'Код'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <ScrollView
            contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) }}
            keyboardShouldPersistTaps="handled"
          >
            {tab === 'statement' ? (
              <>
                <View style={{ gap: theme.spacing(1) }}>
                  <Label>
                    Модуль {detail.module_number} · {detail.module_title}
                  </Label>
                  <Heading>{detail.title}</Heading>
                  <Caption>{detail.summary}</Caption>
                  <Row gap={2}>
                    <Badge tone="primary">{detail.difficulty}</Badge>
                    <Badge tone="neutral">{detail.minutes} мин</Badge>
                    {detail.progress.solved ? <Badge tone="success">решена</Badge> : null}
                  </Row>
                </View>

                <Markdown markdown={detail.statement} />

                <Card>
                  <Heading level={3}>Проверки</Heading>
                  <Caption>Задача считается решённой, когда проходят все проверки.</Caption>
                  {detail.checks.map((check) => (
                    <Row key={check.name} gap={2} align="flex-start">
                      <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.fgSubtle} />
                      <Body style={{ flex: 1, fontSize: theme.fontSize.sm }}>{check.title}</Body>
                    </Row>
                  ))}
                </Card>

                {detail.hints.length > 0 ? (
                  <Card>
                    <Row justify="space-between">
                      <Heading level={3}>Подсказки</Heading>
                      <Caption>
                        {Math.min(hintIndex, detail.hints.length)} из {detail.hints.length}
                      </Caption>
                    </Row>
                    {detail.hints.slice(0, hintIndex).map((hint, index) => (
                      <Body key={index} style={{ fontSize: theme.fontSize.sm }}>
                        {index + 1}. {hint}
                      </Body>
                    ))}
                    {hintIndex < detail.hints.length ? (
                      <Button
                        title={hintIndex === 0 ? 'Показать подсказку' : 'Следующая подсказка'}
                        variant="secondary"
                        onPress={() => setHintIndex((value) => value + 1)}
                      />
                    ) : (
                      <Caption>Все подсказки открыты — теперь попробуйте сами.</Caption>
                    )}
                  </Card>
                ) : null}

                {detail.progress.solved ? (
                  <Card accent="success">
                    <Row justify="space-between">
                      <Body style={{ fontSize: theme.fontSize.sm }}>
                        Лучший результат: {detail.progress.best_passed} из {detail.progress.best_total}
                      </Body>
                      <Button title="Разбор" variant="secondary" onPress={() => void showSolution()} />
                    </Row>
                    {solution ? (
                      <View style={{ gap: theme.spacing(2) }}>
                        <Caption>{solution.note}</Caption>
                        <View
                          style={{
                            backgroundColor: theme.colors.surfaceMuted,
                            borderRadius: theme.radius.sm,
                            padding: theme.spacing(2.5),
                          }}
                        >
                          <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: theme.colors.fg }}>
                            {solution.solution}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </Card>
                ) : null}

                <Button title="Перейти к решению" onPress={() => setTab('code')} />
              </>
            ) : (
              <>
                <Row justify="space-between">
                  <Caption>Решение отправляется на сервер и проверяется тестами</Caption>
                  <Row gap={2}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Уменьшить шрифт"
                      onPress={() => void useSettingsStore.getState().update({ editor_font_size: Math.max(11, fontSize - 1) })}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="remove-circle-outline" size={20} color={theme.colors.fgMuted} />
                    </Pressable>
                    <Caption>{fontSize}</Caption>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Увеличить шрифт"
                      onPress={() => void useSettingsStore.getState().update({ editor_font_size: Math.min(22, fontSize + 1) })}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={theme.colors.fgMuted} />
                    </Pressable>
                  </Row>
                </Row>

                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={setCode}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textAlignVertical="top"
                  accessibilityLabel="Код решения"
                  style={{
                    minHeight: 320,
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
                        onPress={() => {
                          setCode((value) => value + symbol)
                          inputRef.current?.focus()
                        }}
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
                    <Button title="Проверить" onPress={() => void submit()} loading={running} disabled={!online} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Сброс"
                      variant="secondary"
                      onPress={() => setCode(detail.starter_code)}
                    />
                  </View>
                </Row>

                {!online ? <Caption>Проверка кода требует сети: тесты выполняются на сервере.</Caption> : null}
                {error ? <ErrorText>{error}</ErrorText> : null}

                {running ? (
                  <Card>
                    <Row gap={3}>
                      <ActivityIndicator color={theme.colors.primary} />
                      <Body style={{ fontSize: theme.fontSize.sm }}>Запускаем go test…</Body>
                    </Row>
                  </Card>
                ) : null}

                {result ? (
                  <Card accent={result.status === 'ok' ? 'success' : 'warning'}>
                    <Row justify="space-between">
                      <Heading level={3}>
                        {result.passed} из {result.total}
                      </Heading>
                      <Caption>{result.duration_ms} мс</Caption>
                    </Row>
                    {result.tests.map((test) => (
                      <Row key={test.name} gap={2} align="flex-start">
                        <Ionicons
                          name={test.passed ? 'checkmark-circle' : test.skipped ? 'ellipse-outline' : 'close-circle'}
                          size={16}
                          color={test.passed ? theme.colors.success : test.skipped ? theme.colors.fgSubtle : theme.colors.danger}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Body style={{ fontSize: theme.fontSize.sm }}>{test.title || test.name}</Body>
                          {test.output ? <Caption>{test.output}</Caption> : null}
                        </View>
                      </Row>
                    ))}
                    {result.stderr ? <Caption>{result.stderr}</Caption> : null}
                    {result.diagnostics?.length ? (
                      <View style={{ gap: 2 }}>
                        {result.diagnostics.map((diagnostic, index) => (
                          <Text key={index} style={{ color: theme.colors.danger, fontFamily: 'monospace', fontSize: 12 }}>
                            {diagnostic.line}:{diagnostic.column} {diagnostic.message}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {result.message ? <Caption>{result.message}</Caption> : null}
                  </Card>
                ) : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  )
}
