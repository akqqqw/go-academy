import { Brain, CalendarClock, Layers, Repeat2 } from 'lucide-react'

import { FeaturePreview } from '@/components/feature-preview'
import { Badge } from '@/components/ui/badge'
import { useMeta } from '@/services/queries'

export function FlashcardsPage() {
  const meta = useMeta()
  const cards = meta.data?.content.flashcards ?? 0
  const decks = meta.data?.content.decks ?? 0

  return (
    <FeaturePreview
      eyebrow="Память"
      title="Карточки"
      description="Вопрос на лицевой стороне, ответ на обратной. Алгоритм интервального повторения решает, что показать сегодня."
      icon={Brain}
      stage={6}
      stageLabel="Карточки и интервальное повторение реализуются на шестом этапе."
      items={[
        {
          icon: Repeat2,
          title: 'Spaced repetition',
          text: 'Оценки «Не знаю», «Сложно», «Хорошо», «Легко» меняют интервал по SM-2.',
        },
        {
          icon: Layers,
          title: 'Наборы по темам',
          text: 'Основы, функции, срезы, map, указатели, интерфейсы, ошибки, каналы, HTTP, тесты.',
        },
        {
          icon: CalendarClock,
          title: 'Расписание',
          text: 'Карточки с ошибками возвращаются раньше, уверенные — реже.',
        },
        {
          icon: Brain,
          title: 'Свои карточки',
          text: 'Создание, редактирование и удаление собственных карточек.',
        },
      ]}
      status={
        <>
          <p>
            Наборов в каталоге <Badge variant="outline">{decks}</Badge>, карточек{' '}
            <Badge variant="outline">{cards}</Badge>
          </p>
          <p>
            Таблица flashcards с полями ease, interval_days и due_at уже готова — повторения будут
            планироваться честно и сохраняться между запусками.
          </p>
        </>
      }
      note="Прогресс хранится локально и восстанавливается после перезапуска: то, что вы повторили сегодня, завтра не появится без необходимости."
    />
  )
}
