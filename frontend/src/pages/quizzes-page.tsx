import { CheckSquare, Code2, HelpCircle, ListChecks, Puzzle } from 'lucide-react'

import { FeaturePreview } from '@/components/feature-preview'
import { Badge } from '@/components/ui/badge'
import { useMeta } from '@/services/queries'

export function QuizzesPage() {
  const meta = useMeta()
  const quizzes = meta.data?.content.quizzes ?? 0

  return (
    <FeaturePreview
      eyebrow="Проверка знаний"
      title="Тесты и викторины"
      description="Вопросы с одним и несколькими ответами, разбор кода, поиск ошибок и заполнение пропусков — с объяснением после ответа."
      icon={ListChecks}
      stage={7}
      stageLabel="Викторины реализуются на седьмом этапе."
      items={[
        {
          icon: CheckSquare,
          title: 'Пять типов вопросов',
          text: 'Один ответ, несколько ответов, вывод кода, поиск ошибки, пропуск в коде.',
        },
        {
          icon: Code2,
          title: 'Разбор кода',
          text: 'Фрагменты Go-кода с подсветкой синтаксиса и точным объяснением.',
        },
        {
          icon: HelpCircle,
          title: 'Объяснения',
          text: 'После ответа показывается правильный вариант и почему он верный.',
        },
        {
          icon: Puzzle,
          title: 'Итоговые тесты',
          text: 'После каждого модуля — проверка, результаты сохраняются в статистике.',
        },
      ]}
      status={
        <>
          <p>
            Наборов вопросов в каталоге <Badge variant="outline">{quizzes}</Badge>
          </p>
          <p>
            Таблицы quiz_attempts уже созданы, поэтому результаты тестов будут сразу учитываться в
            точности ответов и в плане на сегодня.
          </p>
        </>
      }
      note="После каждого этапа проверяются TypeScript, Go-тесты и сборка. Раздел появится вместе с контентом модулей, чтобы тесты проверяли именно то, что уже изучено."
    />
  )
}
