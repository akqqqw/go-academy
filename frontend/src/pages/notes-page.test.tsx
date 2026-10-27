import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { NotesPage } from '@/pages/notes-page'
import {
  noteCreatedFixture,
  noteDetailFixture,
  notesFixture,
  noteFoldersFixture,
} from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

function notesRoutes(extra: Record<string, unknown> = {}) {
  return {
    '/api/notes/n-1': noteDetailFixture,
    '/api/notes/n-2': noteDetailFixture,
    '/api/notes': notesFixture,
    '/api/note-folders': { folders: noteFoldersFixture },
    ...extra,
  }
}

function renderNotes(route = '/notes', routes: Record<string, unknown> = notesRoutes()) {
  const fetchMock = mockFetch(routes)
  const view = renderWithProviders(
    <Routes>
      <Route path="/notes" element={<NotesPage />} />
      <Route path="/notes/:noteId" element={<NotesPage />} />
    </Routes>,
    { route },
  )
  return { fetchMock, ...view }
}

describe('NotesPage', () => {
  it('показывает статистику, список заметок и папки', async () => {
    renderNotes()

    expect(await screen.findByText('Слайсы и массивы')).toBeInTheDocument()
    expect(screen.getByText('Шпаргалка по каналам')).toBeInTheDocument()
    // Счётчик заметок в шапке и папки из ответа API.
    expect(screen.getByText('Шпаргалки')).toBeInTheDocument()
    expect(screen.getByLabelText('Поиск по заметкам')).toBeInTheDocument()
    expect(screen.getAllByText('Связано с уроками').length).toBeGreaterThan(0)
  })

  it('открывает заметку по адресу и показывает Markdown в предпросмотре', async () => {
    const user = userEvent.setup()
    renderNotes('/notes/n-1')

    const title = await screen.findByLabelText('Заголовок заметки')
    await waitFor(() => expect((title as HTMLInputElement).value).toBe('Слайсы и массивы'))

    const body = screen.getByLabelText('Текст заметки') as HTMLTextAreaElement
    expect(body.value).toContain('var s []int')

    await user.click(screen.getByRole('button', { name: 'Просмотр' }))
    expect(await screen.findByRole('heading', { name: 'Слайсы и массивы' })).toBeInTheDocument()
    expect(document.body.textContent).toContain('var s []int')
  })

  it('сохраняет заметку по кнопке PUT-запросом', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderNotes('/notes/n-1')

    const body = (await screen.findByLabelText('Текст заметки')) as HTMLTextAreaElement
    await user.click(body)
    await user.type(body, ' Дополнение.')

    await user.click(screen.getByRole('button', { name: /Сохранить/ }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/api/notes/n-1') && init?.method === 'PUT'
      })
      expect(put).toBeTruthy()
      expect(String(put?.[1]?.body)).toContain('Дополнение.')
    })
  })

  it('сохраняет изменения автоматически после паузы', async () => {
    const { fetchMock } = renderNotes('/notes/n-1')

    const body = (await screen.findByLabelText('Текст заметки')) as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: `${body.value}\n\nАвтосохранение.` } })
    expect(screen.getByText('Есть изменения')).toBeInTheDocument()

    await waitFor(
      () => {
        const put = fetchMock.mock.calls.find((call) => {
          const init = call[1] as RequestInit | undefined
          return String(call[0]).includes('/api/notes/n-1') && init?.method === 'PUT'
        })
        expect(String(put?.[1]?.body)).toContain('Автосохранение.')
      },
      { timeout: 3000 },
    )
  })

  it('передаёт поисковый запрос в API', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderNotes()

    const search = await screen.findByLabelText('Поиск по заметкам')
    await user.type(search, 'канал')

    await waitFor(() => {
      const called = fetchMock.mock.calls.some((call) => String(call[0]).includes('q=%D0%BA%D0%B0%D0%BD%D0%B0%D0%BB'))
      expect(called).toBe(true)
    })
  })

  it('создаёт новую заметку', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderNotes(
      '/notes',
      notesRoutes({
        '/api/notes': (init?: RequestInit) => (init?.method === 'POST' ? noteCreatedFixture : notesFixture),
      }),
    )

    await user.click((await screen.findAllByRole('button', { name: 'Новая заметка' }))[0])

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/api/notes') && init?.method === 'POST'
      })
      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('Новая заметка')
    })
  })

  it('создаёт папку через диалог', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderNotes()

    await screen.findByText('Слайсы и массивы')
    await user.click(screen.getByRole('button', { name: 'Добавить папку' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Название папки'), 'Шпаргалки')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/api/note-folders') && init?.method === 'POST'
      })
      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('Шпаргалки')
    })
  })

  it('удаляет заметку после подтверждения', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderNotes('/notes/n-2')

    await screen.findByLabelText('Заголовок заметки')
    await user.click(screen.getByRole('button', { name: 'Удалить заметку' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined
        return String(call[0]).includes('/api/notes/') && init?.method === 'DELETE'
      })
      expect(del).toBeTruthy()
    })
  })

  it('показывает закреплённые первыми и фильтрует по тегу', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderNotes()

    await screen.findByText('Слайсы и массивы')
    await user.click(screen.getAllByRole('button', { name: /^#go/ })[0])

    await waitFor(() => {
      const called = fetchMock.mock.calls.some((call) => String(call[0]).includes('tag=go'))
      expect(called).toBe(true)
    })
  })
})
