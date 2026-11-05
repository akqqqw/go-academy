package database

import (
	"testing"
	"time"
)

// Часовой пояс приложения влияет на «сегодня»: именно эта дата попадает в
// activity_days и определяет серию дней.
func TestSetLocationAffectsToday(t *testing.T) {
	previous := Location()
	t.Cleanup(func() { _ = SetLocation(previous.String()) })

	if err := SetLocation("Europe/Moscow"); err != nil {
		t.Fatalf("SetLocation(Europe/Moscow): %v", err)
	}
	want := time.Now().In(Location()).Format("2006-01-02")
	if got := Today(); got != want {
		t.Fatalf("Today() = %q, ожидалось %q", got, want)
	}

	moscow, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Fatalf("LoadLocation: %v", err)
	}
	if offset := time.Now().In(moscow).Format("-07:00"); offset != "+03:00" {
		t.Fatalf("смещение Europe/Moscow = %q, ожидалось +03:00", offset)
	}
}

// Пояса по разные стороны линии перемены дат дают разные «сегодня» в один и тот
// же момент времени — проверяем, что переключение действительно работает.
func TestTodayDependsOnLocation(t *testing.T) {
	previous := Location()
	t.Cleanup(func() { _ = SetLocation(previous.String()) })

	if err := SetLocation("Pacific/Kiritimati"); err != nil {
		t.Skip("нет tzdata для Pacific/Kiritimati:", err)
	}
	east := Today()

	if err := SetLocation("Etc/GMT+12"); err != nil {
		t.Skip("нет tzdata для Etc/GMT+12:", err)
	}
	west := Today()

	if east == west {
		t.Fatalf("даты в поясах UTC+14 и UTC-12 совпали (%q): переключение пояса не применяется", east)
	}
	if !(east > west) {
		t.Fatalf("в UTC+14 дата должна быть не раньше, чем в UTC-12: east=%q west=%q", east, west)
	}
}

// Опечатка в часовом поясе должна возвращать ошибку, а не тихо оставлять UTC.
func TestSetLocationRejectsUnknownZone(t *testing.T) {
	if err := SetLocation("Mars/Olympus_Mons"); err == nil {
		t.Fatal("ожидалась ошибка для неизвестного часового пояса")
	}
	if err := SetLocation(""); err != nil {
		t.Fatalf("пустой пояс должен оставлять текущий: %v", err)
	}
}

// ParseTime разбирает время с учётом пояса приложения.
func TestParseTimeUsesLocation(t *testing.T) {
	previous := Location()
	t.Cleanup(func() { _ = SetLocation(previous.String()) })

	if err := SetLocation("Europe/Moscow"); err != nil {
		t.Fatalf("SetLocation: %v", err)
	}
	parsed, err := ParseTime("2026-05-12T23:30:00+03:00")
	if err != nil {
		t.Fatalf("ParseTime: %v", err)
	}
	if parsed.Format("2006-01-02") != "2026-05-12" {
		t.Fatalf("дата = %q, ожидалось 2026-05-12", parsed.Format("2006-01-02"))
	}
	if Now() == "" || len(Today()) != len("2006-01-02") {
		t.Fatalf("Now()/Today() вернули некорректные значения: %q / %q", Now(), Today())
	}
}
