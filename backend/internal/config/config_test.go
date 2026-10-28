package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// Тесты не должны зависеть от окружения: Vercel выставляет VERCEL=1.
	t.Setenv("VERCEL", "")

	cfg, err := Load(nil)
	if err != nil {
		t.Fatalf("загрузить конфигурацию: %v", err)
	}
	if cfg.Addr != "127.0.0.1:8080" {
		t.Errorf("addr = %s", cfg.Addr)
	}
	if filepath.Base(cfg.DataDir) != "data" {
		t.Errorf("data dir = %s", cfg.DataDir)
	}
	if filepath.Base(cfg.ContentDir) != "content" {
		t.Errorf("content dir = %s", cfg.ContentDir)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Errorf("origins = %v", cfg.AllowedOrigins)
	}
}

func TestLoadFlags(t *testing.T) {
	cfg, err := Load([]string{"-host", "0.0.0.0", "-port", "9090", "-cors", "http://a.test, http://b.test"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != "0.0.0.0:9090" {
		t.Errorf("addr = %s", cfg.Addr)
	}
	if len(cfg.AllowedOrigins) != 2 || cfg.AllowedOrigins[1] != "http://b.test" {
		t.Errorf("origins = %v", cfg.AllowedOrigins)
	}
}

func TestLoadInvalidPort(t *testing.T) {
	if _, err := Load([]string{"-port", "70000"}); err == nil {
		t.Fatal("ожидалась ошибка для некорректного порта")
	}
}

// TestLoadServerlessDefaults проверяет настройки для Vercel: платформа задаёт
// порт через PORT, слушать нужно на всех интерфейсах, а писать — только в /tmp.
func TestLoadServerlessDefaults(t *testing.T) {
	t.Setenv("VERCEL", "1")
	t.Setenv("PORT", "3001")
	t.Setenv("GOACADEMY_HOST", "")
	t.Setenv("GOACADEMY_PORT", "")
	t.Setenv("GOACADEMY_DATA_DIR", "")
	t.Setenv("GOACADEMY_CONTENT_DIR", "")
	t.Setenv("GOACADEMY_FRONTEND_DIR", "")

	cfg, err := Load(nil)
	if err != nil {
		t.Fatalf("загрузить конфигурацию: %v", err)
	}
	if cfg.Addr != "0.0.0.0:3001" {
		t.Errorf("addr = %s, ожидался 0.0.0.0:3001", cfg.Addr)
	}
	// В serverless-окружении писать можно только в /tmp, репозиторий read-only.
	if !filepath.IsAbs(cfg.DataDir) {
		t.Errorf("каталог данных не абсолютный: %s", cfg.DataDir)
	}
	if cfg.DataDir != filepath.Join(os.TempDir(), "go-academy") {
		t.Errorf("каталог данных = %s, ожидался %s", cfg.DataDir, filepath.Join(os.TempDir(), "go-academy"))
	}
	if cfg.FrontendDir != "" {
		t.Errorf("статику раздаёт отдельный сервис, frontend dir = %s", cfg.FrontendDir)
	}
}

// TestLoadServerlessExplicitPort проверяет, что GOACADEMY_PORT важнее PORT.
func TestLoadServerlessExplicitPort(t *testing.T) {
	t.Setenv("VERCEL", "1")
	t.Setenv("PORT", "3001")
	t.Setenv("GOACADEMY_PORT", "9090")

	cfg, err := Load(nil)
	if err != nil {
		t.Fatalf("загрузить конфигурацию: %v", err)
	}
	if cfg.Addr != "0.0.0.0:9090" {
		t.Errorf("addr = %s, ожидался 0.0.0.0:9090", cfg.Addr)
	}
}
