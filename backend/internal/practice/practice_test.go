package practice

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"goacademy/internal/course"
	"goacademy/internal/runner"
)

// repositoryContentPath — путь к content/ из каталога пакета.
func repositoryContentPath() string { return filepath.Join("..", "..", "..", "content") }

func newRepoStore(t *testing.T) *Store {
	t.Helper()
	dir := repositoryContentPath()
	if _, err := os.Stat(filepath.Join(dir, "course.json")); err != nil {
		t.Skipf("контент курса не найден: %v", err)
	}
	return NewStore(dir, course.NewStore(dir))
}

func TestRepositoryCatalogIsValid(t *testing.T) {
	store := newRepoStore(t)

	list, stats, err := store.List()
	if err != nil {
		t.Fatalf("каталог заданий: %v", err)
	}
	if len(list) != 30 {
		t.Fatalf("заданий = %d, ожидалось 30", len(list))
	}
	if stats.ByLevel[DifficultyEasy] == 0 || stats.ByLevel[DifficultyMedium] == 0 || stats.ByLevel[DifficultyHard] == 0 {
		t.Fatalf("не все уровни сложности: %#v", stats.ByLevel)
	}

	modules := map[string]bool{}
	hintsMissing := 0
	for _, item := range list {
		modules[item.Module] = true
		if item.ChecksCount == 0 {
			t.Errorf("%s: нет проверок", item.ID)
		}
		if item.HintsCount == 0 {
			hintsMissing++
			t.Errorf("%s: нет подсказок", item.ID)
		}
		if item.ModuleTitle == "" || item.ModuleNum == 0 {
			t.Errorf("%s: не подставлен модуль", item.ID)
		}
		if item.Title == "" || item.Summary == "" {
			t.Errorf("%s: пустые заголовок или описание", item.ID)
		}
	}
	if len(modules) < 8 {
		t.Errorf("задания охватывают %d модулей, ожидалось минимум 8", len(modules))
	}

	// Тесты и решения не должны попадать в краткое описание для клиента.
	detail, err := store.Get(list[0].ID)
	if err != nil {
		t.Fatalf("получить задание: %v", err)
	}
	if detail.Tests == "" || detail.Solution == "" {
		t.Fatal("у задания должны быть тесты и решение")
	}
	if !strings.HasPrefix(detail.StarterCode, "package main") {
		t.Errorf("стартовый код должен быть программой package main")
	}
}

func TestRepositoryExercisesAreSolvable(t *testing.T) {
	if _, err := exec.LookPath("go"); err != nil {
		t.Skip("go не найден в PATH: проверка решений пропущена")
	}
	store := newRepoStore(t)
	catalog, err := store.Load()
	if err != nil {
		t.Fatalf("каталог: %v", err)
	}

	gradeRunner := runner.New(runner.Config{
		WorkRoot:    t.TempDir(),
		CacheDir:    filepath.Join(os.TempDir(), "go-academy-test-cache"),
		Timeout:     20 * time.Second,
		MaxOutput:   32 << 10,
		MaxCode:     64 << 10,
		Concurrency: 1,
	})

	for _, exercise := range catalog.Exercises {
		exercise := exercise
		t.Run(exercise.ID, func(t *testing.T) {
			t.Parallel()

			// 1. Эталонное решение проходит все проверки.
			result, err := gradeRunner.Test(context.Background(), exercise.Solution, exercise.Tests)
			if err != nil {
				t.Fatalf("проверка решения: %v", err)
			}
			if result.Status != runner.StatusOK || result.Passed != result.Total {
				t.Fatalf("эталонное решение не прошло: статус %s (%s), %d из %d\n%s",
					result.Status, result.Message, result.Passed, result.Total, result.Stderr)
			}

			// 2. Стартовый код компилируется: иначе ученик получит ошибку
			// компиляции вместо понятного «тесты не проходят».
			build, err := gradeRunner.Build(context.Background(), exercise.StarterCode)
			if err != nil {
				t.Fatalf("сборка стартового кода: %v", err)
			}
			if build.Status != runner.StatusOK {
				t.Fatalf("стартовый код не компилируется: %s\n%s", build.Status, build.Stderr)
			}

			// 3. Стартовый код не должен проходить проверки случайно.
			starterResult, err := gradeRunner.Test(context.Background(), exercise.StarterCode, exercise.Tests)
			if err != nil {
				t.Fatalf("проверка стартового кода: %v", err)
			}
			if starterResult.Status == runner.StatusOK {
				t.Fatal("стартовый код проходит все проверки: задание слишком простое")
			}
		})
	}
}
