package database

import (
	"fmt"
	"sync/atomic"
	"time"

	// Часовые пояса встраиваются в бинарник: на Vercel нет /usr/share/zoneinfo,
	// поэтому time.LoadLocation("Europe/Moscow") без этого импорта падает в
	// serverless-окружении. Пакет добавляет ~450 КБ, зато «сегодня» и серия
	// дней считаются по часовому поясу пользователя, а не по UTC сервера.
	_ "time/tzdata"
)

// location хранит часовой пояс, в котором считаются «сегодня» и дни активности.
//
// По умолчанию — локальный пояс процесса (локальная разработка). В
// serverless-окружении он всегда UTC, поэтому приложение задаёт пояс явно
// через database.SetLocation, а значение приходит из APP_TIMEZONE.
var location atomic.Pointer[time.Location]

func init() {
	location.Store(time.Local)
}

// SetLocation задаёт часовой пояс для дат активности. Пустая зона означает
// «оставить как есть»; неизвестная зона возвращает ошибку, чтобы опечатка в
// конфигурации не превратилась молча в UTC.
func SetLocation(name string) error {
	if name == "" {
		return nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return fmt.Errorf("неизвестный часовой пояс %q: %w", name, err)
	}
	location.Store(loc)
	return nil
}

// Location возвращает действующий часовой пояс приложения.
func Location() *time.Location { return location.Load() }

// InLocation переводит момент времени в часовой пояс приложения.
func InLocation(t time.Time) time.Time { return t.In(Location()) }
