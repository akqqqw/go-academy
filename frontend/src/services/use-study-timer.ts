import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from '@/lib/api'

/**
 * Учитывает время, проведённое в приложении.
 *
 * Каждые 60 секунд активной вкладке отправляется фактически прошедшее время.
 * Скрытая вкладка не считается: это защищает статистику от «накрутки»,
 * когда приложение оставили открытым на ночь.
 */
export function useStudyTimer() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let lastTick = Date.now()
    let visible = document.visibilityState === 'visible'
    let pings = 0

    const flush = (force = false) => {
      const now = Date.now()
      const seconds = Math.floor((now - lastTick) / 1000)
      lastTick = now
      if (!visible || seconds < (force ? 30 : 15)) return
      pings += 1
      api
        .study(Math.min(seconds, 300), force ? 'visible' : 'heartbeat')
        .then(() => {
          // Обновляем сводку не чаще раза в 5 минут, чтобы не дёргать интерфейс.
          if (pings % 5 === 0) {
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            void queryClient.invalidateQueries({ queryKey: ['progress'] })
          }
        })
        .catch(() => {
          // Сервер мог быть перезапущен — просто попробуем в следующий раз.
        })
    }

    const interval = window.setInterval(() => flush(), 60_000)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush(true)
        visible = false
      } else {
        visible = true
        lastTick = Date.now()
      }
    }

    const onPageHide = () => flush(true)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [queryClient])
}
