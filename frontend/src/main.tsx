import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import { loadRuntimeConfig } from '@/lib/runtime-config'
import '@/styles/index.css'

// Конфигурацию Supabase забираем у бэкенда до загрузки приложения, но только
// если её не встроили при сборке (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).
// Так работают и сборки, где переменные забыли задать в окружении проекта:
// адрес и publishable key приходят из /api/config, а не из бандла.
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  await loadRuntimeConfig()
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Не найден корневой элемент #root')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
