import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PracticePage } from '@/pages/practice-page'
import { exercisesFixture } from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

describe('PracticePage', () => {
  it('показывает задания, статистику и фильтры', async () => {
    mockFetch({ '/api/exercises': exercisesFixture })
    renderWithProviders(<PracticePage />, { route: '/practice' })

    expect(await screen.findByRole('heading', { name: 'Практика', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Сумма двух чисел')).toBeInTheDocument()
    expect(screen.getByText('Пул воркеров')).toBeInTheDocument()
    // Решённая задача помечена, у нерешённой видно число попыток.
    expect(screen.getByText('Решено')).toBeInTheDocument()
    expect(screen.getByText('попыток: 1')).toBeInTheDocument()
    // Счётчики из stats/overview.
    expect(screen.getByText('12 лёгких')).toBeInTheDocument()
    expect(screen.getByText('6 сложных')).toBeInTheDocument()
    expect(screen.getByText('1 в процессе')).toBeInTheDocument()
    // Ссылка ведёт на страницу задания.
    expect(screen.getByRole('link', { name: /Сумма двух чисел/ })).toHaveAttribute(
      'href',
      '/practice/sum-two',
    )
  })

  it('передаёт фильтры сложности и статуса в запрос', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({ '/api/exercises': exercisesFixture })
    renderWithProviders(<PracticePage />, { route: '/practice' })

    await screen.findByText('Сумма двух чисел')
    await user.click(screen.getByRole('radio', { name: 'Сложные' }))
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) => url.includes('difficulty=hard'))).toBe(true)
    })

    await user.click(screen.getByRole('radio', { name: 'Не решены' }))
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) => url.includes('status=unsolved'))).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: /11\. Конкурентность/ }))
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) => url.includes('module=m11'))).toBe(true)
    })
  })

  it('ищет по названию и показывает пустое состояние', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      '/api/exercises': (init?: RequestInit) => {
        void init
        return exercisesFixture
      },
    })
    renderWithProviders(<PracticePage />, { route: '/practice' })

    const input = await screen.findByLabelText('Поиск по задачам')
    await user.type(input, 'канал')
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) => url.includes('q=%D0%BA%D0%B0%D0%BD%D0%B0%D0%BB'))).toBe(true)
    })

    // Сбрасываем фильтры — поиск очищается.
    await user.click(screen.getByRole('button', { name: /Сбросить фильтры/ }))
    expect(input).toHaveValue('')
  })
})
