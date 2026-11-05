package storage

import (
	"sort"
	"time"
)

// CalcStreak считает текущую и рекордную серию дней подряд.
//
// Серия «жива», если сегодня или вчера была активность: иначе она прервана.
// Дни сравниваются по календарю (номера суток), а не по разнице моментов
// времени: в дни перехода на летнее/зимнее время сутки длятся 23 или 25 часов,
// и `Sub` вернул бы 23h/25h вместо «один день». `now` задаёт и «сегодня», и
// часовой пояс — вызывающая сторона передаёт момент в часовом поясе
// приложения (см. database.Location).
func CalcStreak(days []time.Time, now time.Time) (current, longest int, todayActive bool) {
	seen := map[int]bool{}
	for _, day := range days {
		local := day.In(now.Location())
		seen[dayNumber(local)] = true
	}
	if len(seen) == 0 {
		return 0, 0, false
	}

	// Рекордная серия: проходим по всем дням по возрастанию.
	ordered := make([]int, 0, len(seen))
	for day := range seen {
		ordered = append(ordered, day)
	}
	sort.Ints(ordered)
	run := 1
	longest = 1
	for i := 1; i < len(ordered); i++ {
		if ordered[i]-ordered[i-1] == 1 {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	today := dayNumber(now)
	_, hasToday := seen[today]
	todayActive = hasToday
	_, hasYesterday := seen[today-1]

	cursor := today
	if !hasToday {
		if !hasYesterday {
			return 0, longest, false
		}
		cursor = today - 1
	}
	for seen[cursor] {
		current++
		cursor--
	}
	return current, longest, todayActive
}

// dayNumber возвращает номер календарных суток для даты в её часовом поясе.
//
// Полночь берётся в UTC, поэтому результат не зависит от переходов на летнее
// время: важны только год, месяц и день календаря пользователя.
func dayNumber(t time.Time) int {
	utc := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	return int(utc.Unix() / 86_400)
}
