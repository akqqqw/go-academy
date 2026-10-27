// Типы данных, которые возвращает локальный Go-API.
// Имена полей совпадают с JSON-тегами бэкенда.

export type ThemePreference = 'dark' | 'light' | 'system'

export interface Settings {
  theme: ThemePreference
  sidebar_collapsed: boolean
  reduced_motion: boolean
  daily_goal_minutes: number
  daily_goal_exercises: number
  daily_goal_cards: number
  editor_font_size: number
  editor_tab_size: number
  code_autosave: boolean
  onboarding_completed: boolean
}

export type SettingKey = keyof Settings

export interface SettingDefinition {
  key: SettingKey
  kind: 'string' | 'int' | 'bool'
  enum?: string[]
  min?: number
  max?: number
  group: 'appearance' | 'goals' | 'editor' | 'system'
  label: string
  default: unknown
}

export interface SettingsResponse {
  settings: Settings
  definitions?: SettingDefinition[]
}

export interface LessonMeta {
  id: string
  module_id: string
  number: number
  title: string
  summary: string
  minutes: number
  available: boolean
  /** Статус из сохранённого прогресса: not_started | in_progress | completed. */
  status?: 'not_started' | 'in_progress' | 'completed' | string
}

export interface LessonNav {
  id: string
  title: string
  available: boolean
  status: string
}

export interface LessonDetail {
  id: string
  module_id: string
  module_number: number
  module_title: string
  module_level: string
  number: number
  title: string
  summary: string
  minutes: number
  objectives: string[]
  status: 'not_started' | 'in_progress' | 'completed' | string
  available: boolean
  module_completed: number
  module_total: number
  position: number
  total: number
}

export interface LessonContentResponse {
  lesson: LessonDetail
  markdown: string
  /** Стартовый код задания из раздела «Практика» (может быть пустым). */
  starter_code: string
  prev: LessonNav | null
  next: LessonNav | null
}

/** Статус запуска кода на сервере. */
export type RunStatus =
  | 'ok'
  | 'runtime_error'
  | 'compile_error'
  | 'timeout'
  | 'rejected'
  | 'internal'

export interface RunDiagnostic {
  file: string
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | string
}

export interface RunResult {
  status: RunStatus
  exit_code: number
  duration_ms: number
  build_ms: number
  stdout: string
  stderr: string
  truncated: boolean
  timed_out: boolean
  diagnostics: RunDiagnostic[] | null
  message?: string
  killed_by_limit?: boolean
}

export interface RunLimits {
  timeout_ms: number
  max_output_bytes: number
  max_code_bytes: number
  concurrency: number
}

export interface RunnerStatus {
  available: boolean
  version?: string
  binary?: string
  goroot?: string
  limits: RunLimits
  /** Предупреждение о том, что запуск не является песочницей. */
  warning: string
  reason?: string
}

export interface RunnerStatusResponse {
  runner: RunnerStatus
}

export interface FormatResponse {
  status: 'ok' | 'compile_error'
  code: string
  diagnostics: RunDiagnostic[] | null
}

export interface Draft {
  key: string
  title: string
  code: string
  created_at: string
  updated_at: string
  size: number
}

export interface DraftResponse {
  draft: Draft
}

export interface RunRecord {
  id: number
  source: string
  ref_id: string
  ok: boolean
  duration_ms: number
  created_at: string
}

export interface DraftsResponse {
  drafts: Draft[]
  runs: RunRecord[]
}

export interface LessonCompletionResponse {
  lesson: LessonProgressRecord
  already_completed: boolean
  today: DayActivity
}

export interface LessonProgressRecord {
  id: string
  module_id?: string
  title?: string
  status: 'not_started' | 'in_progress' | 'completed' | string
  last_opened_at?: string | null
  completed_at?: string | null
}

export interface CourseModule {
  id: string
  number: number
  title: string
  summary: string
  level: 'beginner' | 'intermediate' | 'advanced' | string
  lessons: LessonMeta[]
  minutes: number
  ready: number
  progress: number
}

export interface Course {
  title: string
  subtitle: string
  description: string
  modules: CourseModule[]
  lesson_count: number
  ready_count: number
  minutes: number
}

export interface Extras {
  exercises: number
  flashcards: number
  quizzes: number
  questions: number
  decks: number
}

export interface LessonRef {
  id: string
  module_id: string
  title: string
  available: boolean
}

export interface CourseResponse {
  course: Course
  extras: Extras
  first_lesson: LessonRef | null
}

export interface DayActivity {
  date: string
  study_seconds: number
  lessons_opened: number
  lessons_done: number
  exercises_done: number
  cards_reviewed: number
  quizzes_done: number
}

export interface Streak {
  current: number
  longest: number
  today_active: boolean
}

export interface PlanItem {
  id: 'lesson' | 'exercises' | 'cards' | 'quiz' | string
  label: string
  current: number
  target: number
  unit: string
  done: boolean
  route: string
}

export interface Goals {
  minutes: number
  exercises: number
  cards: number
}

export interface Snapshot {
  lessons: { completed: number; in_progress: number; total: number; percent: number }
  exercises: { solved: number; total: number; percent: number }
  cards: { reviewed: number; due: number; total: number; percent: number }
  quizzes: {
    passed: number
    total: number
    answers_correct: number
    answers_total: number
    accuracy: number
  }
  study: { total_seconds: number; today_seconds: number; total_minutes: number; today_minutes: number }
  streak: Streak
  today: DayActivity
  plan: PlanItem[]
  goals: Goals
  course_percent: number
}

export interface Totals {
  lessons: number
  exercises: number
  flashcards: number
  quizzes: number
}

export interface ProgressResponse {
  snapshot: Snapshot
  totals: Totals
}

export interface RecentItem {
  type: 'lesson' | 'exercise' | 'note' | 'quiz' | 'run' | 'card' | string
  id: string
  title: string
  subtitle: string
  route: string
  at: string
}

export interface ContinueCard {
  lesson_id: string
  lesson_number: number
  lesson_title: string
  lesson_status: 'not_started' | 'in_progress' | 'completed' | string
  minutes: number
  module_id: string
  module_number: number
  module_title: string
  module_stat: { completed: number; total: number; percent: number }
  route: string
}

export interface DashboardResponse {
  snapshot: Snapshot
  recent: RecentItem[]
  continue_lesson: ContinueCard | null
  course: {
    title: string
    subtitle: string
    modules: number
    lessons: number
    ready_lessons: number
    percent: number
  }
  totals: Totals
}

export interface ActivityResponse {
  days: DayActivity[]
  total_seconds: number
  streak: Streak
  today: DayActivity
  range_days: number
}

export interface SearchResult {
  type: 'lesson' | 'module' | 'section' | string
  id: string
  title: string
  subtitle: string
  route: string
  available: boolean
  score: number
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  count: number
}

export interface BackupInfo {
  name: string
  path: string
  size_bytes: number
  created_at: string
}

export interface Meta {
  app: { name: string; version: string; stage: number; stage_label: string }
  runtime: { go: string; os: string; arch: string; started_at: string; uptime_seconds: number }
  storage: {
    data_dir: string
    db_path: string
    db_size_bytes: number
    schema_version: number
    backups: number
  }
  content: {
    title: string
    modules: number
    lessons: number
    ready_lessons: number
    exercises: number
    flashcards: number
    decks: number
    quizzes: number
    content_dir: string
    frontend_ready: boolean
  }
  server: { addr: string; cors_origins: string[] }
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** Уровень сложности практического задания. */
export type ExerciseDifficulty = 'easy' | 'medium' | 'hard'

/** Проверка (тест), которая выполняется на решении. */
export interface ExerciseCheck {
  name: string
  title: string
}

/** Карточка задания в списке практики. */
export interface ExerciseCard {
  id: string
  module: string
  module_title: string
  module_number: number
  title: string
  summary: string
  difficulty: ExerciseDifficulty
  topics: string[]
  minutes: number
  checks_count: number
  hints_count: number
  solved: boolean
  attempts: number
  best_passed: number
  last_status?: string
  solved_at?: string
}

export interface ExerciseModuleFilter {
  id: string
  title: string
  number: number
  count: number
}

export interface ExercisesResponse {
  exercises: ExerciseCard[]
  stats: {
    total: number
    minutes: number
    by_level: Record<string, number>
    levels: Record<string, number>
    filtered: number
  }
  overview: { attempts: number; solved: number; in_progress: number }
  modules: ExerciseModuleFilter[]
}

/** Прогресс по конкретному заданию. */
export interface ExerciseProgress {
  exercise_id: string
  attempts: number
  best_passed: number
  best_total: number
  solved: boolean
  solved_at?: string
  last_status?: string
  last_at?: string
}

export interface ExerciseAttempt {
  id: number
  status: string
  passed: number
  total: number
  duration_ms: number
  created_at: string
}

export interface ExerciseDetail {
  id: string
  module: string
  module_title: string
  module_number: number
  title: string
  summary: string
  difficulty: ExerciseDifficulty
  topics: string[]
  minutes: number
  statement: string
  starter_code: string
  hints: string[]
  checks: ExerciseCheck[]
  progress: ExerciseProgress
  attempts: ExerciseAttempt[]
  next?: { id: string; title: string } | null
  prev?: { id: string; title: string } | null
}

export interface ExerciseResponse {
  exercise: ExerciseDetail
}

/** Результат одной проверки после запуска go test. */
export interface TestOutcome {
  name: string
  title: string
  passed: boolean
  skipped: boolean
  duration_ms: number
  output?: string
}

export type TestStatus =
  | 'ok'
  | 'test_failed'
  | 'compile_error'
  | 'timeout'
  | 'rejected'
  | 'internal'

export interface TestRunResult {
  status: TestStatus
  passed: number
  total: number
  tests: TestOutcome[]
  duration_ms: number
  build_ms: number
  stdout: string
  stderr: string
  truncated: boolean
  timed_out: boolean
  diagnostics: RunDiagnostic[] | null
  message?: string
}

export interface ExerciseSubmitResponse {
  result: TestRunResult
  progress: ExerciseProgress
  solved: boolean
}

export interface ExerciseSolutionResponse {
  id: string
  solution: string
  note: string
}

/** Заметка пользователя. */
export interface Note {
  id: string
  title: string
  body: string
  folder: string
  lesson_id?: string
  pinned: boolean
  tags: string[]
  created_at: string
  updated_at: string
  words: number
  excerpt: string
}

export interface NoteFolder {
  id: string
  name: string
  position: number
  count: number
}

export interface NoteTag {
  tag: string
  count: number
}

export interface NotesStats {
  total: number
  words: number
  tags: number
  folders: number
  linked: number
  pinned: number
  this_week: number
  with_lesson: number
}

export interface NotesResponse {
  notes: Note[]
  folders: NoteFolder[]
  tags: NoteTag[]
  stats: NotesStats
  filtered: number
}

export interface NoteResponse {
  note: Note
}

export interface FoldersResponse {
  folders: NoteFolder[]
}

export interface TagsResponse {
  tags: NoteTag[]
}

/** Данные для создания или обновления заметки. */
export interface NoteInput {
  title?: string
  body: string
  folder?: string
  lesson_id?: string
  pinned?: boolean
  tags?: string[]
}

/** Оценка повторения карточки. */
export type CardGrade = 'again' | 'hard' | 'good' | 'easy'

/** Карточка вместе с прогрессом повторений (SM-2). */
export interface Flashcard {
  id: string
  deck_id: string
  front: string
  back: string
  hint?: string
  ease: number
  interval_days: number
  repetitions: number
  lapses: number
  due_at: string
  custom: boolean
  reviews: number
  last_review?: string
  new: boolean
  learning: boolean
}

/** Колода карточек с прогрессом. */
export interface FlashcardDeck {
  id: string
  title: string
  description: string
  level: string
  icon: string
  module: number
  total: number
  due: number
  new: number
  learned: number
  custom: number
  progress: number
}

export interface CardDay {
  date: string
  count: number
}

export interface FlashcardStats {
  total: number
  due: number
  new: number
  learned: number
  reviews: number
  reviews_today: number
  accuracy: number
  streak: number
  days: CardDay[]
}

export interface FlashcardsOverview {
  decks: FlashcardDeck[]
  stats: FlashcardStats
  source: string
}

export interface FlashcardQueue {
  cards: Flashcard[]
  remaining: number
  limit: number
  deck?: {
    id: string
    title: string
    description: string
    level: string
    icon: string
    module: number
  }
}

export interface ReviewResult {
  card: Flashcard
  stats: FlashcardStats
  due: number
}

export interface FlashcardInput {
  deck_id: string
  front: string
  back: string
  hint?: string
}

/** Типы вопросов викторины. */
export type QuizQuestionType = 'single' | 'multiple' | 'true_false' | 'input' | 'code'

export interface QuizOption {
  id: string
  text: string
}

/** Вопрос викторины без ответа: он приходит только в разборе. */
export interface QuizQuestion {
  id: string
  type: QuizQuestionType
  prompt: string
  code?: string
  options?: QuizOption[]
}

export interface QuizProgress {
  attempts: number
  best_score: number
  best_total: number
  best_percent: number
  last_score: number
  last_total: number
  last_at?: string
  passed: boolean
  solved_once: boolean
}

export interface QuizSummary {
  id: string
  title: string
  description: string
  module: number
  module_title: string
  level: string
  questions: number
  pass_threshold: number
  progress: QuizProgress
}

export interface QuizAttempt {
  id: number
  quiz_id: string
  module_id?: string
  score: number
  total: number
  duration_ms: number
  created_at: string
  percent: number
  passed: boolean
}

export interface QuizStats {
  attempts: number
  passed: number
  average: number
  best: number
}

export interface QuizzesResponse {
  quizzes: QuizSummary[]
  stats: QuizStats
  history: QuizAttempt[]
  source: string
}

export interface QuizDetail {
  quiz: {
    id: string
    title: string
    description: string
    module: number
    module_title: string
    level: string
    questions: QuizQuestion[]
    pass_threshold: number
  }
  attempts: QuizAttempt[]
}

export interface QuizQuestionResult {
  id: string
  prompt: string
  type: QuizQuestionType
  correct: boolean
  given: string[]
  expected: string[]
  explanation: string
}

export interface QuizResult {
  attempt: QuizAttempt
  questions: QuizQuestionResult[]
  score: number
  total: number
  percent: number
  passed: boolean
  stats: QuizStats
}
