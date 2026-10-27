import type {
  ActivityResponse,
  BackupInfo,
  CourseResponse,
  DashboardResponse,
  LessonContentResponse,
  Flashcard,
  FlashcardQueue,
  FlashcardsOverview,
  Meta,
  Note,
  NoteFolder,
  NotesResponse,
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

export const exercisesFixture = {
  exercises: [
    {
      id: 'sum-two',
      module: 'm02',
      module_title: 'Основы языка',
      module_number: 2,
      title: 'Сумма двух чисел',
      summary: 'Арифметика, параметры и возвращаемое значение.',
      difficulty: 'easy',
      topics: ['операторы'],
      minutes: 5,
      checks_count: 3,
      hints_count: 2,
      solved: true,
      attempts: 2,
      best_passed: 3,
      last_status: 'ok',
      solved_at: '2026-10-26T18:00:00Z',
    },
    {
      id: 'worker-pool',
      module: 'm11',
      module_title: 'Конкурентность',
      module_number: 11,
      title: 'Пул воркеров',
      summary: 'Горутины, каналы и WaitGroup на реальной задаче.',
      difficulty: 'hard',
      topics: ['goroutines', 'channels'],
      minutes: 30,
      checks_count: 6,
      hints_count: 4,
      solved: false,
      attempts: 1,
      best_passed: 3,
      last_status: 'test_failed',
    },
  ],
  stats: {
    total: 30,
    minutes: 420,
    by_level: { easy: 12, medium: 12, hard: 6 },
    levels: { easy: 2, medium: 0, hard: 1 },
    filtered: 2,
  },
  overview: { attempts: 3, solved: 1, in_progress: 1 },
  modules: [
    { id: 'm02', title: 'Основы языка', number: 2, count: 5 },
    { id: 'm11', title: 'Конкурентность', number: 11, count: 2 },
  ],
}

export const exerciseDetailFixture = {
  exercise: {
    id: 'sum-two',
    module: 'm02',
    module_title: 'Основы языка',
    module_number: 2,
    title: 'Сумма двух чисел',
    summary: 'Арифметика, параметры и возвращаемое значение.',
    difficulty: 'easy',
    topics: ['операторы', 'функции'],
    minutes: 5,
    statement: '## Условие\n\nНапишите функцию `Sum(a, b int) int`.',
    starter_code: 'package main\n\nfunc Sum(a, b int) int {\n\treturn 0\n}\n\nfunc main() {}\n',
    hints: ['Сложение двух int работает напрямую.'],
    checks: [
      { name: 'TestSumPositive', title: 'складывает положительные числа' },
      { name: 'TestSumNegative', title: 'работает с отрицательными числами' },
      { name: 'TestSumMixed', title: 'даёт ноль для противоположных чисел' },
    ],
    progress: {
      exercise_id: 'sum-two',
      attempts: 1,
      best_passed: 1,
      best_total: 3,
      solved: false,
      last_status: 'test_failed',
      last_at: '2026-10-26T18:40:00Z',
    },
    attempts: [
      {
        id: 1,
        status: 'test_failed',
        passed: 1,
        total: 3,
        duration_ms: 512,
        created_at: '2026-10-26T18:40:00Z',
      },
    ],
    next: { id: 'worker-pool', title: 'Пул воркеров' },
    prev: null,
  },
}

export const exerciseSubmitFixture = {
  result: {
    status: 'test_failed',
    passed: 1,
    total: 3,
    tests: [
      { name: 'TestSumPositive', title: 'складывает положительные числа', passed: true, skipped: false, duration_ms: 0 },
      {
        name: 'TestSumNegative',
        title: 'работает с отрицательными числами',
        passed: false,
        skipped: false,
        duration_ms: 0,
        output: 'main_test.go:12: Sum(-7, -1) = 6, ожидалось -8',
      },
      { name: 'TestSumMixed', title: 'даёт ноль для противоположных чисел', passed: false, skipped: false, duration_ms: 0 },
    ],
    duration_ms: 640,
    build_ms: 420,
    stdout: '',
    stderr: 'FAIL\n',
    truncated: false,
    timed_out: false,
    diagnostics: [{ file: 'main.go', line: 4, column: 2, message: 'Sum(-7, -1) = 6, ожидалось -8', severity: 'error' }],
    message: 'пройдено 1 из 3 проверок',
  },
  progress: {
    exercise_id: 'sum-two',
    attempts: 2,
    best_passed: 1,
    best_total: 3,
    solved: false,
    last_status: 'test_failed',
  },
  solved: false,
}

export const exerciseSolutionFixture = {
  id: 'sum-two',
  solution: 'package main\n\nfunc Sum(a, b int) int {\n\treturn a + b\n}\n',
  note: 'Сравните со своим решением.',
}

const baseNote: Note = {
  id: 'n-1',
  title: 'Слайсы и массивы',
  body: '# Слайсы и массивы\n\nСлайс — это структура из указателя, длины и ёмкости.\n\n```go\nvar s []int\n```',
  folder: 'Уроки',
  lesson_id: 'm01-01',
  pinned: true,
  tags: ['go', 'слайсы'],
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-21T12:30:00Z',
  words: 14,
  excerpt: 'Слайс — это структура из указателя, длины и ёмкости.',
}

export const noteFixture: Note = baseNote

export const secondNoteFixture: Note = {
  id: 'n-2',
  title: 'Шпаргалка по каналам',
  body: '# Шпаргалка по каналам\n\nБуферизованный канал не блокирует отправителя, пока есть место.',
  folder: 'Общее',
  pinned: false,
  tags: ['конкурентность'],
  created_at: '2026-10-19T09:00:00Z',
  updated_at: '2026-10-19T09:00:00Z',
  words: 11,
  excerpt: 'Буферизованный канал не блокирует отправителя, пока есть место.',
}

export const noteFoldersFixture: NoteFolder[] = [
  { id: 'general', name: 'Общее', position: 0, count: 1 },
  { id: 'lessons', name: 'Уроки', position: 1, count: 1 },
  { id: 'cheats', name: 'Шпаргалки', position: 2, count: 0 },
]

export const notesFixture: NotesResponse = {
  notes: [baseNote, secondNoteFixture],
  folders: noteFoldersFixture,
  tags: [
    { tag: 'go', count: 1 },
    { tag: 'конкурентность', count: 1 },
    { tag: 'слайсы', count: 1 },
  ],
  stats: {
    total: 2,
    words: 25,
    tags: 3,
    folders: 3,
    linked: 1,
    pinned: 1,
    this_week: 1,
    with_lesson: 1,
  },
  filtered: 2,
}

export const lessonNotesFixture: NotesResponse = {
  ...notesFixture,
  notes: [baseNote],
  filtered: 1,
}

export const noteDetailFixture = { note: baseNote }

export const noteCreatedFixture = {
  note: {
    ...secondNoteFixture,
    id: 'n-3',
    title: 'Новая заметка',
    body: '',
    tags: [],
    folder: 'Общее',
    lesson_id: undefined,
  } satisfies Note,
}

const cardBasics: Flashcard = {
  id: 'basics-01',
  deck_id: 'basics',
  front: 'С чего начинается программа на Go?',
  back: 'С `package main` и функции `func main()`.',
  hint: 'Первая строка — package.',
  ease: 2.5,
  interval_days: 0,
  repetitions: 0,
  lapses: 0,
  due_at: '2026-10-27T09:00:00Z',
  custom: false,
  reviews: 0,
  new: true,
  learning: false,
}

const cardTypes: Flashcard = {
  ...cardBasics,
  id: 'types-01',
  deck_id: 'types',
  front: 'Сколько байт занимает rune?',
  back: 'Четыре: rune — это int32.',
  hint: 'int32',
  reviews: 2,
  repetitions: 1,
  interval_days: 3,
  new: false,
  learning: false,
}

export const flashcardsOverviewFixture: FlashcardsOverview = {
  source: 'content/flashcards/decks.json',
  decks: [
    {
      id: 'basics',
      title: 'Основы синтаксиса',
      description: 'Пакеты, точка входа, переменные и константы.',
      level: 'beginner',
      icon: 'sparkles',
      module: 1,
      total: 9,
      due: 9,
      new: 9,
      learned: 0,
      custom: 0,
      progress: 0,
    },
    {
      id: 'types',
      title: 'Типы и значения',
      description: 'int, rune, byte, iota и приведение типов.',
      level: 'beginner',
      icon: 'shapes',
      module: 1,
      total: 8,
      due: 3,
      new: 1,
      learned: 5,
      custom: 1,
      progress: 63,
    },
    {
      id: 'errors',
      title: 'Ошибки и паника',
      description: 'Обёртка ошибок, errors.Is/As, panic и recover.',
      level: 'advanced',
      icon: 'alert-triangle',
      module: 6,
      total: 8,
      due: 0,
      new: 0,
      learned: 8,
      custom: 0,
      progress: 100,
    },
  ],
  stats: {
    total: 100,
    due: 12,
    new: 64,
    learned: 24,
    reviews: 40,
    reviews_today: 7,
    accuracy: 78,
    streak: 3,
    days: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-10-${String(14 + index).padStart(2, '0')}`,
      count: index % 3 === 0 ? 4 : index % 4 === 0 ? 2 : 0,
    })),
  },
}

export const flashcardQueueFixture: FlashcardQueue = {
  cards: [cardBasics, cardTypes],
  remaining: 2,
  limit: 20,
}

export const flashcardQueueSingleFixture: FlashcardQueue = {
  cards: [cardBasics],
  remaining: 1,
  limit: 20,
}

export const flashcardQueueEmptyFixture: FlashcardQueue = {
  cards: [],
  remaining: 0,
  limit: 20,
}

export const reviewResultFixture = {
  card: {
    ...cardBasics,
    reviews: 1,
    repetitions: 1,
    interval_days: 1,
    new: false,
    ease: 2.5,
    due_at: '2026-10-28T09:00:00Z',
  },
  stats: flashcardsOverviewFixture.stats,
  due: 11,
}

export const customCardFixture = {
  card: {
    ...cardBasics,
    id: 'custom-abc123',
    deck_id: 'basics',
    front: 'Что такое defer?',
    back: 'Отложенный вызов.',
    custom: true,
  },
}
