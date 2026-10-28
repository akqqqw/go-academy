import {
  BarChart3,
  Code2,
  GraduationCap,
  Home,
  Layers,
  ListChecks,
  Settings,
  SquareTerminal,
  StickyNote,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  description: string
  group: 'learn' | 'practice' | 'progress' | 'system'
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Главная', icon: Home, description: 'Сводка обучения', group: 'learn' },
  {
    to: '/learning',
    label: 'Обучение',
    icon: GraduationCap,
    description: 'Программа курса',
    group: 'learn',
  },
  {
    to: '/practice',
    label: 'Практика',
    icon: ListChecks,
    description: 'Задачи с проверкой',
    group: 'learn',
  },
  {
    to: '/editor',
    label: 'Редактор',
    icon: SquareTerminal,
    description: 'Свободный запуск Go-кода',
    group: 'learn',
  },
  {
    to: '/notes',
    label: 'Заметки',
    icon: StickyNote,
    description: 'Личные записи',
    group: 'practice',
  },
  {
    to: '/flashcards',
    label: 'Карточки',
    icon: Layers,
    description: 'Интервальное повторение',
    group: 'practice',
  },
  {
    to: '/quizzes',
    label: 'Тесты',
    icon: Code2,
    description: 'Викторины по модулям',
    group: 'practice',
  },
  {
    to: '/progress',
    label: 'Прогресс',
    icon: BarChart3,
    description: 'Статистика и достижения',
    group: 'progress',
  },
  {
    to: '/achievements',
    label: 'Достижения',
    icon: Trophy,
    description: 'Награды и прогресс',
    group: 'progress',
  },
  {
    to: '/settings',
    label: 'Настройки',
    icon: Settings,
    description: 'Тема, цели и данные',
    group: 'system',
  },
]

export const groupLabels: Record<NavItem['group'], string> = {
  learn: 'Обучение',
  practice: 'Тренировка',
  progress: 'Аналитика',
  system: 'Приложение',
}

/** Заголовок раздела для верхней панели. */
export function sectionTitle(pathname: string) {
  if (pathname.startsWith('/learning')) return 'Обучение'
  if (pathname.startsWith('/practice')) return 'Практика'
  if (pathname.startsWith('/editor')) return 'Редактор'
  if (pathname.startsWith('/notes')) return 'Заметки'
  if (pathname.startsWith('/flashcards')) return 'Карточки'
  if (pathname.startsWith('/quizzes')) return 'Тесты'
  if (pathname.startsWith('/achievements')) return 'Достижения'
  if (pathname.startsWith('/progress')) return 'Прогресс'
  if (pathname.startsWith('/settings')) return 'Настройки'
  return 'Главная'
}
