import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DashboardPage } from '@/pages/dashboard-page'
import { FlashcardsPage } from '@/pages/flashcards-page'
import { LearningPage } from '@/pages/learning-page'
import { NotesPage } from '@/pages/notes-page'
import { PracticePage } from '@/pages/practice-page'
import { ProgressPage } from '@/pages/progress-page'
import { QuizzesPage } from '@/pages/quizzes-page'
import { SettingsPage } from '@/pages/settings-page'
import { watchSystemTheme } from '@/store/settings'

// Markdown-рендерер и подсветка кода нужны только на странице урока,
// поэтому этот экран загружается отдельным чанком.
const LessonPage = lazy(() =>
  import('@/pages/lesson-page').then((module) => ({ default: module.LessonPage })),
)

// Страница задания практики использует Monaco и Markdown: отдельный чанк.
const ExercisePage = lazy(() =>
  import('@/pages/exercise-page').then((module) => ({ default: module.ExercisePage })),
)

// Страница редактора тянет Monaco: грузим её только при переходе.
const EditorPage = lazy(() =>
  import('@/pages/editor-page').then((module) => ({ default: module.EditorPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function ScrollRestoration() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  useEffect(() => watchSystemTheme(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <BrowserRouter>
          <ScrollRestoration />
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="learning" element={<LearningPage />} />
              <Route
                path="learning/:lessonId"
                element={
                  <Suspense
                    fallback={
                      <div className="flex items-center gap-2 py-16 text-sm text-fg-muted">
                        <span className="size-3 animate-pulse-soft rounded-full bg-primary" />
                        Загружаем урок…
                      </div>
                    }
                  >
                    <LessonPage />
                  </Suspense>
                }
              />
              <Route path="practice" element={<PracticePage />} />
              <Route
                path="practice/:exerciseId"
                element={
                  <Suspense
                    fallback={
                      <div className="flex items-center gap-2 py-16 text-sm text-fg-muted">
                        <span className="size-3 animate-pulse-soft rounded-full bg-primary" />
                        Загружаем задание…
                      </div>
                    }
                  >
                    <ExercisePage />
                  </Suspense>
                }
              />
              <Route
                path="editor"
                element={
                  <Suspense
                    fallback={
                      <div className="flex items-center gap-2 py-16 text-sm text-fg-muted">
                        <span className="size-3 animate-pulse-soft rounded-full bg-primary" />
                        Загружаем редактор…
                      </div>
                    }
                  >
                    <EditorPage />
                  </Suspense>
                }
              />
              <Route path="notes" element={<NotesPage />} />
              <Route path="notes/:noteId" element={<NotesPage />} />
              <Route path="flashcards" element={<FlashcardsPage />} />
              <Route path="quizzes" element={<QuizzesPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster
          theme="system"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              fontSize: '13px',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
