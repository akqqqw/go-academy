import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from '@/lib/api'
import { useSettingsStore } from '@/store/settings'

export const queryKeys = {
  meta: ['meta'] as const,
  dashboard: ['dashboard'] as const,
  course: ['course'] as const,
  progress: ['progress'] as const,
  activity: (days: number) => ['activity', days] as const,
  settings: ['settings'] as const,
  search: (query: string) => ['search', query] as const,
  lessonProgress: (id: string) => ['lesson', id] as const,
  lessonContent: (id: string) => ['lesson-content', id] as const,
  runnerStatus: ['runner-status'] as const,
  exercises: (filters: string) => ['exercises', filters] as const,
  exercise: (id: string) => ['exercise', id] as const,
  notes: (filters: string) => ['notes', filters] as const,
  note: (id: string) => ['note', id] as const,
  lessonNotes: (lessonId: string) => ['lesson-notes', lessonId] as const,
  flashcards: () => ['flashcards'] as const,
  flashcardQueue: (deck: string, limit: number) => ['flashcard-queue', deck, limit] as const,
  quizzes: () => ['quizzes'] as const,
  achievements: () => ['achievements'] as const,
  quiz: (id: string) => ['quiz', id] as const,
}

export function useMeta() {
  return useQuery({
    queryKey: queryKeys.meta,
    queryFn: api.meta,
    staleTime: 60_000,
    retry: 1,
  })
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: api.dashboard,
    staleTime: 15_000,
  })
}

export function useCourse() {
  return useQuery({
    queryKey: queryKeys.course,
    queryFn: api.course,
    staleTime: 5 * 60_000,
  })
}

export function useProgress() {
  return useQuery({
    queryKey: queryKeys.progress,
    queryFn: api.progress,
    staleTime: 15_000,
  })
}

export function useRunnerStatus() {
  return useQuery({
    queryKey: queryKeys.runnerStatus,
    queryFn: api.runnerStatus,
    staleTime: 60_000,
    retry: 0,
  })
}

export function useExercises(filters: {
  difficulty?: string
  module?: string
  status?: string
  q?: string
}) {
  const key = JSON.stringify(filters)
  return useQuery({
    queryKey: queryKeys.exercises(key),
    queryFn: () => api.exercises(filters),
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  })
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.exercise(id ?? ''),
    queryFn: () => api.exercise(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
    retry: false,
  })
}

export function useNotes(filters: {
  folder?: string
  tag?: string
  lesson?: string
  q?: string
  pinned?: boolean
}) {
  const key = JSON.stringify(filters)
  return useQuery({
    queryKey: queryKeys.notes(key),
    queryFn: () => api.notes(filters),
    staleTime: 5_000,
    placeholderData: (previous) => previous,
  })
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.note(id ?? ''),
    queryFn: () => api.note(id as string),
    enabled: Boolean(id),
    staleTime: 5_000,
    retry: false,
  })
}

/** Заметки, привязанные к уроку: показываются прямо на странице урока. */
export function useLessonNotes(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lessonNotes(lessonId ?? ''),
    queryFn: () => api.notes({ lesson: lessonId as string }),
    enabled: Boolean(lessonId),
    staleTime: 5_000,
    retry: false,
  })
}

export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements(),
    queryFn: () => api.achievements(),
    staleTime: 15_000,
  })
}

export function useQuizzes() {
  return useQuery({
    queryKey: queryKeys.quizzes(),
    queryFn: () => api.quizzes(),
    staleTime: 10_000,
  })
}

export function useQuiz(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.quiz(id ?? ''),
    queryFn: () => api.quiz(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
    retry: false,
  })
}

export function useFlashcards() {
  return useQuery({
    queryKey: queryKeys.flashcards(),
    queryFn: () => api.flashcards(),
    staleTime: 10_000,
  })
}

/** Очередь повторения запрашивается только когда сессия действительно начата. */
export function useFlashcardQueue(deck: string | null, limit = 20) {
  return useQuery({
    queryKey: queryKeys.flashcardQueue(deck ?? '', limit),
    queryFn: () => api.flashcardQueue({ deck: deck ?? undefined, limit }),
    enabled: deck !== null,
    staleTime: 0,
    retry: false,
  })
}

export function useLessonContent(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lessonContent(lessonId ?? ''),
    queryFn: () => api.lessonContent(lessonId as string),
    enabled: Boolean(lessonId),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useLessonProgress(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lessonProgress(lessonId ?? ''),
    queryFn: () => api.lessonProgress(lessonId as string),
    enabled: Boolean(lessonId),
    staleTime: 10_000,
  })
}

export function useActivity(days = 182) {
  return useQuery({
    queryKey: queryKeys.activity(days),
    queryFn: () => api.activity(days),
    staleTime: 60_000,
  })
}

/**
 * Загружает настройки с сервера один раз за сессию и синхронизирует их в store.
 * Дальше источником истины для интерфейса остаётся store с оптимистичными обновлениями.
 */
export function useSettingsBootstrap() {
  const setSettings = useSettingsStore((state) => state.setSettings)
  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.settings,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  })

  useEffect(() => {
    if (query.data) setSettings(query.data.settings)
  }, [query.data, setSettings])

  return query
}
