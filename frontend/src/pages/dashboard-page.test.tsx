import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { dashboardFixture, courseFixture } from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

import { DashboardPage } from '@/pages/dashboard-page'

describe('DashboardPage', () => {
  it('показывает данные из API: урок, статистику и план', async () => {
    mockFetch({
      '/api/dashboard': dashboardFixture,
      '/api/course': courseFixture,
    })
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('Первая программа')).toBeInTheDocument()
    expect(screen.getByText(/Модуль 1 · Введение в Go/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Продолжить' })).toHaveAttribute(
      'href',
      '/learning/m01-04',
    )
    expect(screen.getByText('Серия: 4 дн. подряд')).toBeInTheDocument()
    expect(screen.getByText('Решить задачи')).toBeInTheDocument()
    expect(screen.getByText(/Что такое Go/)).toBeInTheDocument()
    expect(screen.getByText('1 ч 30 мин')).toBeInTheDocument()
  })

  it('показывает ошибку и кнопку повтора, если API недоступен', async () => {
    mockFetch({}, { status: 500 })
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText(/Не удалось загрузить данные/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeInTheDocument()
  })

  it('показывает пустое состояние активности без событий', async () => {
    mockFetch({
      '/api/dashboard': { ...dashboardFixture, recent: [] },
      '/api/course': courseFixture,
    })
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('Пока пусто')).toBeInTheDocument()
  })
})
