# Go Academy — команды для локальной разработки и сборки.
# Требуется Go 1.23+ и Node.js 20+.

GO ?= go
DATA_DIR ?= data
CONTENT_DIR ?= content
FRONTEND_DIR ?= frontend/dist
ADDR ?= 127.0.0.1:8080
RUN_TIMEOUT ?= 10

.PHONY: help install dev backend frontend build run test test-backend test-frontend clean fmt doctor

help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Установить зависимости фронтенда
	cd frontend && npm install

dev: ## Запустить backend и dev-сервер Vite одновременно
	./scripts/dev.sh

backend: ## Запустить только backend
	cd backend && $(GO) run ./cmd/server --data ../$(DATA_DIR) --content ../$(CONTENT_DIR) --frontend ../$(FRONTEND_DIR)

frontend: ## Запустить только dev-сервер фронтенда
	cd frontend && npm run dev

build: ## Собрать фронтенд и backend
	./scripts/build.sh

run: build ## Собрать и запустить приложение на одном порту
	./backend/bin/go-academy --data $(DATA_DIR) --content $(CONTENT_DIR) --frontend $(FRONTEND_DIR) --host $(ADDR) --run-timeout $(RUN_TIMEOUT)

doctor: ## Проверить, что найдены go и node
	@$(GO) version || echo "Go не найден: установите Go 1.23+"
	@node --version || echo "Node.js не найден: установите Node.js 20+"


test: test-backend test-frontend ## Все тесты

test-backend: ## Go-тесты и go vet
	cd backend && $(GO) vet ./... && $(GO) test ./...

test-frontend: ## TypeScript и тесты фронтенда
	cd frontend && npm run typecheck && npm test

fmt: ## Форматирование Go-кода
	cd backend && gofmt -w $$(find . -name '*.go' -not -path './vendor/*')

clean: ## Удалить артефакты сборки
	rm -rf backend/bin frontend/dist frontend/node_modules/.tmp
