import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EditorPage } from '@/pages/editor-page'
import {
  compileErrorFixture,
  draftFixture,
  draftsListFixture,
  runResultFixture,
  runnerStatusFixture,
} from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

vi.mock('@/components/editor/code-editor', () => import('@/test/editor-mock'))

function baseRoutes() {
  return {
    '/api/editor/status': runnerStatusFixture,
    // Более конкретный путь должен идти раньше: мок сравнивает по префиксу.
    '/api/drafts/editor': draftFixture,
    '/api/drafts': draftsListFixture,
    '/api/editor/run': runResultFixture,
    '/api/editor/check': { ...runResultFixture, message: 'код компилируется' },
    '/api/editor/format': {
      status: 'ok',
      code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("отформатировано")\n}\n',
      diagnostics: [],
    },
  }
}

describe('EditorPage', () => {
  it('показывает редактор, версию Go и ограничения запуска', async () => {
    mockFetch(baseRoutes())
    renderWithProviders(<EditorPage />, { route: '/editor' })

    expect(await screen.findByRole('heading', { name: 'Редактор Go', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('monaco-stub')).toBeInTheDocument()
    // Черновик загружен из базы.
    expect(await screen.findByDisplayValue(/из черновика/)).toBeInTheDocument()
    expect(await screen.findByText('Go 1.23.4')).toBeInTheDocument()
    expect(screen.getByText('10 с')).toBeInTheDocument()
    // Лимит вывода и размер кода совпадают, поэтому значения ищем среди всех.
    expect(screen.getAllByText('256 КБ').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Одновременно')).toBeInTheDocument()
    expect(screen.getAllByText(/не песочница/i).length).toBeGreaterThan(0)
  })

  it('запускает код и показывает вывод в консоли', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(baseRoutes())
    renderWithProviders(<EditorPage />, { route: '/editor' })

    await user.click(await screen.findByRole('button', { name: /Запустить/ }))

    expect(await screen.findByText('Привет, Go!')).toBeInTheDocument()
    expect(screen.getByText('Выполнено успешно')).toBeInTheDocument()

    const runCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/editor/run'))
    expect(runCall).toBeTruthy()
    const body = JSON.parse(String((runCall?.[1] as RequestInit).body))
    expect(body.source).toBe('editor')
    expect(body.code).toContain('fmt.Println')
  })

  it('отправляет Ctrl+Enter как запуск, а Ctrl+S — как сохранение', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      ...baseRoutes(),
      '/api/drafts/editor ': draftFixture,
    })
    // Отдельный мок для PUT: путь тот же, отличается метод.
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/drafts/editor') && init?.method === 'PUT') {
        return new Response(JSON.stringify(draftFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/editor/run')) {
        return new Response(JSON.stringify(runResultFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/editor/status')) {
        return new Response(JSON.stringify(runnerStatusFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/drafts')) {
        return new Response(JSON.stringify(draftsListFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'нет мока' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    renderWithProviders(<EditorPage />, { route: '/editor' })
    const editor = await screen.findByLabelText('Редактор Go-кода')

    await user.click(editor)
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(await screen.findByText('Привет, Go!')).toBeInTheDocument()

    await user.keyboard('{Control>}s{/Control}')
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).includes('/api/drafts/editor') && init?.method === 'PUT',
        ),
      ).toBe(true)
    })
  })

  it('показывает ошибки компиляции с номером строки', async () => {
    const user = userEvent.setup()
    mockFetch({ ...baseRoutes(), '/api/editor/run': compileErrorFixture })
    renderWithProviders(<EditorPage />, { route: '/editor' })

    await user.click(await screen.findByRole('button', { name: /Запустить/ }))
    expect(await screen.findByText('Ошибка компиляции')).toBeInTheDocument()
    expect(screen.getByText('стр. 4')).toBeInTheDocument()
  })

  it('форматирует код через gofmt', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(baseRoutes())
    renderWithProviders(<EditorPage />, { route: '/editor' })

    await user.click(await screen.findByRole('button', { name: /Формат/ }))
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/api/editor/format')),
      ).toBe(true)
    })
    expect(await screen.findByDisplayValue(/отформатировано/)).toBeInTheDocument()
  })

  it('сбрасывает код только после подтверждения', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(baseRoutes())
    renderWithProviders(<EditorPage />, { route: '/editor' })

    await user.click(await screen.findByRole('button', { name: /Сбросить/ }))
    expect(await screen.findByText('Вернуть исходный код?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)

    await user.click(screen.getByRole('button', { name: /Сбросить/ }))
    // В диалоге две кнопки могут называться «Сбросить»: берём последнюю (в диалоге).
    const confirmButtons = screen.getAllByRole('button', { name: 'Сбросить' })
    await user.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
    })
    expect(screen.getByDisplayValue(/"Привет, Go!"/)).toBeInTheDocument()
  })

  it('честно сообщает, если Go не установлен', async () => {
    mockFetch({
      ...baseRoutes(),
      '/api/editor/status': {
        runner: {
          ...runnerStatusFixture.runner,
          available: false,
          version: undefined,
          reason: 'Go SDK не найден: установите Go и перезапустите сервер',
        },
      },
    })
    renderWithProviders(<EditorPage />, { route: '/editor' })

    expect(await screen.findByText('Go не найден')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Запустить/ })).toBeDisabled()
  })

  it('показывает историю запусков', async () => {
    mockFetch(baseRoutes())
    renderWithProviders(<EditorPage />, { route: '/editor' })

    expect(await screen.findByText('Последние запуски')).toBeInTheDocument()
    expect(await screen.findByText('14 мс')).toBeInTheDocument()
    expect(screen.getByText('8 мс')).toBeInTheDocument()
  })
})
