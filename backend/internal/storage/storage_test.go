package storage

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"goacademy/internal/database"
)

func newTestDB(t *testing.T) *database.DB {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("открыть базу: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestSettingsDefaultsAndPatch(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	settings := NewSettings(db)

	values, err := settings.All(ctx)
	if err != nil {
		t.Fatalf("прочитать настройки: %v", err)
	}
	if values["theme"] != "dark" {
		t.Errorf("тема по умолчанию = %v, ожидалось dark", values["theme"])
	}
	if values["daily_goal_exercises"] != 3 {
		t.Errorf("цель по задачам = %v, ожидалось 3", values["daily_goal_exercises"])
	}

	updated, err := settings.Patch(ctx, map[string]any{
		"theme":                "light",
		"daily_goal_exercises": float64(5),
		"sidebar_collapsed":    true,
	})
	if err != nil {
		t.Fatalf("обновить настройки: %v", err)
	}
	if updated["theme"] != "light" {
		t.Errorf("тема = %v, ожидалось light", updated["theme"])
	}
	if updated["daily_goal_exercises"] != 5 {
		t.Errorf("цель по задачам = %v, ожидалось 5", updated["daily_goal_exercises"])
	}
	if updated["sidebar_collapsed"] != true {
		t.Errorf("свёрнутая панель = %v, ожидалось true", updated["sidebar_collapsed"])
	}

	// Значения должны сохраняться между запросами (то есть в базе, а не в памяти).
	again, err := settings.All(ctx)
	if err != nil {
		t.Fatalf("перечитать настройки: %v", err)
	}
	if again["theme"] != "light" {
		t.Errorf("после перечитывания тема = %v", again["theme"])
	}
}

func TestSettingsValidation(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	settings := NewSettings(db)

	_, err := settings.Patch(ctx, map[string]any{
		"theme":              "neon",
		"daily_goal_minutes": 1000,
		"unknown_key":        "x",
	})
	if err == nil {
		t.Fatal("ожидалась ошибка валидации")
	}
	var validation *SettingsValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("неожиданный тип ошибки: %T", err)
	}
	if len(validation.Issues) != 3 {
		t.Fatalf("ожидалось 3 ошибки, получено %d: %+v", len(validation.Issues), validation.Issues)
	}

	// Невалидный запрос не должен ничего записывать.
	values, err := settings.All(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if values["theme"] != "dark" {
		t.Errorf("тема изменилась после неудачного запроса: %v", values["theme"])
	}
}

func TestActivityIncrementAndRange(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	activity := NewActivity(db)

	day, err := activity.AddStudy(ctx, 90)
	if err != nil {
		t.Fatalf("добавить время: %v", err)
	}
	if day.StudySeconds != 90 {
		t.Errorf("секунды = %d, ожидалось 90", day.StudySeconds)
	}

	day, err = activity.AddStudy(ctx, 30)
	if err != nil {
		t.Fatal(err)
	}
	if day.StudySeconds != 120 {
		t.Errorf("секунды = %d, ожидалось 120", day.StudySeconds)
	}

	if _, err := activity.AddStudy(ctx, 100000); err != nil {
		t.Fatal(err)
	}
	day, _ = activity.Today(ctx)
	if day.StudySeconds != 120+MaxStudySecondsPerPing {
		t.Errorf("секунды после большого пинга = %d", day.StudySeconds)
	}

	if _, err := activity.AddCounter(ctx, "drop_table", 1); err == nil {
		t.Error("ожидалась ошибка для неизвестного счётчика")
	}

	days, err := activity.Range(ctx, 7)
	if err != nil {
		t.Fatalf("диапазон: %v", err)
	}
	if len(days) != 7 {
		t.Fatalf("дней = %d, ожидалось 7", len(days))
	}
	if !days[6].Active() {
		t.Error("сегодняшний день должен быть активным")
	}
	for i := 0; i < 6; i++ {
		if days[i].Active() {
			t.Errorf("день %s не должен быть активным", days[i].Date)
		}
	}

	activeDays, err := activity.ActiveDays(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(activeDays) != 1 {
		t.Errorf("активных дней = %d, ожидался 1", len(activeDays))
	}
}

func TestBackupCreatesFile(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	backups := NewBackups(db, filepath.Dir(db.Path))
	backup, err := backups.CreateBackup(ctx)
	if err != nil {
		t.Fatalf("создать копию: %v", err)
	}
	if backup.SizeBytes == 0 {
		t.Error("размер копии равен нулю")
	}
	list, err := backups.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Errorf("копий = %d, ожидалась 1", len(list))
	}
}

func TestLessonsProgress(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	lessons := NewLessons(db)

	record, err := lessons.Open(ctx, "m01", "m01-01", "Что такое Go")
	if err != nil {
		t.Fatalf("открыть урок: %v", err)
	}
	if record.Status != "in_progress" {
		t.Errorf("статус = %s, ожидался in_progress", record.Status)
	}
	if record.LastOpenedAt == nil {
		t.Error("время открытия не сохранено")
	}

	// Повторное открытие не сбрасывает завершение.
	if _, err := lessons.Complete(ctx, "m01", "m01-01", "Что такое Go"); err != nil {
		t.Fatal(err)
	}
	reopened, err := lessons.Open(ctx, "m01", "m01-01", "Что такое Go")
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Status != "completed" || reopened.CompletedAt == nil {
		t.Errorf("завершённый урок сбросился: %+v", reopened)
	}

	if _, err := lessons.Get(ctx, "missing"); !errors.Is(err, ErrLessonNotFound) {
		t.Errorf("ожидалась ErrLessonNotFound, получено %v", err)
	}
}
