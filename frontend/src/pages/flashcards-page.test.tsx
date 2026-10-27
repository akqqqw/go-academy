import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { FlashcardsPage } from '@/pages/flashcards-page'
import {
  customCardFixture,
  flashcardQueueEmptyFixture,
  flashcardQueueFixture,
  flashcardsOverviewFixture,
  reviewResultFixture,
} from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

function cardRoutes(extra: Record<string, unknown> = {}) {
  return {
    '/api/flashcards/basics-01/review': reviewResultFixture,
    '/api/flashcards/types-01/review': reviewResultFixture,
    '/api/flashcards/queue': flashcardQueueFixture,
    '/api/flashcards/stats': { stats: flashcardsOverviewFixture.stats },
    '/api/flashcards/decks/basics/reset': { reset: 9, deck_id: 'basics' },
    '/api/flashcards': (init?: RequestInit) => {
      if (init?.method === 'POST') return customCardFixture
      return flashcardsOverviewFixture
    },
    ...extra,
  }
}

function renderPage(routes: Record<string, unknown> = cardRoutes()) {
  const fetchMock = mockFetch(routes)
  const view = renderWithProviders(<FlashcardsPage />, { route: '/flashcards' })
  return { fetchMock, ...view }
}

describe('FlashcardsPage', () => {
  it('показывает колоды, сводку и серию повторений', async () => {
    renderPage()

    expect(await screen.findByText('Основы синтаксиса')).toBeInTheDocument()
    expect(screen.getByText('Типы и значения')).toBeInTheDocument()
    expect(screen.getByText('Ошибки и паника')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(screen.getByText(/Серия повторений: 3 дня/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Начать повторение' })).toBeEnabled()
  })

  it('проводит сессию: показывает ответ и сохраняет оценку', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Начать повторение' }))

    // Вопрос первой карточки.
    expect(await screen.findByText('С чего начинается программа на Go?')).toBeInTheDocument()
    expect(screen.queryByText('С `package main` и функции `func main()`.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    expect(screen.getByText('С `package main` и функции `func main()`.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Хорошо/ }))

    await waitFor(() => {
      const reviewed = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/review') && init?.method === 'POST'
      })
      expect(reviewed).toBeTruthy()
      expect(String(reviewed?.[1]?.body)).toContain('good')
    })

    // Переходим ко второй карточке.
    expect(await screen.findByText('Сколько байт занимает rune?')).toBeInTheDocument()
  })

  it('возвращает карточку в конец сессии при оценке «Снова»', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderPage(
      cardRoutes({
        '/api/flashcards/queue': flashcardQueueFixture,
        '/api/flashcards/basics-01/review': {
          ...reviewResultFixture,
          card: { ...reviewResultFixture.card, id: 'basics-01', interval_days: 0, repetitions: 0, learning: true },
        },
      }),
    )

    await user.click(await screen.findByRole('button', { name: 'Начать повторение' }))
    await screen.findByText('С чего начинается программа на Go?')

    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(screen.getByRole('button', { name: /Снова/ }))

    await waitFor(() => {
      const body = fetchMock.mock.calls
        .filter((call) => String(call[0]).includes('/review'))
        .map((call) => String((call[1] as RequestInit | undefined)?.body))
      expect(body.some((value) => value.includes('again'))).toBe(true)
    })

    // Вторая карточка идёт следующей, а первая вернулась в конец.
    expect(await screen.findByText('Сколько байт занимает rune?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(screen.getByRole('button', { name: /Хорошо/ }))
    expect(await screen.findByText('С чего начинается программа на Go?')).toBeInTheDocument()
  })

  it('завершает сессию и показывает итоги', async () => {
    const user = userEvent.setup()
    renderPage(cardRoutes({ '/api/flashcards/queue': flashcardQueueFixture }))

    await user.click(await screen.findByRole('button', { name: 'Начать повторение' }))
    await screen.findByText('С чего начинается программа на Go?')

    for (const name of ['С чего начинается', 'Сколько байт']) {
      await screen.findByText(new RegExp(name))
      await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
      await user.click(screen.getByRole('button', { name: /Хорошо/ }))
    }

    expect(await screen.findByText('Сессия завершена')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /К колодам/ })).toBeInTheDocument()
  })

  it('сообщает, когда повторять нечего', async () => {
    const user = userEvent.setup()
    renderPage(cardRoutes({ '/api/flashcards/queue': flashcardQueueEmptyFixture }))

    await user.click(await screen.findByRole('button', { name: 'Начать повторение' }))
    expect(await screen.findByText('На сегодня всё повторено')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Вернуться к колодам/ }))
    await waitFor(() => expect(screen.queryByText('На сегодня всё повторено')).not.toBeInTheDocument())
  })

  it('добавляет свою карточку в колоду', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderPage()

    await screen.findByText('Основы синтаксиса')
    await user.click(screen.getAllByTitle('Добавить свою карточку')[0])

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Вопрос карточки'), 'Что такое defer?')
    await user.type(within(dialog).getByLabelText('Ответ карточки'), 'Отложенный вызов.')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).endsWith('/api/flashcards') && init?.method === 'POST'
      })
      expect(post).toBeTruthy()
      const body = String(post?.[1]?.body)
      expect(body).toContain('Что такое defer?')
      expect(body).toContain('"deck_id":"basics"')
    })
  })

  it('сбрасывает прогресс колоды после подтверждения', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderPage()

    await screen.findByText('Основы синтаксиса')
    await user.click(screen.getAllByTitle('Сбросить прогресс колоды')[0])

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Сбросить' }))

    await waitFor(() => {
      const reset = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/api/flashcards/decks/basics/reset') && init?.method === 'POST'
      })
      expect(reset).toBeTruthy()
    })
  })

  it('скрывает запуск сессии, когда колода выучена', async () => {
    renderPage()

    const done = await screen.findAllByRole('button', { name: 'Всё повторено' })
    expect(done.length).toBeGreaterThan(0)
    expect(done[0]).toBeDisabled()
  })
})
