package course

import (
	"os"
	"path/filepath"
	"testing"
)

func repoContentDir(t *testing.T) string {
	t.Helper()
	dir := filepath.Join("..", "..", "..", "content")
	if _, err := os.Stat(filepath.Join(dir, "course.json")); err != nil {
		t.Fatalf("не найден учебный контент в %s: %v", dir, err)
	}
	return dir
}

func TestLoadCourse(t *testing.T) {
	store := NewStore(repoContentDir(t))
	catalog, err := store.Load()
	if err != nil {
		t.Fatalf("загрузить курс: %v", err)
	}
	if len(catalog.Modules) != 14 {
		t.Errorf("модулей = %d, ожидалось 14", len(catalog.Modules))
	}
	if catalog.LessonCount != 104 {
		t.Errorf("уроков = %d, ожидалось 104", catalog.LessonCount)
	}
	if catalog.Title == "" {
		t.Error("название курса пустое")
	}
	for _, module := range catalog.Modules {
		if len(module.Lessons) == 0 {
			t.Errorf("модуль %s без уроков", module.ID)
		}
		for i, lesson := range module.Lessons {
			if lesson.Number != i+1 {
				t.Errorf("%s: номер урока %d, ожидался %d", lesson.ID, lesson.Number, i+1)
			}
			if lesson.ModuleID != module.ID {
				t.Errorf("%s: module_id = %s", lesson.ID, lesson.ModuleID)
			}
			if lesson.Title == "" || lesson.Summary == "" {
				t.Errorf("%s: пустое название или описание", lesson.ID)
			}
		}
	}
}

func TestFindAndFirstLesson(t *testing.T) {
	store := NewStore(repoContentDir(t))
	catalog, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}

	module, lesson, ok := catalog.FirstLesson()
	if !ok {
		t.Fatal("первый урок не найден")
	}
	if lesson.ID != "m01-01" {
		t.Errorf("первый урок = %s, ожидался m01-01", lesson.ID)
	}
	if module.ID != "m01" {
		t.Errorf("модуль первого урока = %s", module.ID)
	}

	if _, _, ok := catalog.Lesson("m04-02"); !ok {
		t.Error("урок m04-02 не найден")
	}
	if _, ok := catalog.Module("m14"); !ok {
		t.Error("модуль m14 не найден")
	}
	if _, ok := catalog.Module("nope"); ok {
		t.Error("найден несуществующий модуль")
	}
}

func TestSearchCatalog(t *testing.T) {
	store := NewStore(repoContentDir(t))
	catalog, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}

	results := SearchCatalog(catalog, "срез")
	if len(results) == 0 {
		t.Fatal("поиск «срез» ничего не нашёл")
	}
	found := false
	for _, result := range results {
		if result.ID == "m04-02" {
			found = true
			if result.Route != "/learning/m04-02" {
				t.Errorf("маршрут урока = %s", result.Route)
			}
		}
	}
	if !found {
		t.Error("в результатах нет урока о срезах")
	}

	if got := SearchCatalog(catalog, ""); got != nil {
		t.Errorf("пустой запрос вернул %d результатов", len(got))
	}
	if got := SearchCatalog(catalog, "   "); got != nil {
		t.Errorf("запрос из пробелов вернул %d результатов", len(got))
	}
}

func TestLessonAvailability(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "lessons", "m01"), 0o755); err != nil {
		t.Fatal(err)
	}
	courseJSON := `{
	  "title": "Тестовый курс",
	  "subtitle": "проверка",
	  "modules": [
	    {"id": "m01", "number": 1, "title": "Модуль", "summary": "", "level": "beginner",
	     "lessons": [
	       {"id": "m01-01", "title": "Первый", "summary": "s", "minutes": 5},
	       {"id": "m01-02", "title": "Второй", "summary": "s", "minutes": 5}
	     ]}
	  ]
	}`
	if err := os.WriteFile(filepath.Join(dir, "course.json"), []byte(courseJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "lessons", "m01", "m01-01.md"), []byte("# Урок"), 0o644); err != nil {
		t.Fatal(err)
	}

	catalog, err := NewStore(dir).Load()
	if err != nil {
		t.Fatal(err)
	}
	if catalog.ReadyCount != 1 {
		t.Errorf("готовых уроков = %d, ожидался 1", catalog.ReadyCount)
	}
	if !catalog.Modules[0].Lessons[0].Available {
		t.Error("урок с Markdown-файлом должен быть доступен")
	}
	if catalog.Modules[0].Lessons[1].Available {
		t.Error("урок без файла не должен быть доступен")
	}
}

func TestMissingContent(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), "nowhere"))
	if _, err := store.Load(); err == nil {
		t.Fatal("ожидалась ошибка при отсутствии content/course.json")
	}
}
