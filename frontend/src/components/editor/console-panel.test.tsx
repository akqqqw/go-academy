import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConsolePanel, formatDuration } from '@/components/editor/console-panel'
import { compileErrorFixture, runResultFixture } from '@/test/fixtures'
import type { RunResult } from '@/types'

const success: RunResult = runResultFixture as RunResult

function renderConsole(props: Partial<React.ComponentProps<typeof ConsolePanel>> = {}) {
  return render(
    <ConsolePanel
      result={null}
      running={false}
      onClear={() => undefined}
      onJumpToLine={() => undefined}
      {...props}
    />,
  )
}

describe('ConsolePanel', () => {
  it('в пустом состоянии подсказывает, как запустить код', () => {
    renderConsole()
    expect(screen.getByText(/Нажмите «Запустить»/)).toBeInTheDocument()
  })

  it('показывает stdout, время и статус успеха', () => {
    renderConsole({ result: success })
    expect(screen.getByText('Выполнено успешно')).toBeInTheDocument()
    expect(screen.getByText('Привет, Go!')).toBeInTheDocument()
    expect(screen.getByText(/сборка 340 мс/)).toBeInTheDocument()
    expect(screen.getByText(/выполнение 12 мс/)).toBeInTheDocument()
  })

  it('при ошибке компиляции открывает вкладку ошибок и переходит к строке', async () => {
    const user = userEvent.setup()
    const onJumpToLine = vi.fn()
    renderConsole({ result: compileErrorFixture as RunResult, onJumpToLine })

    expect(screen.getByText('Ошибка компиляции')).toBeInTheDocument()
    const jump = await screen.findByRole('button', { name: /undefined: missing/ })
    expect(screen.getByText('стр. 4')).toBeInTheDocument()

    await user.click(jump)
    expect(onJumpToLine).toHaveBeenCalledWith(4, 2)
  })

  it('показывает ошибку выполнения и код возврата', () => {
    renderConsole({
      result: {
        ...success,
        status: 'runtime_error',
        exit_code: 2,
        stdout: '',
        stderr: 'panic: runtime error: index out of range [5] with length 3\n',
        diagnostics: [{ file: 'main.go', line: 7, column: 1, message: 'index out of range', severity: 'error' }],
        message: 'программа завершилась с ошибкой',
      },
    })
    expect(screen.getByText('Ошибка выполнения')).toBeInTheDocument()
    // Причина видна в списке ошибок и в stderr.
    expect(screen.getAllByText(/index out of range/).length).toBeGreaterThan(0)
    expect(screen.getByText('стр. 7')).toBeInTheDocument()
    expect(screen.getByText('код 2')).toBeInTheDocument()
  })

  it('предупреждает об усечении вывода и о таймауте', () => {
    renderConsole({
      result: {
        ...success,
        status: 'timeout',
        timed_out: true,
        exit_code: -1,
        truncated: true,
        stderr: '[go-academy] выполнение прервано через 10s\n',
        message: 'превышен лимит 10s: процесс остановлен',
      },
    })
    expect(screen.getByText('Превышен лимит времени')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /ошибки/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/превышен лимит 10s/)).toBeInTheDocument()
    expect(screen.getByText(/Вывод обрезан/)).toBeInTheDocument()
  })

  it('очищается по кнопке', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    renderConsole({ result: success, onClear })
    await user.click(screen.getByRole('button', { name: 'Очистить консоль' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('форматирует длительность', () => {
    expect(formatDuration(250)).toBe('250 мс')
    expect(formatDuration(1500)).toBe('1.50 с')
  })
})
