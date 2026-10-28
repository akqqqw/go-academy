import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { ExercisePage } from '@/pages/exercise-page'
import {
  exerciseDetailFixture,
  exerciseSolutionFixture,
  exerciseSubmitFixture,
  runnerStatusFixture,
} from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

vi.mock('@/components/editor/code-editor', () => import('@/test/editor-mock'))

function baseRoutes() {
  return {
    '/api/editor/status': runnerStatusFixture,
    // Конкретные пути раньше общих: мок сравнивает по префиксу.
    '/api/exercises/sum-two/submit': exerciseSubmitFixture,
    '/api/exercises/sum-two/solution': exerciseSolutionFixture,
    '/api/exercises/sum-two': exerciseDetailFixture,
    // Черновика нет: редактор покажет стартовый код.
    '/api/drafts/exercise-sum-two': {
      __status: 404,
      body: { error: { code: 'draft_not_found', message: 'черновик не найден' } },
    },
  }
}

function renderExercise(exerciseId = 'sum-two') {
  return renderWithProviders(
    <Routes>
      <Route path="/practice/:exerciseId" element={<ExercisePage />} />
    </Routes>,
    { route: `/practice/${exerciseId}` },
  )
}

describe('ExercisePage', () => {
  it('показывает условие, проверки и стартовый код', async () => {
    mockFetch(baseRoutes())
    renderExercise()

    expect(await screen.findByRole('heading', { name: 'Сумма двух чисел', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/Напишите функцию/)).toBeInTheDocument()
    expect(screen.getByText('складывает положительные числа')).toBeInTheDocument()
    expect(screen.getByText('даёт ноль для противоположных чисел')).toBeInTheDocument()
    expect(screen.getByText('История попыток')).toBeInTheDocument()
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
    // Стартовый код из задания попал в редактор.
    await waitFor(() => {
      const value = (screen.getByLabelText('Редактор Go-кода') as HTMLTextAreaElement).value
      expect(value).toContain('func Sum(a, b int) int')
    })
  })

  it('проверяет решение тестами и показывает результат по каждой проверке', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(baseRoutes())
    renderExercise()

    const submitButton = await screen.findByRole('button', { name: /Проверить тестами/ })
    await user.click(submitButton)

    // Итог проверки: часть тестов упала, есть счётчик и вывод упавшего теста.
    expect(await screen.findByText('Не все проверки пройдены')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect((await screen.findAllByText(/ожидалось -8/)).length).toBeGreaterThan(0)

    const submitCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/exercises/sum-two/submit'),
    )
    expect(submitCall).toBeTruthy()
    const body = JSON.parse(String((submitCall?.[1] as RequestInit).body))
    expect(body.code).toContain('func Sum')

    // Клик по диагностике не падает: он переводит курсор в редактор.
    await user.click(screen.getByRole('button', { name: /main\.go:4/ }))
  })

  it('показывает подсказку по требованию и эталонное решение', async () => {
    const user = userEvent.setup()
    mockFetch(baseRoutes())
    renderExercise()

    expect(await screen.findByText('Подсказка 1')).toBeInTheDocument()
    expect(screen.queryByText('Сложение двух int работает напрямую.')).not.toBeInTheDocument()
    await user.click(screen.getByText('Подсказка 1'))
    expect(await screen.findByText('Сложение двух int работает напрямую.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Показать решение/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Эталонное решение')).toBeInTheDocument()
    await waitFor(() => expect(dialog.textContent).toContain('return a + b'))
  })

  it('сообщает о неизвестном задании', async () => {
    mockFetch({
      '/api/exercises/unknown': {
        __status: 404,
        body: { error: { code: 'exercise_not_found', message: 'задание не найдено' } },
      },
      '/api/editor/status': runnerStatusFixture,
    })
    renderExercise('unknown')

    expect(await screen.findByText(/Такого задания нет/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Все задания/ })).toHaveAttribute('href', '/practice')
  })
})
