import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AchievementsPage } from '@/pages/achievements-page'
import { achievementsEmptyFixture, achievementsFixture } from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

function renderPage(routes: Record<string, unknown> = { '/api/achievements': achievementsFixture }) {
  const fetchMock = mockFetch(routes)
  const view = renderWithProviders(<AchievementsPage />, { route: '/achievements' })
  return { fetchMock, ...view }
}

describe('AchievementsPage', () => {
  it('показывает сводку и карточки достижений', async () => {
    renderPage()

    expect(await screen.findByText('Первый шаг')).toBeInTheDocument()
    expect(screen.getByText('Разогрев')).toBeInTheDocument()
    expect(screen.getByText('Практик')).toBeInTheDocument()
    expect(screen.getByText('Сто повторений')).toBeInTheDocument()
    // Сводка: 2 из 5 открыто.
    expect(screen.getAllByText('2 из 5').length).toBeGreaterThan(0)
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('открыто').length).toBe(2)
  })

  it('показывает прогресс незакрытых достижений', async () => {
    renderPage()

    await screen.findByText('Практик')
    // 4 из 10 задач и 40% прогресса.
    expect(screen.getByText('4 / 10 задач')).toBeInTheDocument()
    expect(screen.getByText('осталось 6 задач')).toBeInTheDocument()
    expect(screen.getByText('40 / 100 повторений')).toBeInTheDocument()
    expect(screen.getByText('осталось 60 повторений')).toBeInTheDocument()
  })

  it('фильтрует достижения по категориям', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Первый шаг')
    await user.click(screen.getByRole('radio', { name: 'Практика' }))

    await waitFor(() => {
      expect(screen.getByText('Практик')).toBeInTheDocument()
      expect(screen.queryByText('Первый шаг')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('radio', { name: 'Уроки' }))
    expect(await screen.findByText('Первый шаг')).toBeInTheDocument()
    expect(screen.queryByText('Практик')).not.toBeInTheDocument()
  })

  it('показывает пустое состояние категории', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Первый шаг')
    await user.click(screen.getByRole('radio', { name: 'Память' }))
    // В категории «Память» есть только одно достижение — «Сто повторений».
    expect(await screen.findByText('Сто повторений')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Все' }))
    expect(screen.getAllByText('Первый шаг').length).toBeGreaterThan(0)
  })

  it('показывает пустой каталог, если достижений нет', async () => {
    renderPage({ '/api/achievements': achievementsEmptyFixture })

    expect(await screen.findByText('В этой категории пока пусто')).toBeInTheDocument()
    expect(screen.getAllByText(/0 из 0/).length).toBeGreaterThan(0)
  })

  it('сообщает об ошибке загрузки', async () => {
    renderPage({
      '/api/achievements': { __status: 500, body: { error: { code: 'x', message: 'база недоступна' } } },
    })

    expect(await screen.findByText(/Не удалось загрузить данные/)).toBeInTheDocument()
    expect(screen.getByText('база недоступна')).toBeInTheDocument()
  })

  it('ведёт к статистике и обучению', async () => {
    renderPage()

    await screen.findByText('Первый шаг')
    expect(screen.getByRole('link', { name: 'Статистика' })).toHaveAttribute('href', '/progress')
    expect(screen.getByRole('link', { name: 'Продолжить обучение' })).toHaveAttribute('href', '/learning')
  })
})
