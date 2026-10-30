import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { loadRuntimeConfig } from '@/lib/runtime-config'
import '@/styles/index.css'

// Порядок важен: клиент Supabase создаётся при загрузке модуля `@/lib/supabase`,
// поэтому конфигурацию нужно получить до первого импорта приложения.
// Запрашиваем её у бэкенда только если переменные не встроили при сборке
// (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY). Так деплой, где эти переменные
// забыли задать в окружении проекта, всё равно умеет входить в аккаунт:
// адрес и publishable key приходят из GET /api/config.
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  await loadRuntimeConfig()
}

// App импортируется динамически уже после загрузки конфигурации.
const { default: App } = await import('@/App')

const container = document.getElementById('root')
if (!container) {
  throw new Error('Не найден корневой элемент #root')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
