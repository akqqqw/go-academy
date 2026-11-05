package runner

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Сервис запуска кода: проверяем протокол между API и изолированным раннером.
func TestRemoteRunnerProtocol(t *testing.T) {
	const token = "secret-token"
	var seenRun, seenTest, seenFormat bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"требуется токен сервиса"}`))
			return
		}
		var payload WireRequest
		if r.Method == http.MethodPost {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
		}
		switch r.URL.Path {
		case RemotePathRun:
			seenRun = true
			if payload.Code == "" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(Result{Status: StatusOK, ExitCode: 0, Stdout: "hi\n"})
		case RemotePathTest:
			seenTest = true
			if !strings.Contains(payload.Tests, "TestSum") {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(TestResult{Status: StatusOK, Passed: 2, Total: 2})
		case RemotePathFormat:
			seenFormat = true
			_ = json.NewEncoder(w).Encode(WireFormatResponse{Code: "package main\n", Diagnostics: []Diagnostic{}})
		case RemotePathStatus:
			_ = json.NewEncoder(w).Encode(Status{
				Available: true,
				Version:   "go1.23.0",
				Limits:    Limits{TimeoutMs: 10_000, MaxOutputBytes: 262_144, MaxCodeBytes: 262_144, Concurrency: 2},
				Warning:   "заглушка",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	remote := NewRemote(RemoteConfig{BaseURL: server.URL, Token: token, Isolated: true})
	ctx := context.Background()

	result, err := remote.Run(ctx, "package main\nfunc main(){}")
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Status != StatusOK || result.Stdout != "hi\n" || !seenRun {
		t.Fatalf("неожиданный результат Run: %+v", result)
	}

	testResult, err := remote.Test(ctx, "package main", "func TestSum(t *testing.T){}")
	if err != nil {
		t.Fatalf("Test: %v", err)
	}
	if testResult.Passed != 2 || testResult.Total != 2 || !seenTest {
		t.Fatalf("неожиданный результат Test: %+v", testResult)
	}

	formatted, diagnostics, err := remote.Format("package   main")
	if err != nil {
		t.Fatalf("Format: %v", err)
	}
	if formatted != "package main\n" || diagnostics == nil || !seenFormat {
		t.Fatalf("неожиданный результат Format: %q %v", formatted, diagnostics)
	}

	status := remote.Status(ctx)
	if !status.Available || status.Version != "go1.23.0" {
		t.Fatalf("неожиданный статус: %+v", status)
	}
	// В режиме изоляции предупреждение должно говорить о контейнере, а не
	// повторять текст локального раннера.
	if !strings.Contains(status.Warning, "контейнер") {
		t.Fatalf("предупреждение не описывает изоляцию: %q", status.Warning)
	}
}

func TestRemoteRunnerRequiresToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer right" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"требуется токен сервиса"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(Result{Status: StatusOK})
	}))
	defer server.Close()

	remote := NewRemote(RemoteConfig{BaseURL: server.URL, Token: "wrong"})
	if _, err := remote.Run(context.Background(), "package main"); err == nil {
		t.Fatal("ожидалась ошибка авторизации")
	} else if !strings.Contains(err.Error(), "требуется токен") {
		t.Fatalf("ошибка должна содержать сообщение сервиса, получено: %v", err)
	}
}

func TestRemoteRunnerUnavailableStatus(t *testing.T) {
	// Порт закрыт: Status не паникует, а сообщает причину — интерфейс покажет
	// предупреждение и отключит запуск вместо «мёртвой» кнопки.
	remote := NewRemote(RemoteConfig{BaseURL: "http://127.0.0.1:1", Timeout: 200 * time.Millisecond})
	status := remote.Status(context.Background())
	if status.Available || status.Reason == "" {
		t.Fatalf("ожидался недоступный статус с причиной, получено: %+v", status)
	}
}

func TestValidateRemoteURL(t *testing.T) {
	cases := []struct {
		url     string
		wantErr bool
	}{
		{"", false},
		{"http://127.0.0.1:8090", false},
		{"https://runner.internal", false},
		{"runner.internal:8090", true},
		{"ftp://runner", true},
		{"https://", true},
	}
	for _, tc := range cases {
		err := ValidateRemoteURL(tc.url)
		if tc.wantErr && err == nil {
			t.Errorf("ValidateRemoteURL(%q) = nil, ожидалась ошибка", tc.url)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("ValidateRemoteURL(%q) = %v, ошибки не ждали", tc.url, err)
		}
	}
}
