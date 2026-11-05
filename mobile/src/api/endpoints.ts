// Типизированные вызовы Go-API. Используются и экранами, и очередью
// синхронизации: одни и те же операции не дублируются в двух местах.
import type {
  AchievementsResponse,
  ActivityResponse,
  CardGrade,
  CourseResponse,
  DashboardResponse,
  DraftResponse,
  ExerciseResponse,
  ExerciseSolutionResponse,
  ExerciseSubmitResponse,
  ExercisesResponse,
  FormatResponse,
  FlashcardsOverview,
  FlashcardQueue,
  FoldersResponse,
  LessonCompletionResponse,
  LessonContentResponse,
  LessonProgressRecord,
  Meta,
  NoteInput,
  NoteResponse,
  NotesResponse,
  ProgressResponse,
  QuizDetail,
  QuizResult,
  QuizzesResponse,
  ReviewResult,
  RunResult,
  RunnerStatusResponse,
  SearchResponse,
  Settings,
  SettingsResponse,
} from '@shared/types'

import { request } from '@/api/client'

export const api = {
  config: () =>
    request<{ supabase_url: string; supabase_anon_key: string; auth_required: boolean }>(
      '/api/config',
      { anonymous: true },
    ),
  health: () => request<{ status: string; version: string }>('/api/health', { anonymous: true }),
  meta: () => request<Meta>('/api/meta'),

  dashboard: () => request<DashboardResponse>('/api/dashboard'),
  course: () => request<CourseResponse>('/api/course'),
  progress: () => request<ProgressResponse>('/api/progress'),
  activity: (days = 182) => request<ActivityResponse>(`/api/activity?days=${days}`),
  studyPing: (seconds: number) =>
    request<{ added: number }>('/api/activity/study', { method: 'POST', body: { seconds } }),

  lessonContent: (id: string) =>
    request<LessonContentResponse>(`/api/lessons/${encodeURIComponent(id)}/content`),
  lessonOpened: (id: string) =>
    request<{ lesson: LessonProgressRecord }>(`/api/lessons/${encodeURIComponent(id)}/opened`, {
      method: 'POST',
      body: {},
    }),
  lessonCompleted: (id: string) =>
    request<LessonCompletionResponse>(`/api/lessons/${encodeURIComponent(id)}/completed`, {
      method: 'POST',
      body: {},
    }),

  runnerStatus: () => request<RunnerStatusResponse>('/api/editor/status'),
  runCode: (code: string, source = 'editor', refId = '') =>
    request<RunResult>('/api/editor/run', { method: 'POST', body: { code, source, ref_id: refId } }),
  formatCode: (code: string) =>
    request<FormatResponse>('/api/editor/format', { method: 'POST', body: { code } }),

  getDraft: (key: string) => request<DraftResponse>(`/api/drafts/${encodeURIComponent(key)}`),
  saveDraft: (key: string, code: string) =>
    request<DraftResponse>(`/api/drafts/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { code },
    }),

  exercises: () => request<ExercisesResponse>('/api/exercises'),
  exercise: (id: string) => request<ExerciseResponse>(`/api/exercises/${encodeURIComponent(id)}`),
  submitExercise: (id: string, code: string) =>
    request<ExerciseSubmitResponse>(`/api/exercises/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: { code },
    }),
  exerciseSolution: (id: string) =>
    request<ExerciseSolutionResponse>(`/api/exercises/${encodeURIComponent(id)}/solution`),

  notes: (query = '') => request<NotesResponse>(`/api/notes${query}`),
  note: (id: string) => request<NoteResponse>(`/api/notes/${encodeURIComponent(id)}`),
  createNote: (input: NoteInput) => request<NoteResponse>('/api/notes', { method: 'POST', body: input }),
  updateNote: (id: string, input: Partial<NoteInput>) =>
    request<NoteResponse>(`/api/notes/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
  deleteNote: (id: string) =>
    request<{ deleted: boolean }>(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  folders: () => request<FoldersResponse>('/api/note-folders'),

  flashcards: () => request<FlashcardsOverview>('/api/flashcards'),
  queue: (deck = '', limit = 20) => {
    const params = new URLSearchParams()
    if (deck) params.set('deck', deck)
    params.set('limit', String(limit))
    return request<FlashcardQueue>(`/api/flashcards/queue?${params.toString()}`)
  },
  review: (id: string, grade: CardGrade) =>
    request<ReviewResult>(`/api/flashcards/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: { grade },
    }),

  quizzes: () => request<QuizzesResponse>('/api/quizzes'),
  quiz: (id: string) => request<QuizDetail>(`/api/quizzes/${encodeURIComponent(id)}`),
  submitQuiz: (id: string, answers: Record<string, string | string[]>) =>
    request<QuizResult>(`/api/quizzes/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: { answers },
    }),

  achievements: () => request<AchievementsResponse>('/api/achievements'),
  search: (query: string) =>
    request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`),

  settings: () => request<SettingsResponse>('/api/settings'),
  updateSettings: (changes: Partial<Settings>) =>
    request<SettingsResponse>('/api/settings', { method: 'PATCH', body: changes }),
}

export type Api = typeof api
