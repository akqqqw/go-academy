package course

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"goacademy/internal/runner"
)

func TestContentParsesFrontMatter(t *testing.T) {
	dir := t.TempDir()
	setupContent(t, dir)
	writeLesson(t, dir, "m01-01", `---
{
  "title": "Первый урок",
  "summary": "Коротко о главном",
  "minutes": 7,
  "objectives": ["Понять идею", "Запустить пример"]
}
---
## Теория

Текст урока.

`+"```go\npackage main\n\nfunc main() {}\n```"+`
`)

	store := NewStore(dir)
	if _, err := store.Load(); err != nil {
		t.Fatal(err)
	}
	content, err := store.Content("m01-01")
	if err != nil {
		t.Fatalf("прочитать урок: %v", err)
	}
	if content.Title != "Первый урок" || content.Minutes != 7 {
		t.Errorf("метаданные = %+v", content)
	}
	if len(content.Objectives) != 2 {
		t.Errorf("целей = %d", len(content.Objectives))
	}
	if content.Words == 0 {
		t.Error("не подсчитаны слова")
	}
	if !strings.Contains(content.Markdown, "## Теория") {
		t.Error("текст урока потерялся")
	}
}

func TestContentErrors(t *testing.T) {
	dir := t.TempDir()
	setupContent(t, dir)
	writeLesson(t, dir, "m01-01", "## Без front matter\n\nТекст\n")
	writeLesson(t, dir, "m01-02", "---\n{\"title\": \"Без целей\"}\n---\n## Текст\n")

	store := NewStore(dir)
	if _, err := store.Load(); err != nil {
		t.Fatal(err)
	}

	if _, err := store.Content("m01-01"); !errors.Is(err, ErrContentInvalid) {
		t.Errorf("без front matter: %v", err)
	}
	if _, err := store.Content("m01-02"); !errors.Is(err, ErrContentInvalid) {
		t.Errorf("без целей: %v", err)
	}
	if _, err := store.Content("m09-09"); !errors.Is(err, ErrLessonUnknown) {
		t.Errorf("несуществующий урок: %v", err)
	}
	if _, err := store.Content("m01-03"); !errors.Is(err, ErrContentMissing) {
		t.Errorf("урок без файла: %v", err)
	}
}

func TestAllRepoLessonsAreValid(t *testing.T) {
	dir := repoContentDir(t)
	store := NewStore(dir)
	catalog, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if catalog.ReadyCount == 0 {
		t.Fatal("в content/lessons нет ни одного урока")
	}
	if catalog.ReadyCount != len(allLessons(catalog)) {
		t.Errorf("готовых уроков = %d, а в программе %d", catalog.ReadyCount, len(allLessons(catalog)))
	}

	for _, module := range catalog.Modules {
		for _, lesson := range module.Lessons {
			if !lesson.Available {
				continue
			}
			content, err := store.Content(lesson.ID)
			if err != nil {
				t.Errorf("%s: %v", lesson.ID, err)
				continue
			}
			if len(content.Objectives) < 2 {
				t.Errorf("%s: целей меньше двух", lesson.ID)
			}
			for _, marker := range []string{"## ", "```go", "## Практика", "## Резюме"} {
				if !strings.Contains(content.Markdown, marker) {
					t.Errorf("%s: нет обязательного элемента %q", lesson.ID, marker)
				}
			}
			if len(content.Markdown) < 1500 {
				t.Errorf("%s: урок слишком короткий (%d символов)", lesson.ID, len(content.Markdown))
			}
		}
	}
}

func setupContent(t *testing.T, dir string) {
	t.Helper()
	writeFile(t, filepath.Join(dir, "course.json"), `{
	  "title": "Тестовый курс",
	  "subtitle": "проверка",
	  "modules": [
	    {"id": "m01", "number": 1, "title": "Модуль", "summary": "s", "level": "beginner",
	     "lessons": [
	       {"id": "m01-01", "title": "Первый", "summary": "s", "minutes": 5},
	       {"id": "m01-02", "title": "Второй", "summary": "s", "minutes": 5},
	       {"id": "m01-03", "title": "Третий", "summary": "s", "minutes": 5}
	     ]}
	  ]
	}`)
	if err := os.MkdirAll(filepath.Join(dir, "lessons", "m01"), 0o755); err != nil {
		t.Fatal(err)
	}
}

func writeLesson(t *testing.T, dir, lessonID, body string) {
	t.Helper()
	writeFile(t, filepath.Join(dir, "lessons", "m01", lessonID+".md"), body)
}

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestExtractStarterCode(t *testing.T) {
	markdown := strings.Join([]string{
		"## Теория",
		"```go",
		"package main // пример из теории, не стартовый код",
		"```",
		"",
		"## Практика",
		"**Задание.** Напишите программу.",
		"",
		"**Стартовый код:**",
		"",
		"```go",
		"package main",
		"",
		"func main() {",
		"    // ваш код",
		"}",
		"```",
		"",
		"**Подсказка.** Используйте fmt.",
		"",
		"## Резюме",
		"- итог",
	}, "\n")

	code := ExtractStarterCode(markdown)
	if !strings.Contains(code, "// ваш код") {
		t.Fatalf("взят не тот блок: %q", code)
	}
	if strings.Contains(code, "пример из теории") {
		t.Errorf("захвачен блок из теории: %q", code)
	}
	if !strings.HasSuffix(code, "}\n") {
		t.Errorf("код обрезан неверно: %q", code)
	}

	// Без раздела «Практика» стартового кода нет.
	if got := ExtractStarterCode("## Теория\n\n```go\npackage main\n```\n"); got != "" {
		t.Errorf("ожидалась пустая строка, получено %q", got)
	}
}

func TestRepoLessonsHaveStarterCode(t *testing.T) {
	store := NewStore(filepath.Join("..", "..", "..", "content"))
	catalog, err := store.Load()
	if err != nil {
		t.Fatalf("загрузить программу: %v", err)
	}
	for _, module := range catalog.Modules {
		for _, lesson := range module.Lessons {
			if !lesson.Available {
				continue
			}
			content, err := store.Content(lesson.ID)
			if err != nil {
				t.Fatalf("%s: %v", lesson.ID, err)
			}
			if content.StarterCode == "" {
				t.Errorf("%s: нет стартового кода в разделе «Практика»", lesson.ID)
				continue
			}
			if !strings.Contains(content.StarterCode, "package main") {
				t.Errorf("%s: стартовый код без package main:\n%s", lesson.ID, content.StarterCode)
			}
		}
	}
}

// TestRepoLessonStartersCompile проверяет, что стартовый код каждого готового
// урока компилируется без правок: в редакторе кнопка «Запустить» не должна
// сразу выдавать ошибку «imported and not used».
func TestRepoLessonStartersCompile(t *testing.T) {
	if _, err := exec.LookPath("go"); err != nil {
		t.Skip("go не найден в PATH: проверка компиляции стартового кода пропущена")
	}
	store := NewStore(filepath.Join("..", "..", "..", "content"))
	catalog, err := store.Load()
	if err != nil {
		t.Fatalf("загрузить программу: %v", err)
	}

	compiler := runner.New(runner.Config{
		Timeout: 20 * time.Second,
		MaxCode: 256 << 10,
	})

	for _, module := range catalog.Modules {
		for _, lesson := range module.Lessons {
			if !lesson.Available {
				continue
			}
			content, err := store.Content(lesson.ID)
			if err != nil {
				t.Fatalf("%s: %v", lesson.ID, err)
			}
			result, err := compiler.Build(context.Background(), content.StarterCode)
			if err != nil {
				t.Fatalf("%s: %v", lesson.ID, err)
			}
			if result.Status != runner.StatusOK {
				details := ""
				for _, diagnostic := range result.Diagnostics {
					details += fmt.Sprintf("\n  строка %d: %s", diagnostic.Line, diagnostic.Message)
				}
				t.Errorf("%s: стартовый код не компилируется (%s)%s", lesson.ID, result.Status, details)
			}
		}
	}
}

// allLessons возвращает идентификаторы всех уроков программы.
func allLessons(catalog *Catalog) []string {
	ids := make([]string, 0, 128)
	for _, module := range catalog.Modules {
		for _, lesson := range module.Lessons {
			ids = append(ids, lesson.ID)
		}
	}
	return ids
}

// goExamples вытаскивает все ```go блоки урока.
func goExamples(markdown string) []string {
	var blocks []string
	parts := strings.Split(markdown, "```go\n")
	for _, part := range parts[1:] {
		end := strings.Index(part, "```")
		if end < 0 {
			continue
		}
		code := strings.TrimSpace(part[:end])
		if code != "" {
			blocks = append(blocks, code+"\n")
		}
	}
	return blocks
}

// importsExternal сообщает, есть ли в блоке импорт не из стандартной библиотеки.
func importsExternal(code string) bool {
	for _, line := range strings.Split(code, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "\"") {
			continue
		}
		path := strings.Trim(strings.TrimSuffix(line, "\""), "\"")
		first := path
		if index := strings.Index(path, "/"); index >= 0 {
			first = path[:index]
		}
		if strings.Contains(first, ".") {
			return true
		}
	}
	return false
}

// TestRepoLessonExamplesCompile компилирует каждый полный Go-пример из уроков.
//
// Фрагменты без `package` не проверяются: они иллюстрируют синтаксис и не
// являются самостоятельной программой. Примеры, импортирующие сторонние
// модули, пропускаются — иначе тесту понадобилась бы сеть.
func TestRepoLessonExamplesCompile(t *testing.T) {
	if _, err := exec.LookPath("go"); err != nil {
		t.Skip("go не найден в PATH: проверка примеров пропущена")
	}
	store := NewStore(filepath.Join("..", "..", "..", "content"))
	catalog, err := store.Load()
	if err != nil {
		t.Fatalf("загрузить программу: %v", err)
	}

	compiler := runner.New(runner.Config{
		Timeout: 20 * time.Second,
		MaxCode: 256 << 10,
	})

	checked := 0
	for _, module := range catalog.Modules {
		for _, lesson := range module.Lessons {
			if !lesson.Available {
				continue
			}
			content, err := store.Content(lesson.ID)
			if err != nil {
				t.Fatalf("%s: %v", lesson.ID, err)
			}
			for index, code := range goExamples(content.Markdown) {
				if !strings.HasPrefix(code, "package ") || importsExternal(code) {
					continue
				}
				checked++
				result, err := compiler.Build(context.Background(), code)
				if err != nil {
					t.Fatalf("%s (пример %d): %v", lesson.ID, index+1, err)
				}
				if result.Status != runner.StatusOK {
					details := ""
					for _, diagnostic := range result.Diagnostics {
						details += fmt.Sprintf("\n  строка %d: %s", diagnostic.Line, diagnostic.Message)
					}
					t.Errorf("%s: пример %d не компилируется (%s)%s", lesson.ID, index+1, result.Status, details)
				}
			}
		}
	}
	if checked < 200 {
		t.Errorf("проверено примеров = %d, ожидалось не меньше 200", checked)
	}
}
