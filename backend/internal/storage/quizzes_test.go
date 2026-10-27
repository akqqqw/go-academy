package storage

import (
	"context"
	"testing"
)

func TestQuizAttemptsAndProgress(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	service := NewQuizzes(db)

	// Пустая история.
	progress, stats, err := service.Progress(ctx)
	if err != nil {
		t.Fatalf("прогресс: %v", err)
	}
	if len(progress) != 0 || stats.Attempts != 0 {
		t.Errorf("пустой прогресс = %v, %+v", progress, stats)
	}

	// Неудачная попытка: 3 из 6 — 50%.
	first, err := service.SaveAttempt(ctx, "m01-basics", "m01", 3, 6, 90_000,
		map[string][]string{"m01-q1": {"a"}})
	if err != nil {
		t.Fatalf("первая попытка: %v", err)
	}
	if first.Percent != 50 || first.Passed || first.ID == 0 || first.ModuleID != "m01" {
		t.Errorf("первая попытка = %+v", first)
	}
	if first.CreatedAt == "" {
		t.Error("нет времени попытки")
	}

	// Удачная попытка: 6 из 6.
	second, err := service.SaveAttempt(ctx, "m01-basics", "m01", 6, 6, 120_000, nil)
	if err != nil {
		t.Fatalf("вторая попытка: %v", err)
	}
	if second.Percent != 100 || !second.Passed {
		t.Errorf("вторая попытка = %+v", second)
	}

	// Попытка итогового теста без модуля.
	if _, err := service.SaveAttempt(ctx, "final-core", "", 5, 7, 60_000, nil); err != nil {
		t.Fatal(err)
	}

	progress, stats, err = service.Progress(ctx)
	if err != nil {
		t.Fatal(err)
	}
	entry := progress["m01-basics"]
	if entry.Attempts != 2 || entry.BestPct != 100 || entry.BestScore != 6 || entry.BestTotal != 6 {
		t.Errorf("прогресс m01-basics = %+v", entry)
	}
	if entry.LastScore != 6 || !entry.Passed || !entry.SolvedOnce {
		t.Errorf("последняя попытка = %+v", entry)
	}
	if _, ok := progress["final-core"]; !ok {
		t.Error("нет прогресса итогового теста")
	}
	if stats.Attempts != 3 || stats.Passed != 2 {
		t.Errorf("сводка = %+v", stats)
	}
	// Среднее: 50, 100, 71 → 74.
	if stats.Average != 74 || stats.Best != 100 {
		t.Errorf("среднее/лучшее = %d/%d", stats.Average, stats.Best)
	}

	// История викторины: свежие первыми.
	attempts, err := service.Attempts(ctx, "m01-basics", 10)
	if err != nil {
		t.Fatalf("история: %v", err)
	}
	if len(attempts) != 2 || attempts[0].ID != second.ID {
		t.Errorf("история = %+v", attempts)
	}

	all, err := service.History(ctx, 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Errorf("вся история = %d попыток, ожидалось 3", len(all))
	}

	// Некорректные данные отклоняются.
	if _, err := service.SaveAttempt(ctx, "", "", 1, 2, 0, nil); err == nil {
		t.Error("пустая викторина должна отклоняться")
	}
	if _, err := service.SaveAttempt(ctx, "x", "", 5, 2, 0, nil); err == nil {
		t.Error("score > total должен отклоняться")
	}
	if _, err := service.SaveAttempt(ctx, "x", "", -1, 2, -5, nil); err == nil {
		t.Error("отрицательный счёт должен отклоняться")
	}
}
