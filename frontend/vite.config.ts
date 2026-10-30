import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Прокси на Go-сервер: фронтенд всегда обращается к относительному /api,
// поэтому одинаково работает и в dev-режиме, и в собранной версии.
//
// В браузере адрес бэкенда не нужен: в продакшене публичный /api маршрутизируется
// на сервис backend в vercel.json, а в dev-режиме — этим прокси. Поэтому переменная
// читается только сервером разработки и никогда не попадает в бандл (никаких VITE_).
const API_TARGET =
  process.env.GOACADEMY_API ??
  // BACKEND_URL выставляет сервисный binding Vercel при запуске `vercel dev`.
  process.env.BACKEND_URL ??
  'http://127.0.0.1:8080'

// Параметры Supabase попадают в статику на этапе сборки. Кроме обычных
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY принимаем имена, которые уже есть в
// окружении проекта на Vercel: в режиме сервисов переменные задаются на уровне
// проекта, поэтому сервис frontend видит SUPABASE_URL и PUBLIC_KEY (либо
// SUPABASE_ANON_KEY). Так деплой работает даже если VITE_* не завели.
// Значения всё равно публичные: тот же ключ отдаёт GET /api/config.js, а данные
// защищают RLS и проверка токена на сервере.
// Адрес проекта Supabase выводится из строки подключения postgres.<ref>@...
// так же, как это делает backend: SUPABASE_URL может быть не задан отдельно,
// а CONNECTION_URL/SUPABASE_DB_URL на проекте точно есть.
function supabaseURLFromDatabase(databaseURL: string | undefined): string {
  if (!databaseURL) return ''
  try {
    const username = decodeURIComponent(new URL(databaseURL).username)
    const ref = username.startsWith('postgres.') ? username.slice('postgres.'.length) : ''
    return ref ? `https://${ref}.supabase.co` : ''
  } catch {
    return ''
  }
}

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  supabaseURLFromDatabase(process.env.SUPABASE_DB_URL ?? process.env.CONNECTION_URL)
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.PUBLIC_KEY ??
  ''

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Подстановка в исходный код: приложение читает import.meta.env как обычно.
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Dev-сервер может открываться через прокси (например, preview-окно или
    // туннель), поэтому не ограничиваем Host-заголовок.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Выделяем тяжёлые библиотеки в отдельные чанки: они кэшируются браузером
        // и не увеличивают основной бандл.
        manualChunks(id) {
          // Служебный хелпер Vite для динамических импортов нужен основному
          // чанку: держим его рядом с React, иначе он «притянет» тяжёлый чанк
          // Monaco в стартовую загрузку.
          if (id.includes('preload-helper') || id.startsWith('\0vite')) return 'react'
          if (!id.includes('node_modules')) return undefined
          // Monaco нужен только на страницах с редактором: отдельный чанк
          // подгружается при открытии урока или редактора.
          if (/node_modules\/monaco-editor\//.test(id)) return 'monaco'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          // Остальные зависимости делятся по фактическому использованию:
          // тяжёлый Markdown уезжает в ленивый чанк страницы урока.
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
