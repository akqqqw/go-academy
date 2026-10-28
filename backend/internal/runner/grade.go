package runner

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// StatusTestFailed — код собрался, тесты запустились, но часть проверок не
// прошла. Отдельный статус нужен, чтобы интерфейс не путал это с ошибкой
// компиляции.
const StatusTestFailed = "test_failed"

// testFileName — имя файла с проверками внутри временного каталога. Код
// пользователя пишется в main.go, тесты — в exercise_test.go.
const testFileName = "exercise_test.go"

// TestCase — проверка, объявленная в файле тестов.
type TestCase struct {
	Name  string `json:"name"`
	Title string `json:"title"`
}

// TestOutcome — результат одной проверки.
type TestOutcome struct {
	Name       string  `json:"name"`
	Title      string  `json:"title"`
	Passed     bool    `json:"passed"`
	Skipped    bool    `json:"skipped"`
	DurationMs float64 `json:"duration_ms"`
	Output     string  `json:"output,omitempty"`
}

// TestResult — итог проверки решения через go test.
type TestResult struct {
	Status      string        `json:"status"`
	Passed      int           `json:"passed"`
	Total       int           `json:"total"`
	Tests       []TestOutcome `json:"tests"`
	DurationMs  int64         `json:"duration_ms"`
	BuildMs     int64         `json:"build_ms"`
	Stdout      string        `json:"stdout"`
	Stderr      string        `json:"stderr"`
	Truncated   bool          `json:"truncated"`
	TimedOut    bool          `json:"timed_out"`
	Diagnostics []Diagnostic  `json:"diagnostics"`
	Message     string        `json:"message,omitempty"`
}

// testEvent — одна строка потока `go test -json`.
//
// Кроме событий тестов (`run`, `pass`, `fail`, `output`) go test присылает
// события сборки: `build-output` с текстом ошибки компилятора и `build-fail`.
type testEvent struct {
	Action      string  `json:"Action"`
	Test        string  `json:"Test"`
	Output      string  `json:"Output"`
	Elapsed     float64 `json:"Elapsed"`
	ImportPath  string  `json:"ImportPath"`
	FailedBuild string  `json:"FailedBuild"`
}

// ParseTests разбирает файл проверок и возвращает список тестов.
//
// Заголовок берётся из комментария перед функцией: `// TestSum складывает два
// числа.` Если комментария нет, используется имя функции. Разбор идёт через
// go/parser, поэтому случайные строки в коде тестов не считаются проверками.
func ParseTests(src string) ([]TestCase, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, testFileName, src, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("файл проверок не компилируется: %w", err)
	}

	var cases []TestCase
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Recv != nil {
			continue
		}
		name := fn.Name.Name
		if !strings.HasPrefix(name, "Test") || name == "TestMain" {
			continue
		}
		// Проверкой считаем только функцию с одним параметром: func(t *testing.T).
		if fn.Type.Params == nil || len(fn.Type.Params.List) == 0 {
			continue
		}
		if fn.Type.Results != nil && len(fn.Type.Results.List) > 0 {
			continue
		}
		title := ""
		if fn.Doc != nil {
			title = firstLine(strings.TrimSpace(fn.Doc.Text()))
		}
		title = strings.TrimSpace(strings.TrimPrefix(title, name))
		title = strings.TrimSpace(strings.TrimSuffix(title, "."))
		if title == "" {
			title = name
		}
		cases = append(cases, TestCase{Name: name, Title: title})
	}
	if len(cases) == 0 {
		return nil, fmt.Errorf("в файле проверок нет функций Test*")
	}
	return cases, nil
}

// Test собирает код пользователя вместе с проверками и запускает go test.
//
// Проверка настоящая: go test компилирует код, выполняет тесты и сообщает
// результат по каждому из них. Тесты приходят из контента курса и в браузер не
// попадают. Поток `-json` разбирается как JSON, поэтому вывести поддельный
// «PASS» из своей программы нельзя — такие строки попадут в поле Output.
func (r *Runner) Test(ctx context.Context, code, tests string) (TestResult, error) {
	started := time.Now()

	if strings.TrimSpace(code) == "" {
		return TestResult{Status: StatusRejected, Message: "код пустой", Tests: []TestOutcome{}}, nil
	}
	if len(code) > r.cfg.MaxCode {
		return TestResult{
			Status:  StatusRejected,
			Message: fmt.Sprintf("код больше %d КиБ — сократите решение", r.cfg.MaxCode>>10),
			Tests:   []TestOutcome{},
		}, nil
	}
	if reason := checkImports(code); reason != "" {
		return TestResult{Status: StatusRejected, Message: reason, Tests: []TestOutcome{}}, nil
	}

	expected, err := ParseTests(tests)
	if err != nil {
		return TestResult{}, fmt.Errorf("проверки задания повреждены: %w", err)
	}
	if _, _, _, err := r.detect(ctx); err != nil {
		return TestResult{Status: StatusInternal, Message: err.Error(), Tests: []TestOutcome{}}, nil
	}

	if err := r.acquire(ctx); err != nil {
		return TestResult{Status: StatusRejected, Message: err.Error(), Tests: []TestOutcome{}}, nil
	}
	defer r.release()

	dir, err := r.tempDir()
	if err != nil {
		return TestResult{Status: StatusInternal, Message: err.Error(), Tests: []TestOutcome{}}, nil
	}
	defer os.RemoveAll(dir)

	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte(code), 0o600); err != nil {
		return TestResult{Status: StatusInternal, Message: err.Error()}, nil
	}
	if err := os.WriteFile(filepath.Join(dir, testFileName), []byte(tests), 0o600); err != nil {
		return TestResult{Status: StatusInternal, Message: err.Error()}, nil
	}

	// Лимит команды: сборка + таймаут тестов + запас. Сам тестовый бинарник
	// дополнительно ограничен флагом -timeout, поэтому зависший тест не
	// превратится в вечное ожидание.
	limit := buildTimeout + r.cfg.Timeout + 3*time.Second
	testCtx, cancel := context.WithTimeout(ctx, limit)
	defer cancel()

	args := []string{
		"test", "-json", "-count=1",
		"-timeout", fmt.Sprintf("%dms", r.cfg.Timeout.Milliseconds()),
		"main.go", testFileName,
	}
	cmd := exec.CommandContext(testCtx, r.binary, args...)
	cmd.Dir = dir
	cmd.Env = r.env(dir)

	stdout := &limitedBuffer{max: r.cfg.MaxOutput, cancel: cancel}
	stderr := &limitedBuffer{max: r.cfg.MaxOutput, cancel: cancel}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.Stdin = strings.NewReader("")

	runStart := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(runStart).Milliseconds()

	result := TestResult{
		Status:      StatusOK,
		Total:       len(expected),
		Tests:       []TestOutcome{},
		DurationMs:  durationMs,
		Stdout:      stdout.String(),
		Stderr:      stderr.String(),
		Truncated:   stdout.Truncated || stderr.Truncated,
		Diagnostics: []Diagnostic{},
	}

	events, parseErr := parseTestEvents(result.Stdout)
	outcomes := map[string]*TestOutcome{}
	var buildOutput strings.Builder
	buildFailed := false
	for _, event := range events {
		switch event.Action {
		case "build-output":
			buildOutput.WriteString(event.Output)
			continue
		case "build-fail":
			buildFailed = true
			continue
		}
		name := event.Test
		if name == "" || strings.Contains(name, "/") {
			// Пакетные события и подтесты: их результат виден через родителя.
			continue
		}
		outcome, ok := outcomes[name]
		if !ok {
			outcome = &TestOutcome{Name: name}
			outcomes[name] = outcome
		}
		switch event.Action {
		case "output":
			outcome.Output += event.Output
		case "pass":
			outcome.Passed = true
			outcome.DurationMs = event.Elapsed * 1000
		case "fail":
			outcome.Passed = false
			outcome.DurationMs = event.Elapsed * 1000
		case "skip":
			outcome.Skipped = true
			outcome.DurationMs = event.Elapsed * 1000
		}
	}

	for _, testCase := range expected {
		outcome, ok := outcomes[testCase.Name]
		if !ok {
			outcome = &TestOutcome{
				Name:   testCase.Name,
				Title:  testCase.Title,
				Output: "тест не выполнился: проверьте, что код собирается и не завершает процесс",
			}
		}
		outcome.Title = testCase.Title
		outcome.Output = strings.TrimSpace(outcome.Output)
		if outcome.Passed && !outcome.Skipped {
			result.Passed++
		}
		result.Tests = append(result.Tests, *outcome)
	}

	// Диагностика по main.go: паника внутри теста указывает на строку решения.
	var failureOutput strings.Builder
	for _, outcome := range result.Tests {
		if !outcome.Passed && !outcome.Skipped {
			failureOutput.WriteString(outcome.Output)
			failureOutput.WriteString("\n")
		}
	}
	if failureOutput.Len() > 0 {
		result.Diagnostics = parseRuntimeDiagnostics(failureOutput.String())
	}

	switch {
	case testCtx.Err() == context.DeadlineExceeded:
		result.Status = StatusTimeout
		result.TimedOut = true
		result.Message = fmt.Sprintf("проверка прервана: превышен лимит %s", r.cfg.Timeout)
		result.Stderr += fmt.Sprintf("\n[go-academy] проверка остановлена через %s\n", r.cfg.Timeout)
	case parseErr != nil && result.Truncated:
		result.Status = StatusInternal
		result.Message = "вывод проверки слишком велик — сократите отладочную печать"
	case buildFailed || (len(outcomes) == 0 && compileDiagnostics(result.Stderr+buildOutput.String()) != nil):
		result.Status = StatusCompileError
		result.Message = "код не компилируется вместе с проверками"
		combined := result.Stderr + buildOutput.String()
		if diagnostics := compileDiagnostics(combined); diagnostics != nil {
			result.Diagnostics = diagnostics
		} else {
			result.Diagnostics = parseCompileOutput(combined)
		}
		if len(result.Diagnostics) == 0 {
			result.Message = strings.TrimSpace(firstLine(combined))
		}
	case runErr != nil:
		result.Status = StatusTestFailed
		result.Message = fmt.Sprintf("пройдено %d из %d проверок", result.Passed, result.Total)
	default:
		result.Status = StatusOK
		result.Message = "все проверки пройдены"
	}

	if result.Status == StatusOK && result.Passed < result.Total {
		// go test вернул 0, но часть тестов не отчиталась (например, тест
		// пропущен): решение не считается принятым.
		result.Status = StatusTestFailed
		result.Message = fmt.Sprintf("пройдено %d из %d проверок", result.Passed, result.Total)
	}
	if result.Status == StatusTestFailed && result.Message == "" {
		result.Message = fmt.Sprintf("пройдено %d из %d проверок", result.Passed, result.Total)
	}
	// go test останавливает зависший тест флагом -timeout и печатает панику.
	// Для интерфейса это именно превышение времени, а не провал логики.
	if result.Status == StatusTestFailed && strings.Contains(result.Stderr+result.Stdout, "test timed out after") {
		result.Status = StatusTimeout
		result.TimedOut = true
		result.Message = fmt.Sprintf("проверка прервана: превышен лимит %s", r.cfg.Timeout)
	}
	result.BuildMs = time.Since(started).Milliseconds() - durationMs
	if result.BuildMs < 0 {
		result.BuildMs = 0
	}
	return result, nil
}

// compileDiagnostics возвращает ошибки сборки из вывода go test или nil, если
// вывод не похож на ошибки компиляции.
func compileDiagnostics(output string) []Diagnostic {
	building := strings.Contains(output, "[build failed]") ||
		strings.Contains(output, "build failed") ||
		strings.Contains(output, "# command-line-arguments") ||
		strings.Contains(output, "setup failed")
	if !building {
		return nil
	}
	diagnostics := parseCompileOutput(output)
	if len(diagnostics) == 0 {
		return []Diagnostic{{File: "main.go", Message: strings.TrimSpace(firstLine(output)), Severity: "error"}}
	}
	return diagnostics
}

// parseTestEvents читает поток `go test -json`. Строки, которые не являются
// JSON (например, сообщения о падении сборки), пропускаются.
func parseTestEvents(stream string) ([]testEvent, error) {
	events := make([]testEvent, 0, 32)
	scanner := bufio.NewScanner(strings.NewReader(stream))
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	var parseErr error
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || line[0] != '{' {
			continue
		}
		var event testEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			parseErr = err
			continue
		}
		events = append(events, event)
	}
	if err := scanner.Err(); err != nil {
		return events, err
	}
	return events, parseErr
}
