import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { LessonPage } from '@/pages/lesson-page'
import {
  compileErrorFixture,
  courseFixture,
  draftFixture,
  lessonCompletedFixture,
  lessonContentFixture,
  lessonNotesFixture,
  noteCreatedFixture,
  runResultFixture,
  runnerStatusFixture,
} from '@/test/fixtures'
import { mockFetch, renderWithProviders } from '@/test/utils'

vi.mock('@/components/editor/code-editor', () => import('@/test/editor-mock'))

function lessonRoutes(extra: Record<string, unknown> = {}) {
  return {
    '/api/course': courseFixture,
    '/api/editor/status': runnerStatusFixture,
    '/api/drafts/lesson-m01-01': { __status: 404, body: { error: { code: 'draft_not_found', message: 'нет' } } },
    '/api/lessons/m01-01/content': lessonContentFixture,
    '/api/lessons/m01-01/opened': { lesson: { id: 'm01-01', status: 'in_progress' } },
    '/api/lessons/m01-01/completed': lessonCompletedFixture,
    '/api/editor/run': runResultFixture,
    '/api/notes': (init?: RequestInit) =>
      init?.method === 'POST' ? noteCreatedFixture : lessonNotesFixture,
    ...extra,
  }
}

function renderLesson(lessonId = 'm01-01') {
  return renderWithProviders(
    <Routes>
      <Route path="/learning/:lessonId" element={<LessonPage />} />
    </Routes>,
    { route: `/learning/${lessonId}` },
  )
}

describe('LessonPage', () => {
  it('показывает теорию, цели и оглавление урока', async () => {
    mockFetch(lessonRoutes())
    renderLesson()

    expect(await screen.findByRole('heading', { name: 'Что такое Go', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Понять, для чего создавался Go')).toBeInTheDocument()
    expect(await screen.findByText(/компилируемый язык/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Коротко о языке' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Практика' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Скопировать код' })).toBeInTheDocument()
  })

  it('открывает урок вместе с редактором и стартовым кодом задания', async () => {
    mockFetch(lessonRoutes())
    renderLesson()

    const editor = await screen.findByLabelText('Редактор Go-кода')
    // Стартовый код взят из раздела «Практика».
    expect((editor as HTMLTextAreaElement).value).toContain('fmt.Println("Привет")')
    expect(screen.getByRole('separator', { name: /Разделитель/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Запустить/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Проверить/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Формат/ })).toBeInTheDocument()
  })

  it('фиксирует открытие урока на сервере', async () => {
    const fetchMock = mockFetch(lessonRoutes())
    renderLesson()

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/lessons/m01-01/opened') && init?.method === 'POST',
      )
      expect(call).toBeTruthy()
    })
  })

  it('отмечает урок пройденным по кнопке', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(lessonRoutes())
    renderLesson()

    const button = await screen.findByRole('button', { name: /Урок пройден/ })
    await user.click(button)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/lessons/m01-01/completed') && init?.method === 'POST',
      )
      expect(call).toBeTruthy()
    })
  })

  it('показывает заметки к уроку и создаёт новую из панели', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(lessonRoutes())
    renderLesson()

    expect(await screen.findByText('Заметки к уроку')).toBeInTheDocument()
    expect(await screen.findByText('Слайсы и массивы')).toBeInTheDocument()
    // Ссылка на заметку ведёт в раздел «Заметки» по её идентификатору.
    expect(screen.getByRole('link', { name: /Слайсы и массивы/ })).toHaveAttribute('href', '/notes/n-1')

    await user.click(screen.getByRole('button', { name: 'Добавить заметку' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(screen.getByLabelText('Текст заметки к уроку'), 'Ключевое слово defer')
    await user.click(within(dialog).getByRole('button', { name: /Сохранить заметку/ }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => {
        return String(url).includes('/api/notes') && init?.method === 'POST'
      })
      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('Ключевое слово defer')
      expect(String(post?.[1]?.body)).toContain('m01-01')
    })
  })

  it('запускает код задания и показывает ошибки с номером строки', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(
      lessonRoutes({ '/api/editor/run': compileErrorFixture }),
    )
    renderLesson()

    await user.click(await screen.findByRole('button', { name: /Запустить/ }))

    expect(await screen.findByText('Ошибка компиляции')).toBeInTheDocument()
    expect(screen.getByText('стр. 4')).toBeInTheDocument()

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/editor/run'))
    const body = JSON.parse(String((call?.[1] as RequestInit).body))
    expect(body.source).toBe('lesson')
    expect(body.ref_id).toBe('m01-01')
  })

  it('подхватывает сохранённый черновик урока', async () => {
    mockFetch(
      lessonRoutes({ '/api/drafts/lesson-m01-01': draftFixture }),
    )
    renderLesson()

    expect(await screen.findByDisplayValue(/из черновика/)).toBeInTheDocument()
  })

  it('честно сообщает, что материал урока ещё готовится', async () => {
    mockFetch({
      '/api/course': courseFixture,
      '/api/lessons/m03-01/content': {
        __status: 404,
        body: { error: { code: 'content_not_ready', message: 'материал урока ещё не опубликован' } },
      },
    })
    renderWithProviders(
      <Routes>
        <Route path="/learning/:lessonId" element={<LessonPage />} />
      </Routes>,
      { route: '/learning/m03-01' },
    )

    expect(await screen.findByText('Материал готовится')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /К программе/ })).toBeInTheDocument()
  })

  it('сообщает об ошибке сервера с возможностью повтора', async () => {
    mockFetch({ '/api/lessons/m01-01/content': {} }, { status: 500 })
    renderLesson()

    expect(await screen.findByText(/Не удалось загрузить данные/)).toBeInTheDocument()
  })
})
