// Package runner выполняет пользовательский Go-код локально.
//
// Важно понимать границы: это НЕ песочница безопасности. Код компилируется и
// запускается от имени того же пользователя, поэтому имеет доступ к его файлам.
// Пакет ограничивает только ресурсы и время: отдельный временный каталог, лимит
// на размер вывода, таймаут выполнения, запрет запуска внешних команд через
// os/exec и ограничение числа одновременных запусков. Недоверенный код нужно
// запускать в контейнере — об этом честно сказано в интерфейсе.
package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"go/format"
	"go/parser"
	"go/scanner"
	"go/token"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Статусы результата запуска.
const (
	StatusOK           = "ok"            // код собрался и завершился с кодом 0
	StatusRuntimeError = "runtime_error" // код собрался, но упал во время выполнения
	StatusCompileError = "compile_error" // ошибка компиляции
	StatusTimeout      = "timeout"       // превышен таймаут
	StatusRejected     = "rejected"      // код отклонён до запуска (проверки безопасности)
	StatusInternal     = "internal"      // ошибка самого раннера
)

// Ограничения по умолчанию.
const (
	DefaultTimeout      = 10 * time.Second
	DefaultQueueTimeout = 15 * time.Second
	DefaultMaxOutput    = 256 << 10 // 256 КиБ на поток
	DefaultMaxCode      = 256 << 10 // 256 КиБ исходника
	DefaultConcurrency  = 2
	buildTimeout        = 40 * time.Second
)

// Limits — ограничения, которые видит интерфейс.
type Limits struct {
	TimeoutMs      int `json:"timeout_ms"`
	MaxOutputBytes int `json:"max_output_bytes"`
	MaxCodeBytes   int `json:"max_code_bytes"`
	Concurrency    int `json:"concurrency"`
}

// Config — настройки раннера.
type Config struct {
	// GoBinary — путь к инструменту go. Пустая строка означает автопоиск.
	GoBinary string
	// WorkRoot — каталог, внутри которого создаются временные папки запусков.
	WorkRoot string
	// CacheDir — общий кеш сборки, чтобы каждый запуск не компилировал stdlib заново.
	CacheDir string
	// Timeout — лимит времени выполнения программы.
	Timeout time.Duration
	// QueueTimeout — сколько ждём свободный слот, если все заняты.
	QueueTimeout time.Duration
	// MaxOutput — лимит вывода на каждый поток (stdout/stderr).
	MaxOutput int
	// MaxCode — лимит размера исходника.
	MaxCode int
	// Concurrency — сколько запусков разрешено одновременно.
	Concurrency int
}

// Status — состояние раннера для интерфейса.
type Status struct {
	Available bool   `json:"available"`
	Version   string `json:"version,omitempty"`
	Binary    string `json:"binary,omitempty"`
	GOROOT    string `json:"goroot,omitempty"`
	Limits    Limits `json:"limits"`
	// Warning — честное предупреждение о том, что запуск не изолирован.
	Warning string `json:"warning"`
	Reason  string `json:"reason,omitempty"`
}

// Diagnostic — одна ошибка компиляции или выполнения с привязкой к строке.
type Diagnostic struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

// Result — результат запуска.
type Result struct {
	Status        string       `json:"status"`
	ExitCode      int          `json:"exit_code"`
	DurationMs    int64        `json:"duration_ms"`
	BuildMs       int64        `json:"build_ms"`
	Stdout        string       `json:"stdout"`
	Stderr        string       `json:"stderr"`
	Truncated     bool         `json:"truncated"`
	TimedOut      bool         `json:"timed_out"`
	Diagnostics   []Diagnostic `json:"diagnostics"`
	Message       string       `json:"message,omitempty"`
	KilledByLimit bool         `json:"killed_by_limit,omitempty"`
}

// Runner выполняет код и форматирует исходники.
type Runner struct {
	cfg   Config
	slots chan struct{}

	mu      sync.Mutex
	binary  string
	version string
	goroot  string
	detErr  error

	detected sync.Once
}

// New создаёт раннер. Поиск go выполняется лениво: интерфейс должен работать,
// даже если Go не установлен — тогда честно показывается причина.
func New(cfg Config) *Runner {
	if cfg.Timeout <= 0 {
		cfg.Timeout = DefaultTimeout
	}
	if cfg.QueueTimeout <= 0 {
		cfg.QueueTimeout = DefaultQueueTimeout
	}
	if cfg.MaxOutput <= 0 {
		cfg.MaxOutput = DefaultMaxOutput
	}
	if cfg.MaxCode <= 0 {
		cfg.MaxCode = DefaultMaxCode
	}
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = DefaultConcurrency
	}
	if cfg.CacheDir == "" {
		// Без общего кеша каждая сборка компилировала бы стандартную библиотеку
		// заново: запуск занимал бы секунды вместо десятых долей.
		cfg.CacheDir = os.Getenv("GOCACHE")
	}
	if cfg.CacheDir == "" {
		if base, err := os.UserCacheDir(); err == nil {
			cfg.CacheDir = filepath.Join(base, "go-academy", "gocache")
		}
	}
	return &Runner{cfg: cfg, slots: make(chan struct{}, cfg.Concurrency)}
}

// Limits возвращает действующие ограничения.
func (r *Runner) Limits() Limits {
	return Limits{
		TimeoutMs:      int(r.cfg.Timeout / time.Millisecond),
		MaxOutputBytes: r.cfg.MaxOutput,
		MaxCodeBytes:   r.cfg.MaxCode,
		Concurrency:    r.cfg.Concurrency,
	}
}

// Status проверяет наличие Go SDK и возвращает информацию для интерфейса.
func (r *Runner) Status(ctx context.Context) Status {
	status := Status{
		Limits: r.Limits(),
		Warning: "Запуск выполняется локальным Go SDK в отдельном временном каталоге: " +
			"это ограничение ресурсов, но не песочница безопасности. " +
			"Код имеет доступ к файлам пользователя. Для недоверенного кода нужен контейнер.",
	}
	path, version, goroot, err := r.detect(ctx)
	if err != nil {
		status.Reason = err.Error()
		return status
	}
	status.Available = true
	status.Binary = path
	status.Version = version
	status.GOROOT = goroot
	return status
}

// detect ищет go один раз и запоминает результат.
func (r *Runner) detect(ctx context.Context) (string, string, string, error) {
	r.detected.Do(func() {
		path, err := r.findGoBinary()
		if err != nil {
			r.detErr = err
			return
		}
		checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		out, err := exec.CommandContext(checkCtx, path, "env", "GOROOT").Output()
		if err != nil {
			r.detErr = fmt.Errorf("не удалось запустить %s: %w", path, err)
			return
		}
		goroot := strings.TrimSpace(string(out))

		versionOut, err := exec.CommandContext(checkCtx, path, "version").Output()
		if err != nil {
			r.detErr = fmt.Errorf("не удалось определить версию Go: %w", err)
			return
		}
		r.binary = path
		r.goroot = goroot
		r.version = strings.TrimSpace(string(versionOut))
	})
	if r.detErr != nil {
		return "", "", "", r.detErr
	}
	return r.binary, r.version, r.goroot, nil
}

// findGoBinary ищет go в PATH, GOROOT и типовых каталогах установки.
func (r *Runner) findGoBinary() (string, error) {
	candidates := []string{}
	if r.cfg.GoBinary != "" {
		candidates = append(candidates, r.cfg.GoBinary)
	}
	if env := os.Getenv("GOACADEMY_GO_BIN"); env != "" {
		candidates = append(candidates, env)
	}
	if env := os.Getenv("GOROOT"); env != "" {
		candidates = append(candidates, filepath.Join(env, "bin", "go"))
	}
	if path, err := exec.LookPath("go"); err == nil {
		candidates = append(candidates, path)
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates,
			filepath.Join(home, ".local", "go", "bin", "go"),
			filepath.Join(home, "go", "bin", "go"),
			filepath.Join(home, "sdk"),
		)
	}
	candidates = append(candidates, "/usr/local/go/bin/go", "/usr/lib/go/bin/go", "/opt/go/bin/go")

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		info, err := os.Stat(candidate)
		if err != nil || info.IsDir() {
			continue
		}
		// Проверяем, что это действительно go, а не обёртка-скрипт: в PATH может
		// оказаться, например, python-скрипт с тем же именем.
		if !isGoBinary(candidate) {
			continue
		}
		return candidate, nil
	}
	return "", errors.New("Go SDK не найден: установите Go и перезапустите сервер (или укажите путь флагом --go)")
}

// isGoBinary проверяет, что перед нами настоящий бинарник go, а не скрипт-обёртка
// (например, python-скрипт из pip с тем же именем), и что он отвечает версией.
func isGoBinary(path string) bool {
	if !isNativeExecutable(path) {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, path, "version").Output()
	if err != nil {
		return false
	}
	return strings.HasPrefix(strings.TrimSpace(string(out)), "go version")
}

// isNativeExecutable отличает ELF/Mach-O/PE от shell- или python-скриптов.
func isNativeExecutable(path string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	header := make([]byte, 4)
	if _, err := io.ReadFull(file, header); err != nil {
		return false
	}
	// ELF (Linux, *BSD), Mach-O (macOS), PE (Windows).
	if bytes.Equal(header[:4], []byte{0x7f, 'E', 'L', 'F'}) {
		return true
	}
	if bytes.Equal(header[:2], []byte{'M', 'Z'}) {
		return true
	}
	native := map[string]bool{
		"\xcf\xfa\xed\xfe": true, // Mach-O 64 little endian
		"\xfe\xed\xfa\xcf": true, // Mach-O 64 big endian
		"\xce\xfa\xed\xfe": true, // Mach-O 32
		"\xca\xfe\xba\xbe": true, // universal binary
	}
	return native[string(header)]
}

// Format форматирует код через gofmt (пакет go/format — тот же алгоритм).
func (r *Runner) Format(code string) (string, []Diagnostic, error) {
	if strings.TrimSpace(code) == "" {
		return "", nil, errors.New("нечего форматировать: код пуст")
	}
	formatted, err := format.Source([]byte(code))
	if err != nil {
		return code, diagnosticsFromError(err), nil
	}
	return string(formatted), nil, nil
}

// Run компилирует и запускает код.
func (r *Runner) Run(ctx context.Context, code string) (Result, error) {
	started := time.Now()

	if strings.TrimSpace(code) == "" {
		return Result{Status: StatusRejected, Message: "код пустой", Diagnostics: []Diagnostic{}}, nil
	}
	if len(code) > r.cfg.MaxCode {
		return Result{
			Status:      StatusRejected,
			Message:     fmt.Sprintf("код больше %d КиБ — сократите пример", r.cfg.MaxCode>>10),
			Diagnostics: []Diagnostic{},
		}, nil
	}
	if reason := checkImports(code); reason != "" {
		return Result{Status: StatusRejected, Message: reason, Diagnostics: []Diagnostic{}}, nil
	}

	if _, _, _, err := r.detect(ctx); err != nil {
		return Result{Status: StatusInternal, Message: err.Error(), Diagnostics: []Diagnostic{}}, nil
	}

	if err := r.acquire(ctx); err != nil {
		return Result{Status: StatusRejected, Message: err.Error()}, nil
	}
	defer r.release()

	dir, err := r.tempDir()
	if err != nil {
		return Result{Status: StatusInternal, Message: err.Error(), Diagnostics: []Diagnostic{}}, nil
	}
	defer os.RemoveAll(dir)

	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte(code), 0o600); err != nil {
		return Result{Status: StatusInternal, Message: err.Error()}, nil
	}

	// Шаг 1: сборка. Так ошибки компиляции отличаются от ошибок выполнения,
	// а время компиляции не попадает в лимит программы.
	binary := filepath.Join(dir, "program")
	buildResult, ok := r.build(ctx, dir, binary)
	if !ok {
		buildResult.DurationMs = time.Since(started).Milliseconds()
		return buildResult, nil
	}
	buildMs := buildResult.BuildMs

	// Шаг 2: выполнение готового бинарника. Прямой запуск даёт точный контроль
	// времени и позволяет завершить процесс, не оставляя потомков.
	runCtx, runCancel := context.WithTimeout(ctx, r.cfg.Timeout)
	defer runCancel()

	runStart := time.Now()
	cmd := exec.CommandContext(runCtx, binary)
	cmd.Dir = dir
	cmd.Env = r.env(dir)

	stdout := &limitedBuffer{max: r.cfg.MaxOutput, cancel: runCancel}
	stderr := &limitedBuffer{max: r.cfg.MaxOutput, cancel: runCancel}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.Stdin = strings.NewReader("")

	err = cmd.Run()
	durationMs := time.Since(runStart).Milliseconds()

	result := Result{
		Status:      StatusOK,
		DurationMs:  durationMs,
		BuildMs:     buildMs,
		Stdout:      stdout.String(),
		Stderr:      stderr.String(),
		Truncated:   stdout.Truncated || stderr.Truncated,
		Diagnostics: []Diagnostic{},
	}
	if result.Truncated {
		result.KilledByLimit = true
	}

	switch {
	case runCtx.Err() == context.DeadlineExceeded:
		result.Status = StatusTimeout
		result.TimedOut = true
		result.Message = fmt.Sprintf("превышен лимит %s: процесс остановлен", r.cfg.Timeout)
		result.Stderr += fmt.Sprintf("\n[go-academy] выполнение прервано через %s\n", r.cfg.Timeout)
	case err != nil:
		result.Status = StatusRuntimeError
		result.ExitCode = exitCode(err)
		result.Message = "программа завершилась с ошибкой"
		result.Diagnostics = parseRuntimeDiagnostics(result.Stderr)
	}
	return result, nil
}

// Build только компилирует код, не выполняя его: это кнопка «Проверить».
func (r *Runner) Build(ctx context.Context, code string) (Result, error) {
	started := time.Now()
	if strings.TrimSpace(code) == "" {
		return Result{Status: StatusRejected, Message: "код пустой", Diagnostics: []Diagnostic{}}, nil
	}
	if len(code) > r.cfg.MaxCode {
		return Result{
			Status:      StatusRejected,
			Message:     fmt.Sprintf("код больше %d КиБ — сократите пример", r.cfg.MaxCode>>10),
			Diagnostics: []Diagnostic{},
		}, nil
	}
	if reason := checkImports(code); reason != "" {
		return Result{Status: StatusRejected, Message: reason, Diagnostics: []Diagnostic{}}, nil
	}
	if _, _, _, err := r.detect(ctx); err != nil {
		return Result{Status: StatusInternal, Message: err.Error(), Diagnostics: []Diagnostic{}}, nil
	}
	if err := r.acquire(ctx); err != nil {
		return Result{Status: StatusRejected, Message: err.Error(), Diagnostics: []Diagnostic{}}, nil
	}
	defer r.release()

	dir, err := r.tempDir()
	if err != nil {
		return Result{Status: StatusInternal, Message: err.Error(), Diagnostics: []Diagnostic{}}, nil
	}
	defer os.RemoveAll(dir)

	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte(code), 0o600); err != nil {
		return Result{Status: StatusInternal, Message: err.Error(), Diagnostics: []Diagnostic{}}, nil
	}

	result, ok := r.build(ctx, dir, filepath.Join(dir, "program"))
	result.DurationMs = time.Since(started).Milliseconds()
	if ok {
		result.Status = StatusOK
		result.Message = "код компилируется"
	}
	return result, nil
}

// tempDir создаёт каталог запуска внутри WorkRoot.
func (r *Runner) tempDir() (string, error) {
	if r.cfg.WorkRoot != "" {
		if err := os.MkdirAll(r.cfg.WorkRoot, 0o755); err != nil {
			return "", fmt.Errorf("не удалось создать каталог запусков: %w", err)
		}
	}
	dir, err := os.MkdirTemp(r.cfg.WorkRoot, "go-academy-run-*")
	if err != nil {
		return "", fmt.Errorf("не удалось создать временный каталог: %w", err)
	}
	return dir, nil
}

// build компилирует main.go в binary. Второе значение — успех сборки.
func (r *Runner) build(ctx context.Context, dir, binary string) (Result, bool) {
	buildCtx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()

	// Собираем в «файловом» режиме (без go.mod): так запуск работает и внутри
	// системного temp-каталога, где Go намеренно игнорирует go.mod.
	cmd := exec.CommandContext(buildCtx, r.binary, "build", "-o", binary, "main.go")
	cmd.Dir = dir
	cmd.Env = r.env(dir)
	out := &limitedBuffer{max: r.cfg.MaxOutput}
	cmd.Stdout = out
	cmd.Stderr = out
	started := time.Now()
	err := cmd.Run()

	result := Result{BuildMs: time.Since(started).Milliseconds(), Diagnostics: []Diagnostic{}}
	if err != nil {
		if buildCtx.Err() == context.DeadlineExceeded {
			result.Status = StatusTimeout
			result.TimedOut = true
			result.Message = "сборка заняла слишком много времени"
			return result, false
		}
		result.Status = StatusCompileError
		result.ExitCode = 1
		result.Stderr = out.String()
		result.Truncated = out.Truncated
		result.Diagnostics = parseCompileOutput(result.Stderr)
		result.Message = "код не компилируется"
		if len(result.Diagnostics) == 0 {
			result.Message = strings.TrimSpace(firstLine(result.Stderr))
		}
		return result, false
	}
	return result, true
}

func (r *Runner) acquire(ctx context.Context) error {
	select {
	case r.slots <- struct{}{}:
		return nil
	default:
	}
	timer := time.NewTimer(r.cfg.QueueTimeout)
	defer timer.Stop()
	select {
	case r.slots <- struct{}{}:
		return nil
	case <-timer.C:
		return fmt.Errorf("слишком много одновременных запусков (лимит %d): попробуйте через несколько секунд", r.cfg.Concurrency)
	case <-ctx.Done():
		return errors.New("запрос отменён")
	}
}

func (r *Runner) release() { <-r.slots }

// env собирает окружение запуска: без сети, без обращения к пользовательским
// каталогам и без подмены toolchain.
func (r *Runner) env(dir string) []string {
	env := []string{
		"PATH=" + filepath.Dir(r.binary) + string(os.PathListSeparator) + os.Getenv("PATH"),
		"HOME=" + dir,
		"TMPDIR=" + dir,
		"GOPROXY=off",
		"GOTOOLCHAIN=local",
		"CGO_ENABLED=0",
		"GOWORK=off",
		"LANG=C.UTF-8",
	}
	if r.goroot != "" {
		env = append(env, "GOROOT="+r.goroot)
	}
	if r.cfg.CacheDir != "" {
		env = append(env, "GOCACHE="+r.cfg.CacheDir)
	}
	return env
}

// checkImports отклоняет код, который пытается запускать внешние команды или
// подключать плагины. Это не защита от вредоносного кода, а разумное ограничение
// учебной среды: интерфейс не должен превращаться в оболочку.
func checkImports(code string) string {
	file, err := parser.ParseFile(token.NewFileSet(), "main.go", code, parser.ImportsOnly)
	if err != nil {
		return "" // синтаксис проверит компилятор и вернёт понятные ошибки
	}
	blocked := map[string]string{
		"os/exec": "запуск внешних команд из кода заблокирован в учебной среде",
		"plugin":  "динамические плагины запрещены в учебной среде",
	}
	for _, spec := range file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		if reason, ok := blocked[path]; ok {
			return reason + " (импорт " + path + ")"
		}
	}
	return ""
}

// limitedBuffer хранит не больше max байт и при переполнении останавливает процесс.
type limitedBuffer struct {
	mu        sync.Mutex
	buf       bytes.Buffer
	max       int
	Truncated bool
	cancel    context.CancelFunc
}

func (l *limitedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	remaining := l.max - l.buf.Len()
	if remaining <= 0 {
		l.Truncated = true
		if l.cancel != nil {
			l.cancel()
		}
		return len(p), nil
	}
	if len(p) > remaining {
		l.buf.Write(p[:remaining])
		l.Truncated = true
		if l.cancel != nil {
			l.cancel()
		}
		return len(p), nil
	}
	return l.buf.Write(p)
}

func (l *limitedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.String()
}

func exitCode(err error) int {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}

func firstLine(s string) string {
	if index := strings.IndexByte(s, '\n'); index >= 0 {
		return s[:index]
	}
	return s
}

// compileErrorPattern ловит строки вида "./main.go:5:2: undefined: value".
var compileErrorPattern = regexp.MustCompile(`^(?:\./)?([\w./-]+\.go):(\d+)(?::(\d+))?:\s*(.+)$`)

// parseCompileOutput превращает вывод компилятора в список диагностик.
func parseCompileOutput(output string) []Diagnostic {
	diagnostics := []Diagnostic{}
	seen := map[string]bool{}
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		match := compileErrorPattern.FindStringSubmatch(line)
		if match == nil {
			if len(diagnostics) == 0 {
				diagnostics = append(diagnostics, Diagnostic{
					File:     "main.go",
					Message:  line,
					Severity: "error",
				})
			}
			continue
		}
		column := 0
		if match[3] != "" {
			column, _ = strconv.Atoi(match[3])
		}
		lineNumber, _ := strconv.Atoi(match[2])
		message := strings.TrimSpace(match[4])
		key := fmt.Sprintf("%d:%d:%s", lineNumber, column, message)
		if seen[key] {
			continue
		}
		seen[key] = true
		diagnostics = append(diagnostics, Diagnostic{
			File:     normalizeFile(match[1]),
			Line:     lineNumber,
			Column:   column,
			Message:  message,
			Severity: "error",
		})
	}
	sort.SliceStable(diagnostics, func(i, j int) bool {
		return diagnostics[i].Line < diagnostics[j].Line
	})
	return diagnostics
}

// parseRuntimeDiagnostics достаёт причину паники и место в коде.
func parseRuntimeDiagnostics(stderr string) []Diagnostic {
	diagnostics := []Diagnostic{}
	lines := strings.Split(stderr, "\n")
	panicMessage := ""
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "panic: ") {
			panicMessage = strings.TrimPrefix(trimmed, "panic: ")
			break
		}
	}
	location := regexp.MustCompile(`^(?:\./)?([\w./-]+\.go):(\d+)(?:\s|$|\s\+\S+)`)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if match := location.FindStringSubmatch(trimmed); match != nil {
			lineNumber, _ := strconv.Atoi(match[2])
			if lineNumber == 0 {
				continue
			}
			message := panicMessage
			if message == "" {
				message = "ошибка во время выполнения"
			}
			diagnostics = append(diagnostics, Diagnostic{
				File:     normalizeFile(match[1]),
				Line:     lineNumber,
				Message:  message,
				Severity: "error",
			})
			break
		}
	}
	if len(diagnostics) == 0 && panicMessage != "" {
		diagnostics = append(diagnostics, Diagnostic{File: "main.go", Message: panicMessage, Severity: "error"})
	}
	return diagnostics
}

// diagnosticsFromError превращает ошибку go/format в список диагностик.
// go/format возвращает scanner.ErrorList с точными позициями.
func diagnosticsFromError(err error) []Diagnostic {
	diagnostics := []Diagnostic{}
	var list scanner.ErrorList
	if errors.As(err, &list) {
		for _, item := range list {
			diagnostics = append(diagnostics, Diagnostic{
				File:     "main.go",
				Line:     item.Pos.Line,
				Column:   item.Pos.Column,
				Message:  item.Msg,
				Severity: "error",
			})
		}
		return diagnostics
	}
	return []Diagnostic{{File: "main.go", Message: err.Error(), Severity: "error"}}
}

// normalizeFile приводит путь временного каталога к имени файла.
func normalizeFile(name string) string {
	name = strings.TrimPrefix(name, "./")
	if idx := strings.LastIndexByte(name, '/'); idx >= 0 {
		return name[idx+1:]
	}
	return name
}
