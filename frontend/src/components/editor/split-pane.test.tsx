import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SplitPane } from '@/components/editor/split-pane'

function renderPane(storageKey = 'test') {
  return render(
    <SplitPane
      storageKey={storageKey}
      left={<div>Теория</div>}
      right={<div>Редактор</div>}
      leftLabel="Теория урока"
      rightLabel="Редактор кода"
    />,
  )
}

describe('SplitPane', () => {
  it('показывает обе панели и разделитель', () => {
    renderPane()
    expect(screen.getByText('Теория')).toBeInTheDocument()
    expect(screen.getByText('Редактор')).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: /Разделитель/ })).toBeInTheDocument()
  })

  it('меняет ширину стрелками клавиатуры и запоминает положение', async () => {
    const user = userEvent.setup()
    renderPane('lesson')

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('aria-valuenow', '50')

    separator.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '54')
    expect(localStorage.getItem('goacademy-split-lesson')).toBe('0.54')

    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(separator).toHaveAttribute('aria-valuenow', '44')
  })

  it('не выходит за допустимые границы', async () => {
    const user = userEvent.setup()
    render(
      <SplitPane
        left={<div>Теория</div>}
        right={<div>Редактор</div>}
        minRatio={0.4}
        maxRatio={0.6}
        initialRatio={0.5}
      />,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    for (let index = 0; index < 10; index += 1) {
      await user.keyboard('{ArrowLeft}')
    }
    expect(separator).toHaveAttribute('aria-valuenow', '40')

    await user.keyboard('{Home}')
    expect(separator).toHaveAttribute('aria-valuenow', '50')
  })

  it('восстанавливает сохранённое положение', () => {
    localStorage.setItem('goacademy-split-restore', '0.62')
    renderPane('restore')
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '62')
  })
})
