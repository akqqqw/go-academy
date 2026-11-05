package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Протокол между API и сервисом запуска кода.
//
// Он намеренно плоский (JSON поверх HTTP) и совпадает с типами локального
// раннера, поэтому `RemoteRunner` и `Runner` взаимозаменяемы. Эндпоинты
// сервиса: POST /run, POST /build, POST /format, POST /test, GET /status.
const (
	RemotePathRun    = "/run"
	RemotePathBuild  = "/build"
	RemotePathFormat = "/format"
	RemotePathTest   = "/test"
	RemotePathStatus = "/status"

	// RemoteTimeout — потолок ожидания ответа сервиса. Он заведомо больше
	// серверных лимитов (сборка 40 с + выполнение), чтобы клиент не бросал
	// запрос раньше, чем сам сервис остановит программу.
	RemoteTimeout = 70 * time.Second
)

// RemoteConfig — настройки клиента изолированного сервиса.
type RemoteConfig struct {
	// BaseURL — адрес сервиса, например https://runner.internal:8090.
	BaseURL string
	// Token — общий секрет: сервис принимает только запросы с этим Bearer.
	Token string
	// Timeout — потолок ожидания; ноль означает RemoteTimeout.
	Timeout time.Duration
	// Isolated помечает, что код выполняется отдельным сервисом в контейнере
	// без выхода в интернет. Текст предупреждения в интерфейсе тогда честно
	// говорит об изоляции.
	Isolated bool
}

// RemoteRunner выполняет код на отдельном сервисе (контейнер без сети).
type RemoteRunner struct {
	base     string
	token    string
	client   *http.Client
	isolated bool
}

// NewRemote создаёт клиент сервиса запуска кода.
func NewRemote(cfg RemoteConfig) *RemoteRunner {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = RemoteTimeout
	}
	return &RemoteRunner{
		base:     strings.TrimRight(cfg.BaseURL, "/"),
		token:    cfg.Token,
		isolated: cfg.Isolated,
		client: &http.Client{
			Timeout: timeout,
			// Сервис живёт во внутренней сети: редиректы не нужны и опасны —
			// они могли бы увести токен на посторонний хост.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

// WireRequest — тело запросов /run, /build, /format и /test.
type WireRequest struct {
	Code  string `json:"code"`
	Tests string `json:"tests,omitempty"`
}

// WireFormatResponse — ответ /format.
type WireFormatResponse struct {
	Code        string       `json:"code"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// Run компилирует и запускает программу на удалённом сервисе.
func (r *RemoteRunner) Run(ctx context.Context, code string) (Result, error) {
	var result Result
	err := r.post(ctx, RemotePathRun, WireRequest{Code: code}, &result)
	return result, err
}

// Build компилирует код без запуска.
func (r *RemoteRunner) Build(ctx context.Context, code string) (Result, error) {
	var result Result
	err := r.post(ctx, RemotePathBuild, WireRequest{Code: code}, &result)
	return result, err
}

// Test прогоняет тесты задания.
func (r *RemoteRunner) Test(ctx context.Context, code, tests string) (TestResult, error) {
	var result TestResult
	err := r.post(ctx, RemotePathTest, WireRequest{Code: code, Tests: tests}, &result)
	return result, err
}

// Format форматирует исходник.
func (r *RemoteRunner) Format(code string) (string, []Diagnostic, error) {
	var response WireFormatResponse
	// Форматирование — чистая функция gofmt, поэтому контекст с тем же
	// потолком, что и у остальных запросов.
	ctx, cancel := context.WithTimeout(context.Background(), r.client.Timeout)
	defer cancel()
	if err := r.post(ctx, RemotePathFormat, WireRequest{Code: code}, &response); err != nil {
		return "", nil, err
	}
	return response.Code, response.Diagnostics, nil
}

// Status возвращает состояние удалённого сервиса.
func (r *RemoteRunner) Status(ctx context.Context) Status {
	var status Status
	if err := r.get(ctx, RemotePathStatus, &status); err != nil {
		return Status{
			Available: false,
			Limits:    Limits{},
			Warning:   "Сервис запуска кода недоступен: код нельзя выполнить прямо сейчас.",
			Reason:    err.Error(),
		}
	}
	if r.isolated {
		status.Warning = "Код выполняется в отдельном контейнере без выхода в интернет, с лимитами по времени, памяти и размеру вывода."
	}
	return status
}

func (r *RemoteRunner) post(ctx context.Context, path string, body any, target any) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("закодировать запрос: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.base+path, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("создать запрос: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	return r.do(request, target)
}

func (r *RemoteRunner) get(ctx context.Context, path string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, r.base+path, nil)
	if err != nil {
		return fmt.Errorf("создать запрос: %w", err)
	}
	return r.do(request, target)
}

func (r *RemoteRunner) do(request *http.Request, target any) error {
	if r.token != "" {
		request.Header.Set("Authorization", "Bearer "+r.token)
	}
	response, err := r.client.Do(request)
	if err != nil {
		return fmt.Errorf("запрос к сервису запуска кода: %w", err)
	}
	defer func() { _ = response.Body.Close() }()

	// Тело ограничено: сервис уже режет вывод, но клиент не должен верить в это
	// без проверки.
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return fmt.Errorf("прочитать ответ сервиса: %w", err)
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("сервис запуска кода ответил %d: %s", response.StatusCode, summarizeError(body))
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("разобрать ответ сервиса: %w", err)
	}
	return nil
}

// summarizeError вытаскивает сообщение из JSON-ошибки сервиса.
func summarizeError(body []byte) string {
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err == nil && payload.Error != "" {
		return payload.Error
	}
	text := strings.TrimSpace(string(body))
	if text == "" {
		return "пустой ответ"
	}
	if len(text) > 200 {
		text = text[:200] + "…"
	}
	return text
}

// ValidateRemoteURL проверяет адрес сервиса при старте: опечатка в
// CODE_RUNNER_URL должна падать сразу, а не при первом запуске кода.
func ValidateRemoteURL(raw string) error {
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("некорректный CODE_RUNNER_URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("CODE_RUNNER_URL должен начинаться с http:// или https://")
	}
	if parsed.Host == "" {
		return errors.New("CODE_RUNNER_URL без хоста")
	}
	return nil
}
