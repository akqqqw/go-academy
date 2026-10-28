#!/usr/bin/env bash
# Полная сборка: фронтенд в frontend/dist, backend в backend/bin/go-academy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d frontend/node_modules ]; then
  echo "→ Устанавливаем зависимости фронтенда"
  (cd frontend && npm install)
fi

echo "→ Собираем фронтенд"
(cd frontend && npm run build)

echo "→ Собираем backend"
(cd backend && go build -o bin/go-academy ./cmd/server)

echo
echo "Готово. Запуск:"
echo "  ./backend/bin/go-academy --data ./data --content ./content --frontend ./frontend/dist"
echo "  затем откройте http://127.0.0.1:8080"
