import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { QuizDetail, QuizResult, QuizzesResponse } from '@shared/types'
import { formatRelativeDate, plural } from '@shared/utils'

import { api } from '@/api/endpoints'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { useSync } from '@/sync/sync-context'
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  ScreenHeader,
} from '@/ui/components'
import { useTheme } from '@/ui/theme-context'

export default function QuizzesScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { sync } = useSync()
  const quizzes = useCachedQuery<QuizzesResponse>('quizzes', api.quizzes, { ttl: 0 })

  const [quiz, setQuiz] = useState<QuizDetail['quiz'] | null>(null)
  const [detail, setDetail] = useState<QuizDetail | null>(null)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedQuiz, setFailedQuiz] = useState<string | null>(null)

  async function openQuiz(id: string) {
    setLoading(true)
    setError(null)
    setFailedQuiz(null)
    setResult(null)
    setAnswers({})
    try {
      const data = await api.quiz(id)
      setDetail(data)
      setQuiz(data.quiz)
    } catch (err) {
      setFailedQuiz(id)
      setError(err instanceof Error ? err.message : 'Не удалось открыть тест')
    } finally {
      setLoading(false)
    }
  }

  function closeQuiz() {
    setQuiz(null)
    setDetail(null)
    setResult(null)
    setAnswers({})
  }

  function toggleAnswer(questionId: string, optionId: string, multiple: boolean) {
    setAnswers((current) => {
      const selected = current[questionId] ?? []
      if (!multiple) return { ...current, [questionId]: [optionId] }
      return {
        ...current,
        [questionId]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      }
    })
  }

  async function submit() {
    if (!quiz) return
    setSubmitting(true)
    setError(null)
    try {
      const payload: Record<string, string | string[]> = {}
      for (const [questionId, selected] of Object.entries(answers)) {
        payload[questionId] = selected.length === 1 ? selected[0]! : selected
      }
      const response = await api.submitQuiz(quiz.id, payload)
      setResult(response)
      await Promise.all([quizzes.refresh(), sync()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить ответы')
    } finally {
      setSubmitting(false)
    }
  }

  const answered = Object.values(answers).filter((value) => value.length > 0).length
  const total = detail?.quiz.questions?.length ?? 0

  if (quiz && detail) {
    return (
      <Screen>
        <Row justify="space-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть тест"
            onPress={closeQuiz}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color={theme.colors.fg} />
          </Pressable>
          <Badge tone="primary">
            {answered}/{total}
          </Badge>
        </Row>
        <ScreenHeader title={quiz.title} subtitle={quiz.description} />
        <ProgressBar value={total > 0 ? (answered / total) * 100 : 0} />

        {result ? (
          <>
            <Card accent={result.passed ? 'success' : 'warning'}>
              <Heading level={2}>
                {result.score} из {result.total}
              </Heading>
              <Caption>
                {result.percent}% · {result.passed ? 'тест сдан' : `нужно ${quiz.pass_threshold}%`}
              </Caption>
            </Card>

            {result.questions.map((item) => {
              const question = detail.quiz.questions.find((q) => q.id === item.id)
              return (
                <Card key={item.id} accent={item.correct ? 'success' : 'danger'}>
                  <Row justify="space-between" align="flex-start">
                    <Body style={{ flex: 1, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
                      {item.prompt}
                    </Body>
                    <Ionicons
                      name={item.correct ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={item.correct ? theme.colors.success : theme.colors.danger}
                    />
                  </Row>
                  {question?.code ? (
                    <View style={{ backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.sm, padding: theme.spacing(2) }}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12, color: theme.colors.fg }}>
                        {question.code}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ gap: theme.spacing(1) }}>
                    <Caption>Ваш ответ: {item.given.join(', ') || '—'}</Caption>
                    <Caption>Верный ответ: {item.expected.join(', ')}</Caption>
                  </View>
                  {/* Объяснение — обязательная часть разбора, без него тест бесполезен. */}
                  <View
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: theme.colors.primary,
                      paddingLeft: theme.spacing(2),
                    }}
                  >
                    <Body style={{ fontSize: theme.fontSize.sm }}>{item.explanation}</Body>
                  </View>
                </Card>
              )
            })}

            <Button title="К списку тестов" onPress={closeQuiz} />
          </>
        ) : (
          <>
            {(detail.quiz.questions ?? []).map((question, index) => (
              <Card key={question.id}>
                <Caption>
                  Вопрос {index + 1} из {total}
                </Caption>
                <Body style={{ fontWeight: '600' }}>{question.prompt}</Body>
                {question.code ? (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfaceMuted,
                      borderRadius: theme.radius.sm,
                      padding: theme.spacing(2),
                    }}
                  >
                    <Text style={{ fontFamily: 'monospace', fontSize: 12, color: theme.colors.fg }}>
                      {question.code}
                    </Text>
                  </View>
                ) : null}
                <View style={{ gap: theme.spacing(2) }}>
                  {(question.options ?? []).map((option) => {
                    const selected = (answers[question.id] ?? []).includes(option.id)
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole={question.type === 'multiple' ? 'checkbox' : 'radio'}
                        accessibilityState={{ checked: selected }}
                        onPress={() => toggleAnswer(question.id, option.id, question.type === 'multiple')}
                        style={{
                          minHeight: 44,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.spacing(2),
                          borderRadius: theme.radius.md,
                          borderWidth: 1,
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? theme.colors.primarySoft : 'transparent',
                          paddingHorizontal: theme.spacing(3),
                          paddingVertical: theme.spacing(2),
                        }}
                      >
                        <Ionicons
                          name={
                            selected
                              ? question.type === 'multiple'
                                ? 'checkbox'
                                : 'radio-button-on'
                              : question.type === 'multiple'
                                ? 'square-outline'
                                : 'radio-button-off'
                          }
                          size={18}
                          color={selected ? theme.colors.primary : theme.colors.fgSubtle}
                        />
                        <Text style={{ flex: 1, color: theme.colors.fg, fontSize: theme.fontSize.sm }}>
                          {option.text}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </Card>
            ))}

            {error ? <Caption style={{ color: theme.colors.danger }}>{error}</Caption> : null}
            <Button
              title="Проверить ответы"
              onPress={() => void submit()}
              loading={submitting}
              disabled={answered === 0}
            />
            {answered < total ? (
              <Caption>
                Отвечено {answered} из {total}. Можно отправить и неполный набор — пропуски засчитаются как ошибки.
              </Caption>
            ) : null}
          </>
        )}
      </Screen>
    )
  }

  const stats = quizzes.data?.stats

  return (
    <Screen>
      <Row justify="space-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.fg} />
        </Pressable>
      </Row>

      <ScreenHeader
        title="Тесты"
        subtitle={
          stats
            ? `Тестов сдано ${stats.passed} · попыток ${stats.attempts} · средний ${stats.average}%`
            : 'Проверка знаний'
        }
      />

      {loading ? <LoadingState label="Открываем тест…" /> : null}
      {error && failedQuiz ? (
        <ErrorState message={error} onRetry={() => void openQuiz(failedQuiz)} />
      ) : null}

      {quizzes.loading && !quizzes.data ? <LoadingState label="Загружаем тесты…" /> : null}
      {quizzes.error && !quizzes.data ? (
        <ErrorState message={quizzes.error} onRetry={() => void quizzes.refresh()} />
      ) : null}

      {(quizzes.data?.quizzes ?? []).map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Открыть тест ${item.title}`}
          onPress={() => void openQuiz(item.id)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Card>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Caption>
                  Модуль {item.module} · {item.module_title}
                </Caption>
                <Heading level={3}>{item.title}</Heading>
                <Caption>{item.description}</Caption>
              </View>
              {item.progress.passed ? (
                <Badge tone="success">сдан</Badge>
              ) : item.progress.attempts > 0 ? (
                <Badge tone="warning">попытка</Badge>
              ) : (
                <Badge tone="neutral">новый</Badge>
              )}
            </Row>
            <Row justify="space-between">
              <Caption>
                {item.questions} {plural(item.questions, 'вопрос', 'вопроса', 'вопросов')} · порог{' '}
                {item.pass_threshold}%
              </Caption>
              <Caption>
                {item.progress.attempts > 0
                  ? `лучший ${item.progress.best_percent}%`
                  : 'нет попыток'}
              </Caption>
            </Row>
            {item.progress.last_at ? <Caption>последняя попытка {formatRelativeDate(item.progress.last_at)}</Caption> : null}
          </Card>
        </Pressable>
      ))}

      {quizzes.data && quizzes.data.quizzes.length === 0 ? (
        <Card>
          <Body>Тестов пока нет.</Body>
        </Card>
      ) : null}
    </Screen>
  )
}
