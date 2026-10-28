package storage

import (
	"sort"
	"time"
)

// CalcStreak считает текущую и рекордную серию дней подряд.
//
// Серия «жива», если сегодня или вчера была активность: иначе она прервана.
func CalcStreak(days []time.Time, now time.Time) (current, longest int, todayActive bool) {
	unique := map[string]time.Time{}
	for _, day := range days {
		local := day.In(now.Location())
		unique[local.Format("2006-01-02")] = truncateDay(local)
	}
	if len(unique) == 0 {
		return 0, 0, false
	}

	// Рекордная серия: проходим по всем дням по возрастанию.
	ordered := make([]time.Time, 0, len(unique))
	for _, day := range unique {
		ordered = append(ordered, day)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Before(ordered[j]) })
	run := 1
	longest = 1
	for i := 1; i < len(ordered); i++ {
		if ordered[i].Sub(ordered[i-1]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	today := truncateDay(now)
	_, hasToday := unique[today.Format("2006-01-02")]
	yesterday := today.AddDate(0, 0, -1)
	_, hasYesterday := unique[yesterday.Format("2006-01-02")]
	todayActive = hasToday

	cursor := today
	if !hasToday {
		if !hasYesterday {
			return 0, longest, false
		}
		cursor = yesterday
	}
	for {
		if _, ok := unique[cursor.Format("2006-01-02")]; !ok {
			break
		}
		current++
		cursor = cursor.AddDate(0, 0, -1)
	}
	return current, longest, todayActive
}

func truncateDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
