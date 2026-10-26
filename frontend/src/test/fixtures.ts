import type {
  ActivityResponse,
  BackupInfo,
  CourseResponse,
  DashboardResponse,
  LessonContentResponse,
  Meta,
  ProgressResponse,
  Settings,
} from '@/types'

export const settingsFixture: Settings = {
  theme: 'dark',
  sidebar_collapsed: false,
  reduced_motion: false,
  daily_goal_minutes: 15,
  daily_goal_exercises: 3,
  daily_goal_cards: 10,
  editor_font_size: 14,
  editor_tab_size: 4,
  code_autosave: true,
  onboarding_completed: true,
}

export const dashboardFixture: DashboardResponse = {
  snapshot: {
    lessons: { completed: 3, in_progress: 1, total: 104, percent: 3 },
    exercises: { solved: 0, total: 0, percent: 0 },
    cards: { reviewed: 12, due: 4, total: 0, percent: 0 },
    quizzes: { passed: 0, total: 0, answers_correct: 0, answers_total: 0, accuracy: 0 },
    study: { total_seconds: 5400, today_seconds: 600, total_minutes: 90, today_minutes: 10 },
    streak: { current: 4, longest: 6, today_active: true },
    today: {
      date: '2026-10-26',
      study_seconds: 600,
      lessons_opened: 1,
      lessons_done: 0,
      exercises_done: 1,
      cards_reviewed: 5,
      quizzes_done: 0,
    },
    plan: [
      {
        id: 'lesson',
        label: 'Продолжить урок',
        current: 1,
        target: 1,
        unit: 'урок',
        done: true,
        route: '/learning',
      },
      {
        id: 'exercises',
        label: 'Решить задачи',
        current: 1,
        target: 3,
        unit: 'задачи',
        done: false,
        route: '/practice',
      },
      {
        id: 'cards',
        label: 'Повторить карточки',
        current: 5,
        target: 10,
        unit: 'карточек',
        done: false,
        route: '/flashcards',
      },
      {
        id: 'quiz',
        label: 'Пройти мини-тест',
        current: 0,
        target: 1,
        unit: 'тест',
        done: false,
        route: '/quizzes',
      },
    ],
    goals: { minutes: 15, exercises: 3, cards: 10 },
    course_percent: 3,
  },
  recent: [
    {
      type: 'lesson',
      id: 'm01-01',
      title: 'Что такое Go',
      subtitle: 'Урок',
      route: '/learning/m01-01',
      at: new Date().toISOString(),
    },
  ],
  continue_lesson: {
    lesson_id: 'm01-04',
    lesson_number: 4,
    lesson_title: 'Первая программа',
    lesson_status: 'in_progress',
    minutes: 10,
    module_id: 'm01',
    module_number: 1,
    module_title: 'Введение в Go',
    module_stat: { completed: 3, total: 7, percent: 43 },
    route: '/learning/m01-04',
  },
  course: {
    title: 'Go с нуля до бэкенда',
    subtitle: '14 модулей',
    modules: 14,
    lessons: 104,
    ready_lessons: 0,
    percent: 3,
  },
  totals: { lessons: 104, exercises: 0, flashcards: 0, quizzes: 0 },
}

const lessons = Array.from({ length: 7 }, (_, index) => ({
  id: `m01-0${index + 1}`,
  module_id: 'm01',
  number: index + 1,
  title: ['Что такое Go', 'Установка Go', 'Структура проекта', 'Первая программа', 'package main', 'Функция main()', 'Пакет fmt'][index],
  summary: 'Короткое описание урока.',
  minutes: 10,
  available: index < 2,
  status: index === 0 ? 'completed' : index === 1 ? 'in_progress' : 'not_started',
}))

export const courseFixture: CourseResponse = {
  course: {
    title: 'Go с нуля до бэкенда',
    subtitle: '14 модулей, 104 урока',
    description: 'Последовательный курс по Go.',
    modules: [
      {
        id: 'm01',
        number: 1,
        title: 'Введение в Go',
        summary: 'Зачем нужен Go.',
        level: 'beginner',
        lessons,
        minutes: 70,
        ready: 2,
        progress: 43,
      },
      {
        id: 'm04',
        number: 4,
        title: 'Коллекции',
        summary: 'Срезы, map и строки.',
        level: 'intermediate',
        lessons: lessons.map((lesson) => ({ ...lesson, id: `m04-0${lesson.number}` })),
        minutes: 90,
        ready: 0,
        progress: 0,
      },
    ],
    lesson_count: 104,
    ready_count: 2,
    minutes: 1200,
  },
  extras: { exercises: 0, flashcards: 0, quizzes: 0, questions: 0, decks: 0 },
  first_lesson: { id: 'm01-01', module_id: 'm01', title: 'Что такое Go', available: true },
}

export const progressFixture: ProgressResponse = {
  snapshot: dashboardFixture.snapshot,
  totals: dashboardFixture.totals,
}

export const activityFixture: ActivityResponse = {
  days: Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.now() - (29 - index) * 86_400_000).toISOString().slice(0, 10),
    study_seconds: index % 4 === 0 ? 900 : index % 3 === 0 ? 240 : 0,
    lessons_opened: 0,
    lessons_done: 0,
    exercises_done: 0,
    cards_reviewed: 0,
    quizzes_done: 0,
  })),
  total_seconds: 5400,
  streak: { current: 4, longest: 6, today_active: true },
  today: dashboardFixture.snapshot.today,
  range_days: 30,
}

export const metaFixture: Meta = {
  app: { name: 'Go Academy', version: '0.1.0', stage: 1, stage_label: 'Этап 1 — основа' },
  runtime: { go: 'go1.24.0', os: 'linux', arch: 'amd64', started_at: new Date().toISOString(), uptime_seconds: 120 },
  storage: {
    data_dir: '/data',
    db_path: '/data/academy.db',
    db_size_bytes: 118_784,
    schema_version: 1,
    backups: 1,
  },
  content: {
    title: 'Go с нуля до бэкенда',
    modules: 14,
    lessons: 104,
    ready_lessons: 0,
    exercises: 0,
    flashcards: 0,
    decks: 0,
    quizzes: 0,
    content_dir: '/content',
    frontend_ready: true,
  },
  server: { addr: '127.0.0.1:8080', cors_origins: ['http://localhost:5173'] },
}

export const backupsFixture: { backups: BackupInfo[]; count: number } = {
  backups: [
    {
      name: 'academy-20261026-120000.db',
      path: '/data/backups/academy-20261026-120000.db',
      size_bytes: 118_784,
      created_at: new Date().toISOString(),
    },
  ],
  count: 1,
}


export const lessonContentFixture: LessonContentResponse = {
  lesson: {
    id: 'm01-01',
    module_id: 'm01',
    module_number: 1,
    module_title: 'Введение в Go',
    module_level: 'beginner',
    number: 1,
    title: 'Что такое Go',
    summary: 'Зачем нужен Go и как выглядит программа.',
    minutes: 10,
    objectives: ['Понять, для чего создавался Go', 'Увидеть первую программу'],
    status: 'in_progress',
    available: true,
    module_completed: 1,
    module_total: 7,
    position: 1,
    total: 104,
  },
  markdown: [
    '## Коротко о языке',
    '',
    'Go — компилируемый язык. Он собирается в один бинарник.',
    '',
    '```go',
    'package main',
    '',
    'func main() {',
    '    fmt.Println("Привет, Go!")',
    '}',
    '```',
    '',
    '## Практика',
    '',
    'Напишите программу, которая печатает ваше имя.',
    '',
    '## Резюме',
    '',
    '- Go компилируется в один файл.',
    '- Программа начинается с package main.',
  ].join('\n'),
  starter_code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Привет")\n}\n',
  prev: null,
  next: { id: 'm01-02', title: 'Установка Go', available: true, status: 'in_progress' },
}

export const lessonCompletedFixture = {
  lesson: {
    id: 'm01-01',
    module_id: 'm01',
    title: 'Что такое Go',
    status: 'completed',
    last_opened_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  },
  already_completed: false,
  today: dashboardFixture.snapshot.today,
}


export const runnerStatusFixture = {
  runner: {
    available: true,
    version: 'go version go1.23.4 linux/amd64',
    binary: '/usr/local/go/bin/go',
    goroot: '/usr/local/go',
    limits: {
      timeout_ms: 10000,
      max_output_bytes: 262144,
      max_code_bytes: 262144,
      concurrency: 2,
    },
    warning:
      'Запуск выполняется локальным Go SDK в отдельном временном каталоге: это ограничение ресурсов, но не песочница безопасности.',
  },
}

export const runResultFixture = {
  status: 'ok',
  exit_code: 0,
  duration_ms: 12,
  build_ms: 340,
  stdout: 'Привет, Go!\n',
  stderr: '',
  truncated: false,
  timed_out: false,
  diagnostics: [],
}

export const compileErrorFixture = {
  status: 'compile_error',
  exit_code: 1,
  duration_ms: 0,
  build_ms: 220,
  stdout: '',
  stderr: './main.go:4:2: undefined: missing\n',
  truncated: false,
  timed_out: false,
  diagnostics: [{ file: 'main.go', line: 4, column: 2, message: 'undefined: missing', severity: 'error' }],
  message: 'код не компилируется',
}

export const draftFixture = {
  draft: {
    key: 'editor',
    title: '',
    code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("из черновика")\n}\n',
    created_at: '2026-10-26T18:00:00Z',
    updated_at: '2026-10-26T18:30:00Z',
    size: 67,
  },
}

export const draftsListFixture = {
  drafts: [draftFixture.draft],
  runs: [
    { id: 2, source: 'editor', ref_id: '', ok: true, duration_ms: 14, created_at: '2026-10-26T18:31:00Z' },
    { id: 1, source: 'lesson', ref_id: 'm01-01', ok: false, duration_ms: 8, created_at: '2026-10-26T18:20:00Z' },
  ],
}
