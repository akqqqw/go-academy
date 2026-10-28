package progress

import (
	"testing"
	"time"

	"goacademy/internal/storage"
)

func TestCalcStreak(t *testing.T) {
	location := time.Local
	now := time.Date(2026, 3, 15, 12, 30, 0, 0, location)
	day := func(offset int) time.Time {
		return now.AddDate(0, 0, offset)
	}

	tests := []struct {
		name        string
		days        []time.Time
		wantCurrent int
		wantLongest int
		wantToday   bool
	}{
		{
			name: "нет активности",
		},
		{
			name:        "только сегодня",
			days:        []time.Time{day(0)},
			wantCurrent: 1,
			wantLongest: 1,
			wantToday:   true,
		},
		{
			name:        "сегодня и вчера",
			days:        []time.Time{day(0), day(-1)},
			wantCurrent: 2,
			wantLongest: 2,
			wantToday:   true,
		},
		{
			name:        "серия закончилась вчера",
			days:        []time.Time{day(-1), day(-2), day(-3)},
			wantCurrent: 3,
			wantLongest: 3,
			wantToday:   false,
		},
		{
			name:        "серия прервана позавчера",
			days:        []time.Time{day(-2), day(-3), day(-4)},
			wantCurrent: 0,
			wantLongest: 3,
			wantToday:   false,
		},
		{
			name:        "рекорд был раньше",
			days:        []time.Time{day(0), day(-1), day(-10), day(-11), day(-12), day(-13)},
			wantCurrent: 2,
			wantLongest: 4,
			wantToday:   true,
		},
		{
			name:        "дубликаты дат не ломают подсчёт",
			days:        []time.Time{day(0), day(0), day(-1), day(-1)},
			wantCurrent: 2,
			wantLongest: 2,
			wantToday:   true,
		},
		{
			name:        "серия через границу месяца",
			days:        []time.Time{day(0), day(-1), day(-2)},
			wantCurrent: 3,
			wantLongest: 3,
			wantToday:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			current, longest, todayActive := CalcStreak(tc.days, now)
			if current != tc.wantCurrent {
				t.Errorf("current = %d, ожидалось %d", current, tc.wantCurrent)
			}
			if longest != tc.wantLongest {
				t.Errorf("longest = %d, ожидалось %d", longest, tc.wantLongest)
			}
			if todayActive != tc.wantToday {
				t.Errorf("todayActive = %v, ожидалось %v", todayActive, tc.wantToday)
			}
		})
	}
}

func TestBuildPlan(t *testing.T) {
	goals := Goals{Minutes: 15, Exercises: 3, Cards: 10}
	today := storage.Day{
		Date:          "2026-03-15",
		StudySeconds:  1200,
		LessonsOpened: 1,
		LessonsDone:   1,
		ExercisesDone: 1,
		CardsReviewed: 10,
		QuizzesDone:   0,
	}

	items := BuildPlan(today, goals)
	if len(items) != 4 {
		t.Fatalf("ожидалось 4 пункта плана, получено %d", len(items))
	}
	byID := map[string]PlanItem{}
	for _, item := range items {
		byID[item.ID] = item
	}

	if !byID["lesson"].Done {
		t.Error("пункт «Продолжить урок» должен быть выполнен")
	}
	if byID["exercises"].Done {
		t.Error("пункт «Решить задачи» не должен быть выполнен (1 из 3)")
	}
	if !byID["cards"].Done {
		t.Error("пункт «Повторить карточки» должен быть выполнен (10 из 10)")
	}
	if byID["quiz"].Done {
		t.Error("пункт «Пройти мини-тест» не должен быть выполнен")
	}
	if byID["exercises"].Target != 3 {
		t.Errorf("цель по задачам = %d, ожидалось 3", byID["exercises"].Target)
	}
}

func TestPercent(t *testing.T) {
	cases := []struct{ part, total, want int }{
		{0, 0, 0},
		{1, 3, 33},
		{3, 3, 100},
		{5, 3, 100},
	}
	for _, tc := range cases {
		if got := percent(tc.part, tc.total); got != tc.want {
			t.Errorf("percent(%d, %d) = %d, ожидалось %d", tc.part, tc.total, got, tc.want)
		}
	}
}
