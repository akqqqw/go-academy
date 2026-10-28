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

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
