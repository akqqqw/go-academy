package storage

import (
	"context"
	"testing"

	"goacademy/internal/database"
)

func TestAchievementsProgressAndUnlock(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	activity := NewActivity(db)
	notes := NewNotes(db)
	achievements := NewAchievements(db, activity, notes)

	// Пустая база: ничего не открыто, прогресс нулевой.
	list, stats, err := achievements.List(ctx, map[string]int{})
	if err != nil {
		t.Fatalf("достижения: %v", err)
	}
	if len(list) != len(AchievementDefinitions) {
		t.Fatalf("достижений = %d, ожидалось %d", len(list), len(AchievementDefinitions))
	}
	if stats.Unlocked != 0 || stats.Percent != 0 || stats.Total != len(AchievementDefinitions) {
		t.Errorf("сводка пустой базы = %+v", stats)
	}

	// Преодолеваем порог «первый шаг»: урок завершён.
	lessons := NewLessons(db)
	if _, err := lessons.Complete(ctx, "m01", "m01-01", "Что такое Go"); err != nil {
		t.Fatal(err)
	}
	list, stats, err = achievements.List(ctx, map[string]int{MetricModules: 1})
	if err != nil {
		t.Fatal(err)
	}
	first := findAchievement(t, list, "first-step")
	if !first.Unlocked || first.Percent != 100 || first.UnlockedAt == "" {
		t.Errorf("first-step = %+v", first)
	}
	module := findAchievement(t, list, "module-master")
	if !module.Unlocked {
		t.Errorf("module-master = %+v", module)
	}
	five := findAchievement(t, list, "five-lessons")
	if five.Unlocked || five.Current != 1 || five.Remaining != 4 || five.Percent != 20 {
		t.Errorf("five-lessons = %+v", five)
	}
	if stats.Unlocked != 2 || stats.New != 2 {
		t.Errorf("после первого урока = %+v", stats)
	}

	// Повторная проверка: открытия уже записаны, «новых» нет.
	_, stats, err = achievements.List(ctx, map[string]int{MetricModules: 1})
	if err != nil {
		t.Fatal(err)
	}
	if stats.New != 0 || stats.Unlocked != 2 {
		t.Errorf("повторная проверка = %+v", stats)
	}
	// Время открытия сохранилось в базе.
	var stored int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM achievements").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != 2 {
		t.Errorf("в базе достижений = %d, ожидалось 2", stored)
	}

	// Серия дней и время занятий подтягиваются из активности.
	// AddStudy ограничивает один запрос 15 минутами, поэтому копим частями.
	for i := 0; i < 4; i++ {
		if _, err := activity.AddStudy(ctx, 900); err != nil {
			t.Fatal(err)
		}
	}
	list, _, err = achievements.List(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	hour := findAchievement(t, list, "hour-study")
	if hour.Current != 60 || !hour.Unlocked {
		t.Errorf("hour-study = %+v", hour)
	}
	streak := findAchievement(t, list, "streak-3")
	if streak.Current < 1 || streak.Unlocked {
		t.Errorf("streak-3 = %+v", streak)
	}

	// Заметки и точные тесты тоже считаются.
	if _, err := notes.Create(ctx, NoteInput{Body: "# Заметка\n\nТекст."}); err != nil {
		t.Fatal(err)
	}
	quizzes := NewQuizzes(db)
	if _, err := quizzes.SaveAttempt(ctx, "final-core", "", 7, 7, 1000, nil); err != nil {
		t.Fatal(err)
	}
	list, _, err = achievements.List(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if note := findAchievement(t, list, "first-note"); !note.Unlocked {
		t.Errorf("first-note = %+v", note)
	}
	if perfect := findAchievement(t, list, "perfect-quiz"); !perfect.Unlocked {
		t.Errorf("perfect-quiz = %+v", perfect)
	}
	// Неудачная попытка не добавляет сданных тестов.
	if _, err := quizzes.SaveAttempt(ctx, "m01-basics", "m01", 1, 6, 1000, nil); err != nil {
		t.Fatal(err)
	}
	list, _, err = achievements.List(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if quiz := findAchievement(t, list, "first-quiz"); !quiz.Unlocked || quiz.Current != 1 {
		t.Errorf("first-quiz = %+v", quiz)
	}

	// Последние открытые достижения — в обратном порядке по времени.
	recent, err := achievements.Recent(ctx, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(recent) == 0 || len(recent) > 3 {
		t.Errorf("последние достижения = %d", len(recent))
	}
	for _, item := range recent {
		if !item.Unlocked || item.UnlockedAt == "" {
			t.Errorf("последнее достижение = %+v", item)
		}
	}
}

func TestAchievementsOrderAndTiers(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	service := NewAchievements(db, NewActivity(db), NewNotes(db))

	list, stats, err := service.List(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	// Открытые идут первыми: сначала открываем одно достижение.
	if _, err := NewLessons(db).Complete(ctx, "m01", "m01-01", "Урок"); err != nil {
		t.Fatal(err)
	}
	list, stats, err = service.List(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !list[0].Unlocked {
		t.Errorf("первым должен идти открытый элемент: %+v", list[0])
	}
	if stats.Bronze+stats.Silver+stats.Gold != stats.Unlocked {
		t.Errorf("разбивка по уровням = %+v", stats)
	}
	codes := map[string]bool{}
	for _, item := range list {
		if codes[item.Code] {
			t.Errorf("достижение %q повторяется", item.Code)
		}
		codes[item.Code] = true
		if item.Title == "" || item.Description == "" || item.Icon == "" || item.Target <= 0 {
			t.Errorf("пустые поля у %q", item.Code)
		}
	}
	_ = database.Now()
}

func findAchievement(t *testing.T, list []Achievement, code string) Achievement {
	t.Helper()
	for _, item := range list {
		if item.Code == code {
			return item
		}
	}
	t.Fatalf("достижение %q не найдено", code)
	return Achievement{}
}
