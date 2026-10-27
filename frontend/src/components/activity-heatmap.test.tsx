import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActivityHeatmap } from '@/components/activity-heatmap'
import { activityFixture } from '@/test/fixtures'

describe('ActivityHeatmap', () => {
  it('рисует клетку на каждый день и легенду', () => {
    const { container } = render(<ActivityHeatmap days={activityFixture.days} />)
    const cells = container.querySelectorAll('[title]')
    expect(cells).toHaveLength(activityFixture.days.length)
    expect(screen.getByText(/активных дней/)).toBeInTheDocument()
    expect(screen.getByText(/меньше/)).toBeInTheDocument()
  })

  it('показывает сообщение без данных', () => {
    render(<ActivityHeatmap days={[]} />)
    expect(screen.getByText('Пока нет данных об активности.')).toBeInTheDocument()
  })
})
