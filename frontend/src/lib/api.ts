import type {
  ActivityResponse,
  ApiErrorBody,
  BackupInfo,
  CourseResponse,
  DashboardResponse,
  DraftResponse,
  DraftsResponse,
  FormatResponse,
  LessonCompletionResponse,
  LessonContentResponse,
  LessonProgressRecord,
  Meta,
  ProgressResponse,
  RunResult,
  RunnerStatusResponse,
  SearchResponse,
  Settings,
  SettingsResponse,
} from '@/types'

/** Ошибка API с кодом и подробностями валидации. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, status: number, code = 'unknown', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError(
      'Не удалось связаться с локальным сервером. Проверьте, что backend запущен.',
      0,
      'network_error',
    )
  }

  if (!response.ok) {
    let code = 'http_error'
    let message = `Запрос завершился с кодом ${response.status}`
    let details: unknown
    try {
      const body = (await response.json()) as ApiErrorBody
      if (body?.error) {
        code = body.error.code
        message = body.error.message
        details = body.error.details
      }
    } catch {
      // Тело не JSON — оставляем сообщение по умолчанию.
    }
    throw new ApiError(message, response.status, code, details)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  meta: () => request<Meta>('/api/meta'),

  dashboard: () => request<DashboardResponse>('/api/dashboard'),

  course: () => request<CourseResponse>('/api/course'),

  progress: () => request<ProgressResponse>('/api/progress'),

  lessonContent: (id: string) =>
    request<LessonContentResponse>(`/api/lessons/${encodeURIComponent(id)}/content`),

  completeLesson: (id: string) =>
    request<LessonCompletionResponse>(`/api/lessons/${encodeURIComponent(id)}/completed`, {
      method: 'POST',
    }),

  runnerStatus: () => request<RunnerStatusResponse>('/api/editor/status'),

  runCode: (payload: { code: string; source?: string; ref_id?: string }) =>
    request<RunResult>('/api/editor/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  checkCode: (payload: { code: string; source?: string; ref_id?: string }) =>
    request<RunResult>('/api/editor/check', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  formatCode: (payload: { code: string }) =>
    request<FormatResponse>('/api/editor/format', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listDrafts: () => request<DraftsResponse>('/api/drafts'),

  getDraft: (key: string) => request<DraftResponse>(`/api/drafts/${encodeURIComponent(key)}`),

  saveDraft: (key: string, payload: { code: string; title?: string }) =>
    request<DraftResponse>(`/api/drafts/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteDraft: (key: string) =>
    request<{ deleted: boolean; key: string }>(`/api/drafts/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  lessonProgress: (id: string) =>
    request<{ lesson: LessonProgressRecord }>(`/api/lessons/${encodeURIComponent(id)}`),

  openLesson: (id: string) =>
    request<{ lesson: LessonProgressRecord }>(`/api/lessons/${encodeURIComponent(id)}/opened`, {
      method: 'POST',
    }),

  activity: (days = 182) => request<ActivityResponse>(`/api/activity?days=${days}`),

  settings: () => request<SettingsResponse>('/api/settings'),

  updateSettings: (changes: Partial<Settings>) =>
    request<{ settings: Settings }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  search: (query: string) =>
    request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`),

  study: (seconds: number, source: 'heartbeat' | 'visible' | 'editor' = 'heartbeat') =>
    request<{ today: unknown; total_seconds: number }>('/api/activity/study', {
      method: 'POST',
      body: JSON.stringify({ seconds, source }),
    }),

  backups: () => request<{ backups: BackupInfo[]; count: number }>('/api/backups'),

  /** Скачивает свежую резервную копию базы данных. */
  downloadBackup: async () => {
    const response = await fetch('/api/backup')
    if (!response.ok) {
      throw new ApiError('Не удалось создать резервную копию', response.status)
    }
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') ?? ''
    const match = /filename="?([^";]+)"?/.exec(disposition)
    const name = match?.[1] ?? 'academy-backup.db'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return name
  },

  reloadContent: () => request<{ status: string; lessons: number }>('/api/content/reload', { method: 'POST' }),
}
