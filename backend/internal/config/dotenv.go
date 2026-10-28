package config

import (
	"bufio"
	"os"
	"strings"
)

// LoadDotEnv читает простой .env (KEY=VALUE) из текущего каталога или родительского.
// Уже заданные переменные окружения не перезаписываются. Файл нужен только для
// локальной разработки: в production значения приходят из окружения платформы.
func LoadDotEnv() {
	for _, path := range []string{".env", "../.env"} {
		if err := loadEnvFile(path); err == nil {
			break
		} else if !os.IsNotExist(err) {
			continue
		}
	}

	alias("SUPABASE_ANON_KEY", "PUBLIC_KEY")
	alias("SUPABASE_DB_URL", "CONNECTION_URL")
	if os.Getenv("SUPABASE_URL") == "" {
		if derived := supabaseURLFromDatabase(os.Getenv("SUPABASE_DB_URL")); derived != "" {
			_ = os.Setenv("SUPABASE_URL", derived)
		}
	}
}

func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
	return scanner.Err()
}

func alias(target, source string) {
	if os.Getenv(target) != "" {
		return
	}
	if value := os.Getenv(source); value != "" {
		_ = os.Setenv(target, value)
	}
}
