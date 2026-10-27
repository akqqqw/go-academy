import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDuration,
  formatRelativeDate,
  levelLabel,
  plural,
  pluralize,
} from '@/lib/utils'

describe('plural', () => {
  it('склоняет по правилам русского языка', () => {
    const forms: [string, string, string] = ['урок', 'урока', 'уроков']
    expect(plural(1, ...forms)).toBe('урок')
    expect(plural(2, ...forms)).toBe('урока')
    expect(plural(4, ...forms)).toBe('урока')
    expect(plural(5, ...forms)).toBe('уроков')
    expect(plural(11, ...forms)).toBe('уроков')
    expect(plural(21, ...forms)).toBe('урок')
    expect(plural(102, ...forms)).toBe('урока')
    expect(plural(0, ...forms)).toBe('уроков')
  })

  it('собирает число и слово', () => {
    expect(pluralize(3, 'урок', 'урока', 'уроков')).toBe('3 урока')
  })
})

describe('formatDuration', () => {
  it('форматирует секунды, минуты и часы', () => {
    expect(formatDuration(0)).toBe('0 с')
    expect(formatDuration(45)).toBe('45 с')
    expect(formatDuration(600)).toBe('10 мин')
    expect(formatDuration(3600)).toBe('1 ч')
    expect(formatDuration(5400)).toBe('1 ч 30 мин')
  })
})

describe('formatRelativeDate', () => {
  it('показывает «сегодня» для текущего времени', () => {
    expect(formatRelativeDate(new Date().toISOString())).toMatch(/^Сегодня, \d{2}:\d{2}$/)
  })

  it('возвращает прочерк для пустого значения', () => {
    expect(formatRelativeDate(null)).toBe('—')
    expect(formatRelativeDate('не дата')).toBe('—')
  })
})

describe('formatBytes', () => {
  it('переводит байты в удобные единицы', () => {
    expect(formatBytes(512)).toBe('512 Б')
    expect(formatBytes(2048)).toBe('2.0 КБ')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 МБ')
  })
})

describe('levelLabel', () => {
  it('переводит уровни модуля', () => {
    expect(levelLabel('beginner')).toBe('Начальный')
    expect(levelLabel('advanced')).toBe('Продвинутый')
    expect(levelLabel('custom')).toBe('custom')
  })
})
