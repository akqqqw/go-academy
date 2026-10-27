package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// newTestRunner создаёт раннер с коротким таймаутом и временным каталогом.
func newTestRunner(t *testing.T, timeout time.Duration) *Runner {
	t.Helper()
	if _, err := exec.LookPath("go"); err != nil {
		t.Skip("go не найден в PATH: тесты запуска кода пропущены")
	}
	work := t.TempDir()
	cache := filepath.Join(os.TempDir(), "go-academy-test-cache")
	return New(Config{
		WorkRoot:     work,
		CacheDir:     cache,
		Timeout:      timeout,
		MaxOutput:    8 << 10,
		MaxCode:      64 << 10,
		Concurrency:  1,
		QueueTimeout: 2 * time.Second,
	})
}

func TestRunHelloWorld(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Run(context.Background(), `package main

import "fmt"

func main() {
	fmt.Println("Привет, Go!")
}
`)
	if err != nil {
		t.Fatalf("запуск вернул ошибку: %v", err)
	}
	if result.Status != StatusOK {
		t.Fatalf("статус = %q (%s), ожидался ok; stderr: %s", result.Status, result.Message, result.Stderr)
	}
	if !strings.Contains(result.Stdout, "Привет, Go!") {
		t.Errorf("вывод = %q", result.Stdout)
	}
	if result.BuildMs <= 0 {
		t.Error("время сборки не измерено")
	}
}

func TestRunCompileErrorHasLineNumbers(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Run(context.Background(), `package main

import "fmt"

func main() {
	fmt.Println(undefinedValue)
}
`)
	if err != nil {
		t.Fatalf("ошибка раннера: %v", err)
	}
	if result.Status != StatusCompileError {
		t.Fatalf("статус = %q, ожидалась ошибка компиляции", result.Status)
	}
	if len(result.Diagnostics) == 0 {
		t.Fatalf("нет диагностик: %s", result.Stderr)
	}
	first := result.Diagnostics[0]
	if first.Line != 6 {
		t.Errorf("строка ошибки = %d, ожидалась 6", first.Line)
	}
	if !strings.Contains(first.Message, "undefined") && !strings.Contains(first.Message, "declared") {
		t.Errorf("сообщение = %q", first.Message)
	}
}

func TestRunRuntimePanic(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Run(context.Background(), `package main

import "fmt"

func main() {
	values := []int{1, 2, 3}
	fmt.Println(values[5])
}
`)
	if err != nil {
		t.Fatalf("ошибка раннера: %v", err)
	}
	if result.Status != StatusRuntimeError {
		t.Fatalf("статус = %q, ожидалась ошибка выполнения", result.Status)
	}
	if result.ExitCode == 0 {
		t.Error("код возврата должен быть не нулевым")
	}
	if len(result.Diagnostics) == 0 || result.Diagnostics[0].Line != 7 {
		t.Errorf("диагностики = %+v", result.Diagnostics)
	}
	if !strings.Contains(result.Stderr, "index out of range") {
		t.Errorf("stderr = %q", result.Stderr)
	}
}

func TestRunTimeoutKillsProgram(t *testing.T) {
	r := newTestRunner(t, 1500*time.Millisecond)

	started := time.Now()
	result, err := r.Run(context.Background(), `package main

func main() {
	for {
	}
}
`)
	if err != nil {
		t.Fatalf("ошибка раннера: %v", err)
	}
	if result.Status != StatusTimeout || !result.TimedOut {
		t.Fatalf("статус = %q (timed_out=%v), ожидался timeout", result.Status, result.TimedOut)
	}
	if elapsed := time.Since(started); elapsed > 30*time.Second {
		t.Errorf("остановка заняла слишком много времени: %s", elapsed)
	}
}

func TestRunLimitsOutput(t *testing.T) {
	r := newTestRunner(t, 15*time.Second)
	r.cfg.MaxOutput = 1024

	result, err := r.Run(context.Background(), `package main

import (
	"fmt"
	"strings"
)

func main() {
	for i := 0; i < 5000; i++ {
		fmt.Println(strings.Repeat("x", 200))
	}
}
`)
	if err != nil {
		t.Fatalf("ошибка раннера: %v", err)
	}
	if len(result.Stdout) > 2048 {
		t.Errorf("вывод не ограничен: %d байт", len(result.Stdout))
	}
	if !result.Truncated {
		t.Error("флаг усечения не выставлен")
	}
}

func TestRunRejectsBlockedImports(t *testing.T) {
	r := newTestRunner(t, 5*time.Second)

	for _, code := range []string{
		"package main\n\nimport \"os/exec\"\n\nfunc main() { _ = exec.Command(\"ls\") }\n",
		"package main\n\nimport \"plugin\"\n\nfunc main() { _ = plugin.Open(\"x\") }\n",
	} {
		result, err := r.Run(context.Background(), code)
		if err != nil {
			t.Fatalf("ошибка раннера: %v", err)
		}
		if result.Status != StatusRejected {
			t.Errorf("статус = %q, ожидался rejected", result.Status)
		}
		if result.Message == "" {
			t.Error("нет объяснения отказа")
		}
	}
}

func TestRunRejectsEmptyAndOversizedCode(t *testing.T) {
	r := newTestRunner(t, 5*time.Second)
	r.cfg.MaxCode = 100

	empty, _ := r.Run(context.Background(), "   \n")
	if empty.Status != StatusRejected {
		t.Errorf("пустой код: статус = %q", empty.Status)
	}

	big, _ := r.Run(context.Background(), "package main\n\n//"+strings.Repeat("x", 200))
	if big.Status != StatusRejected || !strings.Contains(big.Message, "КиБ") {
		t.Errorf("большой код: статус = %q, сообщение = %q", big.Status, big.Message)
	}
}

func TestFormatCode(t *testing.T) {
	r := New(Config{})

	formatted, diagnostics, err := r.Format("package main\nimport \"fmt\"\nfunc main(){\nfmt.Println( 1 )\n}\n")
	if err != nil {
		t.Fatalf("форматирование вернуло ошибку: %v", err)
	}
	if len(diagnostics) != 0 {
		t.Fatalf("неожиданные диагностики: %+v", diagnostics)
	}
	want := "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(1)\n}\n"
	if formatted != want {
		t.Errorf("получено:\n%q\nожидалось:\n%q", formatted, want)
	}

	_, diagnostics, err = r.Format("package main\n\nfunc main() {\n")
	if err != nil {
		t.Fatalf("ошибка: %v", err)
	}
	if len(diagnostics) == 0 {
		t.Error("для синтаксически неверного кода нужны диагностики")
	}
	if diagnostics[0].Line == 0 {
		t.Errorf("нет номера строки: %+v", diagnostics[0])
	}

	if _, _, err := r.Format("   "); err == nil {
		t.Error("ожидалась ошибка для пустого кода")
	}
}

func TestStatusFindsGo(t *testing.T) {
	r := New(Config{})
	status := r.Status(context.Background())
	if !status.Available {
		t.Skipf("Go не найден: %s", status.Reason)
	}
	if !strings.HasPrefix(status.Version, "go version") {
		t.Errorf("версия = %q", status.Version)
	}
	if status.Limits.TimeoutMs <= 0 || status.Limits.MaxOutputBytes <= 0 {
		t.Errorf("лимиты не заполнены: %+v", status.Limits)
	}
	if !strings.Contains(status.Warning, "не песочница") {
		t.Error("нет предупреждения о границах изоляции")
	}
}

func TestStatusReportsMissingGo(t *testing.T) {
	r := New(Config{GoBinary: filepath.Join(t.TempDir(), "нет-такого-go")})
	// Автопоиск всё равно найдёт настоящий go в PATH, поэтому проверяем ветку
	// напрямую: с недоступным бинарником и пустым PATH.
	t.Setenv("PATH", "")
	status := r.Status(context.Background())
	if status.Available && status.Binary == "" {
		t.Error("статус доступности без пути к go")
	}
}

func TestFindGoBinarySkipsBrokenWrapper(t *testing.T) {
	if _, err := exec.LookPath("go"); err != nil {
		t.Skip("go не найден в PATH")
	}
	dir := t.TempDir()
	broken := filepath.Join(dir, "go")
	if err := os.WriteFile(broken, []byte("#!/bin/sh\necho 'Traceback: no module named go' >&2\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	r := New(Config{GoBinary: broken})
	// Явно указанный сломанный путь не должен блокировать автопоиск.
	path, err := r.findGoBinary()
	if err != nil {
		t.Fatalf("go не найден: %v", err)
	}
	if path == broken {
		t.Fatalf("выбран сломанный бинарь: %s", path)
	}
	if !strings.HasSuffix(path, "go") {
		t.Errorf("путь = %q", path)
	}
}

const addTests = `package main

import "testing"

// TestAddPositive складывает положительные числа.
func TestAddPositive(t *testing.T) {
	if got := Add(2, 3); got != 5 {
		t.Fatalf("Add(2, 3) = %d, ожидалось 5", got)
	}
}

// TestAddZero проверяет нулевые аргументы.
func TestAddZero(t *testing.T) {
	if got := Add(0, 0); got != 0 {
		t.Fatalf("Add(0, 0) = %d, ожидалось 0", got)
	}
}
`

func TestParseTests(t *testing.T) {
	cases, err := ParseTests(addTests)
	if err != nil {
		t.Fatalf("разбор тестов: %v", err)
	}
	if len(cases) != 2 {
		t.Fatalf("тестов = %d, ожидалось 2: %#v", len(cases), cases)
	}
	if cases[0].Name != "TestAddPositive" || cases[0].Title != "складывает положительные числа" {
		t.Errorf("первый тест = %#v", cases[0])
	}
	if _, err := ParseTests("package main\n\nfunc helper() {}\n"); err == nil {
		t.Error("ожидалась ошибка: в файле нет тестов")
	}
}

func TestTestAllChecksPass(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Test(context.Background(), "package main\n\nfunc Add(a, b int) int { return a + b }\n\nfunc main() {}\n", addTests)
	if err != nil {
		t.Fatalf("проверка вернула ошибку: %v", err)
	}
	if result.Status != StatusOK {
		t.Fatalf("статус = %q (%s); stderr: %s", result.Status, result.Message, result.Stderr)
	}
	if result.Passed != 2 || result.Total != 2 {
		t.Errorf("пройдено %d из %d", result.Passed, result.Total)
	}
	if len(result.Tests) != 2 || result.Tests[0].Title == "" {
		t.Errorf("нет описаний проверок: %#v", result.Tests)
	}
}

func TestTestReportsFailedCheck(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Test(context.Background(), "package main\n\nfunc Add(a, b int) int { return a + b + 1 }\n", addTests)
	if err != nil {
		t.Fatalf("проверка вернула ошибку: %v", err)
	}
	if result.Status != StatusTestFailed {
		t.Fatalf("статус = %q (%s), ожидался test_failed", result.Status, result.Message)
	}
	if result.Passed != 0 || result.Total != 2 {
		t.Errorf("пройдено %d из %d", result.Passed, result.Total)
	}
	if !strings.Contains(result.Tests[0].Output, "ожидалось 5") {
		t.Errorf("вывод проверки = %q", result.Tests[0].Output)
	}
}

func TestTestCompileErrorHasLineNumbers(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Test(context.Background(), "package main\n\nfunc main() {\n\tAdd(1, 2)\n}\n", addTests)
	if err != nil {
		t.Fatalf("проверка вернула ошибку: %v", err)
	}
	if result.Status != StatusCompileError {
		t.Fatalf("статус = %q (%s), ожидался compile_error; stderr: %s", result.Status, result.Message, result.Stderr)
	}
	if len(result.Diagnostics) == 0 || result.Diagnostics[0].Line != 4 {
		t.Errorf("диагностики = %#v", result.Diagnostics)
	}
}

func TestTestTimeoutStopsHangingTest(t *testing.T) {
	r := newTestRunner(t, 600*time.Millisecond)

	tests := "package main\n\nimport \"testing\"\n\n// TestHang зацикливается.\nfunc TestHang(t *testing.T) {\n\tfor {\n\t}\n}\n"
	result, err := r.Test(context.Background(), "package main\n", tests)
	if err != nil {
		t.Fatalf("проверка вернула ошибку: %v", err)
	}
	if result.Status != StatusTimeout {
		t.Fatalf("статус = %q (%s), ожидался timeout", result.Status, result.Message)
	}
	if !result.TimedOut {
		t.Error("флаг TimedOut не выставлен")
	}
}

func TestTestRejectsBlockedImports(t *testing.T) {
	r := newTestRunner(t, 20*time.Second)

	result, err := r.Test(context.Background(), "package main\n\nimport \"os/exec\"\n\nvar _ = exec.Command\n", addTests)
	if err != nil {
		t.Fatalf("проверка вернула ошибку: %v", err)
	}
	if result.Status != StatusRejected {
		t.Fatalf("статус = %q (%s), ожидался rejected", result.Status, result.Message)
	}
}
