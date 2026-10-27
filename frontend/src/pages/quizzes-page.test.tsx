import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { QuizPage } from '@/pages/quiz-page'
import { QuizzesPage } from '@/pages/quizzes-page'
import {
  quizDetailFixture,
  quizFailedFixture,
  quizPassedFixture,
  quizzesFixture,
} from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

function quizRoutes(extra: Record<string, unknown> = {}) {
  return {
    '/api/quizzes/m01-basics/submit': quizPassedFixture,
    '/api/quizzes/m01-basics': quizDetailFixture,
    '/api/quizzes': quizzesFixture,
    ...extra,
  }
}

function renderQuizzes(routes: Record<string, unknown> = quizRoutes()) {
  const fetchMock = mockFetch(routes)
  const view = renderWithProviders(
    <Routes>
      <Route path="/quizzes" element={<QuizzesPage />} />
      <Route path="/quizzes/:quizId" element={<QuizPage />} />
    </Routes>,
    { route: '/quizzes' },
  )
  return { fetchMock, ...view }
}

function renderQuiz(routes: Record<string, unknown> = quizRoutes()) {
  const fetchMock = mockFetch(routes)
  const view = renderWithProviders(
    <Routes>
      <Route path="/quizzes" element={<QuizzesPage />} />
      <Route path="/quizzes/:quizId" element={<QuizPage />} />
    </Routes>,
    { route: '/quizzes/m01-basics' },
  )
  return { fetchMock, ...view }
}

describe('QuizzesPage', () => {
  it('показывает тесты, прогресс и последние попытки', async () => {
    renderQuizzes()

    expect((await screen.findAllByText('Модуль 1: основы языка')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Модуль 3: срезы и мапы').length).toBeGreaterThan(0)
    expect(screen.getByText('Итоговый тест: ядро языка')).toBeInTheDocument()
    // Сводка: сдан 1 тест из 3, лучший результат 100%.
    expect(screen.getByText(/Сдано тестов/)).toBeInTheDocument()
    expect(screen.getByText('1 из 3')).toBeInTheDocument()
    expect(screen.getByText('72%')).toBeInTheDocument()
    expect(screen.getByText('Последние попытки')).toBeInTheDocument()
    expect(screen.getByText('3/6 · 50%')).toBeInTheDocument()
  })

  it('ведёт на страницу прохождения теста', async () => {
    const user = userEvent.setup()
    renderQuizzes()

    const start = await screen.findByRole('link', { name: /Начать тест/ })
    await user.click(start)
    // Ссылка ведёт на маршрут викторины.
    expect(start).toHaveAttribute('href', '/quizzes/final-core')
  })

  it('перечитывает контент по кнопке', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderQuizzes(
      quizRoutes({ '/api/content/reload': { status: 'reloaded', quizzes: 6, questions: 38 } }),
    )

    await user.click(await screen.findByRole('button', { name: 'Перечитать контент' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((item) => String(item[0]).includes('/api/content/reload'))
      expect(call).toBeTruthy()
    })
  })
})

describe('QuizPage', () => {
  it('показывает вопросы разных типов и навигацию', async () => {
    renderQuiz()

    expect(
      await screen.findByText('С какой строки начинается исполняемая программа на Go?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Один ответ')).toBeInTheDocument()
    expect(screen.getByText('Вопрос 1 из 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Вопрос 3' })).toBeInTheDocument()
    expect(screen.getByText(/Прошлые попытки/)).toBeInTheDocument()

    // Переход по навигации к вопросу с несколькими ответами.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Вопрос 2' }))
    expect(screen.getByText('Несколько ответов')).toBeInTheDocument()
  })

  it('отправляет ответы и показывает разбор с объяснениями', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderQuiz()

    await user.click(await screen.findByRole('button', { name: /`package main`/ }))
    await user.click(screen.getByRole('button', { name: 'Вопрос 2' }))
    await user.click(screen.getByRole('button', { name: /Работает только внутри функций/ }))
    await user.click(screen.getByRole('button', { name: 'Вопрос 3' }))
    await user.click(screen.getByRole('button', { name: 'Верно' }))
    await user.click(screen.getByRole('button', { name: 'Вопрос 4' }))
    await user.type(screen.getByLabelText('Ответ на вопрос'), 'const')
    await user.click(screen.getByRole('button', { name: /Проверить ответы/ }))

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/submit') && init?.method === 'POST'
      })
      expect(submit).toBeTruthy()
      const body = JSON.parse(String(submit?.[1]?.body)) as {
        answers: Record<string, string[]>
        duration_ms: number
      }
      expect(body.answers['m01-q1']).toEqual(['a'])
      expect(body.answers['m01-q2']).toEqual(['a'])
      expect(body.answers['m01-q3']).toEqual(['true'])
      expect(body.answers['m01-q4']).toEqual(['const'])
      expect(typeof body.duration_ms).toBe('number')
    })

    expect(await screen.findByText(/Тест сдан/)).toBeInTheDocument()
    expect(screen.getByText('Разбор ответов · ошибок нет')).toBeInTheDocument()
    expect(screen.getAllByText('Верно: объяснение к вопросу.').length).toBe(5)
    expect(screen.getByRole('button', { name: /Пройти заново/ })).toBeInTheDocument()
  })

  it('показывает несданный результат и правильные ответы', async () => {
    const user = userEvent.setup()
    renderQuiz(quizRoutes({ '/api/quizzes/m01-basics/submit': quizFailedFixture }))

    await user.click(await screen.findByRole('button', { name: /`package app`/ }))
    await user.click(screen.getByRole('button', { name: /Проверить ответы/ }))

    expect(await screen.findByText(/Пока не сдано/)).toBeInTheDocument()
    expect(screen.getByText(/Пока не сдано · 20%/)).toBeInTheDocument()
    expect(screen.getByText(/ошибок 5/)).toBeInTheDocument()
    // Для вопроса с вводом правильный ответ — значение из accepted.
    expect(screen.getAllByText('Верно: a').length).toBe(4)
    expect(screen.getByText('Верно: const')).toBeInTheDocument()
  })

  it('сбрасывает ответы при повторном прохождении', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await user.click(await screen.findByRole('button', { name: /`package main`/ }))
    await user.click(screen.getByRole('button', { name: /Проверить ответы/ }))
    await screen.findByText(/Тест сдан/)

    await user.click(screen.getByRole('button', { name: /Пройти заново/ }))
    expect(await screen.findByText('Вопрос 1 из 5')).toBeInTheDocument()
    expect(screen.getByText(/отвечено 0 из 5/)).toBeInTheDocument()
  })

  it('не даёт отправить пустой тест', async () => {
    renderQuiz()

    const submit = await screen.findByRole('button', { name: /Проверить ответы/ })
    expect(submit).toBeDisabled()
  })

  it('показывает модуль, порог сдачи и типы вопросов', async () => {
    renderQuiz()

    expect(await screen.findByText(/Модуль 1 · Введение в Go/)).toBeInTheDocument()
    expect(screen.getByText(/порог 70%/)).toBeInTheDocument()
    expect(screen.getByText(/Вопросы разных типов/)).toBeInTheDocument()
    expect(screen.getByText(/Время учитывается автоматически/)).toBeInTheDocument()
  })
})
