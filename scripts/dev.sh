#!/usr/bin/env bash
# Запускает backend на 127.0.0.1:8080 и dev-сервер Vite на 5173.
# Vite проксирует /api на backend, поэтому оба процесса работают вместе.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v go >/dev/null 2>&1; then
  echo "Не найден Go SDK. Установите Go 1.23+ и повторите." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Не найден npm. Установите Node.js 20+ и повторите." >&2
  exit 1
fi

if [ ! -d frontend/node_modules ]; then
  echo "→ Устанавливаем зависимости фронтенда"
  (cd frontend && npm install)
fi

echo "→ Собираем backend"
(cd backend && go build -o bin/go-academy ./cmd/server)

echo "→ Запускаем backend на http://127.0.0.1:8080"
(cd backend && ./bin/go-academy \
  --host 127.0.0.1 --port 8080 \
  --data ../data --content ../content --frontend ../frontend/dist) &
BACKEND_PID=$!

cleanup() {
  echo
  echo "→ Останавливаем backend"
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Запускаем Vite на http://localhost:5173"
(cd frontend && npm run dev)
