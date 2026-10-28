// Package deploy проверяет конфигурацию развёртывания на Vercel.
//
// Файл vercel.json лежит в корне репозитория, но именно от него зависит,
// соберутся ли сервисы и попадёт ли запрос в нужный backend. Ошибка в нём
// обнаруживается только на деплое, поэтому проверяем его обычным тестом.
package deploy

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoRoot — корень репозитория относительно этого пакета.
const repoRoot = "../../.."

type binding struct {
	Type    string `json:"type"`
	Service string `json:"service"`
	Format  string `json:"format"`
	Env     string `json:"env"`
}

type destination struct {
	Service string `json:"service"`
	Path    string `json:"path"`
}

type rewrite struct {
	Source      string `json:"source"`
	Destination any    `json:"destination"`
}

// serviceDestination возвращает сервис, в который ведёт правило (если оно
// адресовано сервису, а не локальному пути внутри сервиса).
func serviceDestination(value any) (string, string) {
	object, ok := value.(map[string]any)
	if !ok {
		return "", ""
	}
	service, _ := object["service"].(string)
	path, _ := object["path"].(string)
	return service, path
}

// localDestination возвращает локальный путь правила внутри сервиса.
func localDestination(value any) string {
	path, _ := value.(string)
	return path
}

type service struct {
	Root            string    `json:"root"`
	Framework       string    `json:"framework"`
	Runtime         string    `json:"runtime"`
	Entrypoint      string    `json:"entrypoint"`
	BuildCommand    string    `json:"buildCommand"`
	OutputDirectory string    `json:"outputDirectory"`
	Bindings        []binding `json:"bindings"`
	Rewrites        []rewrite `json:"rewrites"`
}

type vercelConfig struct {
	Services map[string]service `json:"services"`
	Rewrites []rewrite          `json:"rewrites"`
}

func loadConfig(t *testing.T) (vercelConfig, map[string]json.RawMessage) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(repoRoot, "vercel.json"))
	if err != nil {
		t.Fatalf("прочитать vercel.json: %v", err)
	}
	var cfg vercelConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("разобрать vercel.json: %v", err)
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		t.Fatalf("разобрать vercel.json как объект: %v", err)
	}
	return cfg, top
}

// TestServicesDefined проверяет состав сервисов и то, что их каталоги существуют.
func TestServicesDefined(t *testing.T) {
	cfg, _ := loadConfig(t)

	for _, name := range []string{"backend", "frontend"} {
		if _, ok := cfg.Services[name]; !ok {
			t.Fatalf("сервис %q не описан в vercel.json", name)
		}
	}
	if len(cfg.Services) != 2 {
		t.Errorf("сервисов = %d, ожидалось 2", len(cfg.Services))
	}

	for name, svc := range cfg.Services {
		if svc.Root == "" {
			t.Errorf("%s: не задан root", name)
			continue
		}
		info, err := os.Stat(filepath.Join(repoRoot, svc.Root))
		if err != nil || !info.IsDir() {
			t.Errorf("%s: каталог %q не найден", name, svc.Root)
		}
		if svc.Runtime != "" {
			t.Errorf("%s: runtime задаётся только для контейнеров, получено %q", name, svc.Runtime)
		}
	}

	backend := cfg.Services["backend"]
	if backend.Framework != "go" {
		t.Errorf("backend: framework = %q, ожидался go", backend.Framework)
	}
	if _, err := os.Stat(filepath.Join(repoRoot, backend.Root, "go.mod")); err != nil {
		t.Errorf("backend: нет go.mod в %s", backend.Root)
	}
	// Go-пресет ищет точку входа среди main.go, cmd/api/main.go, cmd/server/main.go.
	if _, err := os.Stat(filepath.Join(repoRoot, backend.Root, "cmd", "server", "main.go")); err != nil {
		t.Errorf("backend: не найдена точка входа cmd/server/main.go")
	}

	frontend := cfg.Services["frontend"]
	if frontend.Framework != "vite" {
		t.Errorf("frontend: framework = %q, ожидался vite", frontend.Framework)
	}
	// Явные сборка и каталог результата: не полагаемся на автоопределение.
	if frontend.BuildCommand != "npm run build" {
		t.Errorf("frontend: buildCommand = %q, ожидался npm run build", frontend.BuildCommand)
	}
	if frontend.OutputDirectory != "dist" {
		t.Errorf("frontend: outputDirectory = %q, ожидался dist", frontend.OutputDirectory)
	}
	if _, err := os.Stat(filepath.Join(repoRoot, frontend.Root, "vite.config.ts")); err != nil {
		t.Errorf("frontend: нет vite.config.ts в %s", frontend.Root)
	}
}

// TestTopLevelBuildKeys проверяет, что сборка настроек не осталась на верхнем
// уровне: в режиме сервисов buildCommand/framework/functions там недопустимы.
func TestTopLevelBuildKeys(t *testing.T) {
	_, top := loadConfig(t)
	for _, key := range []string{
		"framework", "runtime", "functions", "buildCommand", "installCommand",
		"devCommand", "ignoreCommand", "outputDirectory",
	} {
		if _, ok := top[key]; ok {
			t.Errorf("ключ %q должен быть внутри сервиса, а не в корне", key)
		}
	}
	if _, ok := top["rewrites"]; !ok {
		t.Error("в корне должны остаться публичные rewrites")
	}
}

// TestRouting проверяет порядок и цели rewrite-правил: сначала API, потом SPA.
func TestRouting(t *testing.T) {
	cfg, _ := loadConfig(t)
	if len(cfg.Rewrites) != 2 {
		t.Fatalf("правил маршрутизации = %d, ожидалось 2", len(cfg.Rewrites))
	}

	api := cfg.Rewrites[0]
	if api.Source != "/api/(.*)" {
		t.Errorf("первое правило: source = %q, ожидался /api/(.*)", api.Source)
	}
	apiService, apiPath := serviceDestination(api.Destination)
	if apiService != "backend" {
		t.Errorf("первое правило ведёт в %q, ожидался backend", apiService)
	}
	// Backend ждёт запросы вида /api/..., поэтому путь переписывать нельзя.
	if apiPath != "" {
		t.Errorf("путь не должен переписываться: backend ожидает /api/..., получено %q", apiPath)
	}

	spa := cfg.Rewrites[len(cfg.Rewrites)-1]
	if spa.Source != "/(.*)" {
		t.Errorf("последнее правило: source = %q, ожидался catch-all /(.*)", spa.Source)
	}
	if spaService, _ := serviceDestination(spa.Destination); spaService != "frontend" {
		t.Errorf("последнее правило ведёт в %q, ожидался frontend", spaService)
	}

	for index, rule := range cfg.Rewrites {
		service, _ := serviceDestination(rule.Destination)
		if _, ok := cfg.Services[service]; !ok {
			t.Errorf("правило %d ведёт в неизвестный сервис %q", index+1, service)
		}
	}
}

// TestFrontendSpaFallback проверяет SPA-маршрутизацию внутри frontend-сервиса:
// глубокие ссылки вроде /learning/m03-01 должны отдавать index.html, а реальные
// файлы из dist/ — сами себя (rewrites проверяют файловую систему первыми).
func TestFrontendSpaFallback(t *testing.T) {
	cfg, _ := loadConfig(t)
	rewrites := cfg.Services["frontend"].Rewrites
	if len(rewrites) != 1 {
		t.Fatalf("rewrites frontend = %d, ожидался один SPA-fallback", len(rewrites))
	}
	fallback := rewrites[0]
	if fallback.Source != "/(.*)" || localDestination(fallback.Destination) != "/index.html" {
		t.Errorf("fallback = %+v, ожидался /(.*) -> /index.html", fallback)
	}
	global := cfg.Rewrites[0]
	if global.Source != "/api/(.*)" {
		t.Errorf("API должно маршрутизироваться на верхнем уровне раньше SPA: %q", global.Source)
	}
}

// TestBackendBuildEmbedsContent проверяет, что сборка копирует контент в
// сервис backend и собирает бинарник с тегом vercel (см. internal/contentfs).
func TestBackendBuildEmbedsContent(t *testing.T) {
	cfg, _ := loadConfig(t)
	command := cfg.Services["backend"].BuildCommand
	for _, part := range []string{"../content", "internal/contentfs/assets", "-tags vercel", "./cmd/server"} {
		if !strings.Contains(command, part) {
			t.Errorf("buildCommand не содержит %q: %s", part, command)
		}
	}
}

// TestBindingsTargetKnownServices проверяет, что bindings ссылаются на
// существующие сервисы и заполнены полностью.
func TestBindingsTargetKnownServices(t *testing.T) {
	cfg, _ := loadConfig(t)
	for name, svc := range cfg.Services {
		for _, b := range svc.Bindings {
			if b.Type != "service" || b.Format != "url" || b.Service == "" || b.Env == "" {
				t.Errorf("%s: неполный binding %+v", name, b)
			}
			if _, ok := cfg.Services[b.Service]; !ok {
				t.Errorf("%s: binding ссылается на неизвестный сервис %q", name, b.Service)
			}
			if b.Service == name {
				t.Errorf("%s: binding на самого себя", name)
			}
		}
	}
}
