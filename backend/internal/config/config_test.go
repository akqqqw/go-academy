package config

import (
	"path/filepath"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
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
