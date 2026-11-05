import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { TodayPlan } from '@/features/dashboard/today-plan'
import { dashboardFixture } from '@/test/fixtures'
import type { PlanItem, Snapshot } from '@/types'

function planItems(done: boolean[]): PlanItem[] {
  return done.map((value, index) => ({
    id: ['lesson', 'exercises', 'cards', 'quiz'][index] ?? `item-${index}`,
    label: `Пункт ${index + 1}`,
    current: value ? 1 : 0,
    target: 1,
    unit: '',
    done: value,
    route: '/',
  }))
}

function snapshotWith(plan: PlanItem[], todayMinutes: number, goalMinutes: number): Snapshot {
  return {
    ...dashboardFixture.snapshot,
    plan,
    goals: { ...dashboardFixture.snapshot.goals, minutes: goalMinutes },
    study: { ...dashboardFixture.snapshot.study, today_minutes: todayMinutes },
  }
}

function renderPlan(snapshot: Snapshot) {
  return render(
    <MemoryRouter>
      <TodayPlan snapshot={snapshot} />
    </MemoryRouter>,
  )
}

describe('TodayPlan', () => {
  it('кольцо показывает прогресс плана, а не минуты', () => {
    // Время не потрачено, но половина пунктов закрыта: индикатор обязан
    // показывать 50%, иначе кольцо противоречит надписи «Выполнено 2 из 4».
    renderPlan(snapshotWith(planItems([true, true, false, false]), 0, 15))

    expect(screen.getByText('Выполнено 2 из 4')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('0 из 15 мин')).toBeInTheDocument()
  })

  it('минуты и прогресс плана считаются раздельно', () => {
    renderPlan(snapshotWith(planItems([true, false, false, false]), 15, 15))

    expect(screen.getByText('Выполнено 1 из 4')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('15 из 15 мин')).toBeInTheDocument()
    expect(screen.getByText(/цель по времени выполнена/)).toBeInTheDocument()
  })

  it('показывает остаток времени до дневной цели', () => {
    renderPlan(snapshotWith(planItems([false, false, false, false]), 5, 20))

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText(/до цели осталось 15 мин/)).toBeInTheDocument()
  })

  it('рисует строки плана со ссылками и прогрессом', () => {
    renderPlan(snapshotWith(planItems([true, false, false, false]), 0, 15))

    const firstRow = screen.getByText('Пункт 1').closest('a')
    expect(firstRow).not.toBeNull()
    expect(within(firstRow as HTMLElement).getByText('Урок открыт сегодня')).toBeInTheDocument()
  })
})
