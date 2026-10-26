import { Braces, CheckCheck, Filter, Lightbulb, ListChecks } from 'lucide-react'

import { FeaturePreview } from '@/components/feature-preview'
import { Badge } from '@/components/ui/badge'
import { useMeta } from '@/services/queries'

export function PracticePage() {
  const meta = useMeta()
  const exercises = meta.data?.content.exercises ?? 0

  return (
    <FeaturePreview
      eyebrow="Тренировка"
      title="Практика"
      description="Отдельные задачи по темам курса: условие, примеры, ограничения, подсказки и настоящая проверка через Go-тесты."
      icon={ListChecks}
      stage={4}
      stageLabel="Раздел реализуется на четвёртом этапе разработки."
      items={[
        {
          icon: Filter,
          title: 'Фильтры',
          text: 'По сложности, теме, статусу решения и наличию подсказок.',
        },
        {
          icon: Braces,
          title: 'Условия задач',
          text: 'Примеры ввода и вывода, ограничения и стартовый код.',
        },
        {
          icon: CheckCheck,
          title: 'Проверка тестами',
          text: 'go test в изолированном временном каталоге, а не сравнение текста.',
        },
        {
          icon: Lightbulb,
          title: 'Подсказки и решения',
          text: 'Пошаговые подсказки, история попыток и сохранение кода.',
        },
      ]}
      status={
        <>
          <p>
            Задач в каталоге <Badge variant="outline">{exercises}</Badge>
          </p>
          <p>
            Программа курса уже доступна — 14 модулей с последовательной теорией. Задачи появятся
            после того, как будет готов движок запуска кода.
          </p>
        </>
      }
      note="Каждый этап завершается проверкой типов, Go-тестами и сборкой. Раздел открывается только когда все его функции действительно работают — без заглушек и декоративных кнопок."
    />
  )
}
