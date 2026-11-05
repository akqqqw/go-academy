import { describe, expect, it } from 'vitest'

import { REMINDER_TITLE, reminderBody, reminderScheduleHint } from './messages'

describe('reminderBody', () => {
  it('зовёт добрать минуты, если дневная цель по времени не закрыта', () => {
    expect(reminderBody({ planPercent: 40, remainingMinutes: 7, dueCards: 12 })).toBe(
      'До дневной цели 7 мин — это один короткий урок.',
    )
  })

  it('напоминает про карточки, когда время набрано, но есть очередь', () => {
    expect(reminderBody({ planPercent: 75, remainingMinutes: 0, dueCards: 5 })).toBe(
      '5 карточек ждут повторения, пока память свежая.',
    )
  })

  it('хвалит за закрытый план', () => {
    expect(reminderBody({ planPercent: 100, remainingMinutes: 0, dueCards: 0 })).toBe(
      'План дня закрыт. Можно немного повторить карточки на завтра.',
    )
  })

  it('предлагает минимальный шаг, когда данных о цели нет', () => {
    expect(reminderBody({ planPercent: 0, remainingMinutes: 0, dueCards: 0 })).toBe(
      'Пять минут практики сегодня сохранят серию.',
    )
  })

  it('не обещает минуты, если цель уже выполнена', () => {
    const text = reminderBody({ planPercent: 60, remainingMinutes: 0, dueCards: 0 })
    expect(text).not.toContain('До дневной цели')
  })
})

describe('reminderScheduleHint', () => {
  it('показывает время с ведущим нулём', () => {
    expect(reminderScheduleHint(19, 30)).toBe('Напоминание включено: каждый день в 19:30')
    expect(reminderScheduleHint(9, 5)).toBe('Напоминание включено: каждый день в 9:05')
  })

  it('заголовок не обещает давления', () => {
    expect(REMINDER_TITLE).toBe('Не теряйте серию')
  })
})
