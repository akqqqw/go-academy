package storage

import (
	"testing"
	"time"
)

// Дни сравниваются по календарю, а не по разнице моментов времени: в сутки
// перехода на летнее время 23 часа, и наивное `Sub == 24h` разрывало бы серию.
func TestCalcStreakAcrossDST(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Skip("нет tzdata для Europe/Berlin:", err)
	}

	// 29 марта 2026 — переход на летнее время в Европе (в сутках 23 часа).
	now := time.Date(2026, 3, 30, 9, 0, 0, 0, loc)
	days := []time.Time{
		time.Date(2026, 3, 28, 12, 0, 0, 0, loc),
		time.Date(2026, 3, 29, 23, 30, 0, 0, loc),
		time.Date(2026, 3, 30, 1, 0, 0, 0, loc),
	}

	current, longest, todayActive := CalcStreak(days, now)
	if current != 3 || longest != 3 || !todayActive {
		t.Fatalf("серия через переход на летнее время: current=%d longest=%d today=%v, ожидалось 3/3/true",
			current, longest, todayActive)
	}
}

// Осенний переход (25 часов в сутках) тоже не должен обрывать серию.
func TestCalcStreakAcrossAutumnDST(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Skip("нет tzdata для Europe/Berlin:", err)
	}

	// 25 октября 2026 — возврат на зимнее время.
	now := time.Date(2026, 10, 26, 8, 0, 0, 0, loc)
	days := []time.Time{
		time.Date(2026, 10, 24, 10, 0, 0, 0, loc),
		time.Date(2026, 10, 25, 10, 0, 0, 0, loc),
		time.Date(2026, 10, 26, 7, 0, 0, 0, loc),
	}

	current, longest, todayActive := CalcStreak(days, now)
	if current != 3 || longest != 3 || !todayActive {
		t.Fatalf("серия через возврат на зимнее время: current=%d longest=%d today=%v, ожидалось 3/3/true",
			current, longest, todayActive)
	}
}

// «Сегодня» берётся из часового пояса `now`, а не из пояса сервера: иначе на
// UTC-сервере серия обрывалась бы вечером по московскому времени.
func TestCalcStreakUsesProvidedTimezone(t *testing.T) {
	moscow, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Skip("нет tzdata для Europe/Moscow:", err)
	}

	// 23:30 по Москве — это ещё 20:30 UTC того же дня: «сегодня» должно
	// считаться по московскому календарю, а не по UTC.
	now := time.Date(2026, 5, 12, 23, 30, 0, 0, moscow)
	// Активность приходит в UTC: 00:10 UTC 12 мая — это 03:10 по Москве
	// (12-е), а 09:00 UTC 11 мая — 12:00 по Москве (11-е).
	days := []time.Time{
		time.Date(2026, 5, 12, 0, 10, 0, 0, time.UTC),
		time.Date(2026, 5, 11, 9, 0, 0, 0, time.UTC),
	}

	current, longest, todayActive := CalcStreak(days, now)
	if current != 2 || longest != 2 || !todayActive {
		t.Fatalf("серия по часовому поясу приложения: current=%d longest=%d today=%v, ожидалось 2/2/true",
			current, longest, todayActive)
	}
}

// Вчерашняя активность держит серию, пока сегодняшняя не появилась.
func TestCalcStreakYesterdayKeepsStreak(t *testing.T) {
	loc := time.UTC
	now := time.Date(2026, 1, 10, 12, 0, 0, 0, loc)
	days := []time.Time{
		time.Date(2026, 1, 9, 9, 0, 0, 0, loc),
		time.Date(2026, 1, 8, 9, 0, 0, 0, loc),
	}

	current, longest, todayActive := CalcStreak(days, now)
	if current != 2 || longest != 2 || todayActive {
		t.Fatalf("current=%d longest=%d today=%v, ожидалось 2/2/false", current, longest, todayActive)
	}
}
