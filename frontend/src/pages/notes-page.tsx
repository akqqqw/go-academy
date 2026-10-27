import { FolderTree, Link2, NotebookPen, Tag } from 'lucide-react'

import { FeaturePreview } from '@/components/feature-preview'

export function NotesPage() {
  return (
    <FeaturePreview
      eyebrow="Личное"
      title="Заметки"
      description="Собственные записи по Go: Markdown, папки, теги и связь с уроками. Всё сохраняется в локальной базе."
      icon={NotebookPen}
      stage={5}
      stageLabel="Раздел заметок реализуется на пятом этапе."
      items={[
        {
          icon: NotebookPen,
          title: 'Markdown-редактор',
          text: 'Заголовки, списки, цитаты и подсветка блоков кода Go.',
        },
        {
          icon: FolderTree,
          title: 'Папки и закрепление',
          text: 'Структура записей, избранное и быстрый доступ.',
        },
        {
          icon: Tag,
          title: 'Теги и поиск',
          text: 'Мгновенный поиск по тексту, тегам и связанным урокам.',
        },
        {
          icon: Link2,
          title: 'Интеграция с уроками',
          text: 'Кнопка «Добавить заметку» и заметки из выделенного фрагмента теории.',
        },
      ]}
      status={
        <p>
          Таблицы заметок и тегов уже созданы в схеме SQLite. Следующий шаг — редактор, автосохранение
          и связь с уроками.
        </p>
      }
      note="Заметки не отправляются в сеть и не требуют аккаунта: база данных лежит в каталоге data/, а резервные копии создаются при каждом запуске."
    />
  )
}
