package storage

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
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

func TestExerciseProgressRecordsAttempts(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	progress := NewExerciseProgress(db)

	if _, _, err := progress.Record(ctx, ExerciseAttempt{ExerciseID: "sum-two", Status: "test_failed", Passed: 1, Total: 3, DurationMs: 40, Code: "package main"}); err != nil {
		t.Fatalf("записать попытку: %v", err)
	}
	stat, justSolved, err := progress.Record(ctx, ExerciseAttempt{ExerciseID: "sum-two", Status: "ok", Passed: 3, Total: 3, DurationMs: 25, Code: "package main"})
	if err != nil {
		t.Fatalf("записать попытку: %v", err)
	}
	if !justSolved {
		t.Error("первое успешное решение должно помечаться как новое")
	}
	if !stat.Solved || stat.Attempts != 2 || stat.BestPassed != 3 || stat.SolvedAt == "" {
		t.Fatalf("сводка = %+v", stat)
	}
	if stat.LastStatus != "ok" {
		t.Errorf("последний статус = %q", stat.LastStatus)
	}

	// Второе задание осталось нерешённым.
	if _, _, err := progress.Record(ctx, ExerciseAttempt{ExerciseID: "fizz-buzz", Status: "compile_error", Passed: 0, Total: 4}); err != nil {
		t.Fatalf("записать попытку: %v", err)
	}
	// Повторное решение не должно считаться новым.
	_, justSolvedAgain, err := progress.Record(ctx, ExerciseAttempt{ExerciseID: "sum-two", Status: "ok", Passed: 3, Total: 3})
	if err != nil {
		t.Fatalf("записать попытку: %v", err)
	}
	if justSolvedAgain {
		t.Error("повторное решение не должно увеличивать дневной счётчик")
	}
	stats, err := progress.Stats(ctx)
	if err != nil {
		t.Fatalf("статистика: %v", err)
	}
	if len(stats) != 2 {
		t.Fatalf("заданий в статистике = %d", len(stats))
	}
	if stats["fizz-buzz"].Solved {
		t.Error("compile_error не может считаться решением")
	}

	overview, err := progress.Overview(ctx)
	if err != nil {
		t.Fatalf("обзор: %v", err)
	}
	if overview.Solved != 1 || overview.InProgress != 1 || overview.Attempts != 4 {
		t.Errorf("обзор = %+v", overview)
	}

	attempts, err := progress.Attempts(ctx, "sum-two", 10)
	if err != nil {
		t.Fatalf("история: %v", err)
	}
	if len(attempts) != 3 || attempts[0].Status != "ok" {
		t.Fatalf("история = %+v", attempts)
	}
	if attempts[0].CreatedAt == "" || attempts[1].Code == "" {
		t.Errorf("попытка не сохранила код или время: %+v", attempts[1])
	}
}

func TestNotesCRUDAndTags(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	notes := NewNotes(db)

	created, err := notes.Create(ctx, NoteInput{
		Body: "## Срезы\n\nСрез — это окно в массив.\n\n`append` расширяет срез.",
		Tags: []string{"Срезы", "срезы", "#память", "плохой тег!", ""},
	})
	if err != nil {
		t.Fatalf("создать заметку: %v", err)
	}
	if created.Title != "Срезы" {
		t.Errorf("заголовок из первой строки = %q", created.Title)
	}
	if created.Folder != DefaultFolder {
		t.Errorf("папка по умолчанию = %q", created.Folder)
	}
	if len(created.Tags) != 2 || created.Tags[0] != "память" || created.Tags[1] != "срезы" {
		t.Errorf("теги = %#v, ожидались [память срезы]", created.Tags)
	}
	if created.Words == 0 || created.Excerpt == "" {
		t.Errorf("не посчитаны слова или выдержка: %+v", created)
	}
	if created.ID == "" {
		t.Fatal("нет идентификатора")
	}

	// Обновление меняет папку, теги и признак закрепления.
	updated, err := notes.Update(ctx, created.ID, NoteInput{
		Title:  "Срезы и массивы",
		Body:   "Срез — окно в массив.",
		Folder: "Уроки",
		Pinned: true,
		Tags:   []string{"срезы"},
	})
	if err != nil {
		t.Fatalf("обновить заметку: %v", err)
	}
	if updated.Title != "Срезы и массивы" || updated.Folder != "Уроки" || !updated.Pinned {
		t.Errorf("заметка после обновления: %+v", updated)
	}
	if len(updated.Tags) != 1 {
		t.Errorf("теги после обновления = %#v", updated.Tags)
	}

	// Папка «Уроки» была заведена миграцией, поэтому её счётчик вырос.
	folders, err := notes.Folders(ctx)
	if err != nil {
		t.Fatalf("папки: %v", err)
	}
	if len(folders) != 2 {
		t.Fatalf("папок = %d, ожидалось 2: %+v", len(folders), folders)
	}
	if folders[1].Name != "Уроки" || folders[1].Count != 1 {
		t.Errorf("папка «Уроки» = %+v", folders[1])
	}

	if err := notes.Delete(ctx, created.ID); err != nil {
		t.Fatalf("удалить заметку: %v", err)
	}
	if _, err := notes.Get(ctx, created.ID); !errors.Is(err, ErrNoteNotFound) {
		t.Errorf("после удаления ошибка = %v, ожидалась ErrNoteNotFound", err)
	}
}

func TestNotesFiltersAndSearch(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	notes := NewNotes(db)

	first, err := notes.Create(ctx, NoteInput{
		Title:  "Горутины",
		Body:   "Запуск через go f().",
		Folder: "Общее",
		Tags:   []string{"конкурентность"},
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := notes.Create(ctx, NoteInput{
		Title:    "Каналы",
		Body:     "Канал передаёт значения между горутинами.",
		Folder:   "Уроки",
		LessonID: "m11-02",
		Tags:     []string{"конкурентность", "каналы"},
		Pinned:   true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := notes.Create(ctx, NoteInput{Title: "Интерфейсы", Body: "Неявная реализация."}); err != nil {
		t.Fatal(err)
	}

	all, err := notes.List(ctx, NoteFilter{})
	if err != nil {
		t.Fatalf("список: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("заметок = %d, ожидалось 3", len(all))
	}
	if !all[0].Pinned || all[0].ID != second.ID {
		t.Errorf("закреплённая заметка должна быть первой: %+v", all[0])
	}

	byFolder, _ := notes.List(ctx, NoteFilter{Folder: "Уроки"})
	if len(byFolder) != 1 || byFolder[0].ID != second.ID {
		t.Errorf("фильтр по папке = %d заметок", len(byFolder))
	}
	byTag, _ := notes.List(ctx, NoteFilter{Tag: "конкурентность"})
	if len(byTag) != 2 {
		t.Errorf("фильтр по тегу = %d заметок, ожидалось 2", len(byTag))
	}
	byLesson, _ := notes.List(ctx, NoteFilter{LessonID: "m11-02"})
	if len(byLesson) != 1 || byLesson[0].ID != second.ID {
		t.Errorf("фильтр по уроку = %+v", byLesson)
	}
	byQuery, _ := notes.List(ctx, NoteFilter{Query: "ГОРУТИН"})
	if len(byQuery) != 2 {
		t.Errorf("поиск по тексту = %d заметок, ожидалось 2", len(byQuery))
	}
	pinned, _ := notes.List(ctx, NoteFilter{Pinned: true})
	if len(pinned) != 1 {
		t.Errorf("закреплённых = %d", len(pinned))
	}

	tags, err := notes.Tags(ctx)
	if err != nil {
		t.Fatalf("теги: %v", err)
	}
	if len(tags) != 2 || tags[0].Tag != "конкурентность" || tags[0].Count != 2 {
		t.Errorf("теги = %+v", tags)
	}

	stats, err := notes.Stats(ctx)
	if err != nil {
		t.Fatalf("статистика: %v", err)
	}
	if stats.Total != 3 || stats.Pinned != 1 || stats.Linked != 1 || stats.Tags != 2 {
		t.Errorf("статистика = %+v", stats)
	}
	if first.Words == 0 || stats.Words == 0 {
		t.Errorf("слова не считаются: %+v", stats)
	}
	// Свежесозданные заметки попадают в счётчик «за неделю».
	if stats.ThisWeek != 3 {
		t.Errorf("this_week = %d, ожидалось 3", stats.ThisWeek)
	}
	if stats.WithLesson != stats.Linked {
		t.Errorf("with_lesson = %d, linked = %d", stats.WithLesson, stats.Linked)
	}
}

func TestNotesValidationAndFolders(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	notes := NewNotes(db)

	if _, err := notes.Create(ctx, NoteInput{}); !errors.Is(err, ErrNoteInvalid) {
		t.Errorf("пустая заметка: ошибка = %v", err)
	}
	if _, err := notes.Create(ctx, NoteInput{Title: strings.Repeat("я", MaxNoteTitle+20)}); err != nil {
		t.Fatalf("длинный заголовок должен обрезаться: %v", err)
	}

	folder, err := notes.CreateFolder(ctx, "Шпаргалки")
	if err != nil {
		t.Fatalf("создать папку: %v", err)
	}
	if _, err := notes.CreateFolder(ctx, "Шпаргалки"); !errors.Is(err, ErrFolderExists) {
		t.Errorf("дубликат папки: ошибка = %v", err)
	}

	note, err := notes.Create(ctx, NoteInput{Title: "Памятка", Body: "текст", Folder: "Шпаргалки"})
	if err != nil {
		t.Fatalf("заметка в новую папку: %v", err)
	}
	if note.Folder != "Шпаргалки" {
		t.Errorf("папка заметки = %q", note.Folder)
	}

	if _, err := notes.RenameFolder(ctx, folder.ID, "Шпаргалки Go"); err != nil {
		t.Fatalf("переименовать папку: %v", err)
	}
	renamed, err := notes.Get(ctx, note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Folder != "Шпаргалки Go" {
		t.Errorf("заметка не переехала: %q", renamed.Folder)
	}

	// Папку «Общее» удалять нельзя, остальные — можно, заметки переезжают.
	folders, _ := notes.Folders(ctx)
	var generalID string
	for _, item := range folders {
		if item.Name == DefaultFolder {
			generalID = item.ID
		}
	}
	if err := notes.DeleteFolder(ctx, generalID); !errors.Is(err, ErrNoteInvalid) {
		t.Errorf("удаление «Общее»: ошибка = %v", err)
	}
	if err := notes.DeleteFolder(ctx, folder.ID); err != nil {
		t.Fatalf("удалить папку: %v", err)
	}
	moved, _ := notes.Get(ctx, note.ID)
	if moved.Folder != DefaultFolder {
		t.Errorf("заметка не переехала в «Общее»: %q", moved.Folder)
	}

	// Заметка с новой папкой создаёт её автоматически.
	if _, err := notes.Create(ctx, NoteInput{Title: "Новая", Body: "текст", Folder: "Идеи"}); err != nil {
		t.Fatalf("создать заметку с новой папкой: %v", err)
	}
	folders, _ = notes.Folders(ctx)
	found := false
	for _, item := range folders {
		if item.Name == "Идеи" {
			found = true
		}
	}
	if !found {
		t.Error("папка «Идеи» не создалась автоматически")
	}
}
