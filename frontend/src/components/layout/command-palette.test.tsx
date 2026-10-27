import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router-dom'

import { CommandPalette } from '@/components/layout/command-palette'
import { mockFetch, renderWithProviders } from '@/test/utils'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

describe('CommandPalette', () => {
  it('ищет по API и переходит по результату', async () => {
    const onOpenChange = vi.fn()
    mockFetch({
      '/api/search': {
        query: 'срез',
        count: 1,
        results: [
          {
            type: 'lesson',
            id: 'm04-02',
            title: 'Срезы',
            subtitle: 'Модуль 4 · Коллекции',
            route: '/learning/m04-02',
            available: true,
            score: 20,
          },
        ],
      },
    })

    const user = userEvent.setup()
    renderWithProviders(
      <>
        <CommandPalette open onOpenChange={onOpenChange} />
        <LocationDisplay />
      </>,
    )

    await user.type(screen.getByLabelText('Поисковый запрос'), 'срез')
    const result = await screen.findByText('Срезы', { exact: true })
    await user.click(result)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/learning/m04-02')
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('показывает быстрый переход при пустом запросе', () => {
    mockFetch({})
    renderWithProviders(<CommandPalette open onOpenChange={() => undefined} />)

    expect(screen.getByText('Быстрый переход')).toBeInTheDocument()
    expect(screen.getByText('Программа обучения')).toBeInTheDocument()
  })
})
