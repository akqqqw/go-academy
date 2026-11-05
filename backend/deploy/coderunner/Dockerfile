# Изолированный сервис запуска Go-кода.
#
# Сборка (контекст — каталог backend/):
#   docker build -f deploy/coderunner/Dockerfile -t go-academy/coderunner .
#
# Запуск с ограничениями (рекомендуется):
#   docker network create --internal runner-net   # без выхода в интернет
#   docker run --rm --name coderunner --network runner-net \
#     --read-only --tmpfs /tmp:rw,nosuid,size=256m \
#     --cpus=1 --memory=512m --memory-swap=512m --pids-limit=128 \
#     --cap-drop=ALL --security-opt=no-new-privileges \
#     -e CODERUNNER_TOKEN=... -e CODERUNNER_CONCURRENCY=2 \
#     go-academy/coderunner
#
# Порт 8090 не публикуется наружу: API обращается к сервису по внутренней сети.
# Для жёсткой изоляции добавьте --runtime=runsc (gVisor).
#
# Подробности, лимиты и модель угроз — docs/CODE_RUNNER.md.
FROM golang:1.23-alpine AS build

WORKDIR /src
# Зависимости берутся из vendor: сборка не требует сети.
COPY go.mod go.sum ./
COPY vendor ./vendor
COPY cmd ./cmd
COPY internal ./internal

ENV CGO_ENABLED=0 GOFLAGS=-mod=vendor
RUN go build -trimpath -ldflags="-s -w" -o /out/coderunner ./cmd/coderunner

# В рантайме нужен сам Go-тулчейн: он компилирует код ученика.
FROM golang:1.23-alpine

# Непривилегированный пользователь: даже при компрометации нет root в контейнере.
RUN addgroup -g 10001 -S runner && adduser -u 10001 -S -G runner -h /tmp runner

COPY --from=build /out/coderunner /usr/local/bin/coderunner

# Каталоги для кеша сборки и временных запусков. При --read-only /tmp должен
# быть tmpfs (см. команду запуска выше); exec на нём нужен — из /tmp запускается
# скомпилированный бинарник ученика.
ENV HOME=/tmp \
    GOCACHE=/tmp/gocache \
    GOPATH=/tmp/gopath \
    GOTMPDIR=/tmp \
    GOFLAGS=-mod=mod \
    CODERUNNER_CACHE_DIR=/tmp/gocache \
    CODERUNNER_WORK_DIR=/tmp/runs

EXPOSE 8090
USER 10001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8090/healthz > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/coderunner"]
