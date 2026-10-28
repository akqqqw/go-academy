//go:build vercel

package contentfs

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// assets — копия content/, сделанная командой сборки (см. vercel.json).
//
//go:embed assets
var assets embed.FS

func materialize(dir string) (bool, error) {
	root, err := fs.Sub(assets, "assets")
	if err != nil {
		return false, fmt.Errorf("встроенный контент: %w", err)
	}
	if dir == "" {
		return false, fmt.Errorf("встроенный контент: не задан каталог распаковки")
	}
	// Инстанс может перезапускаться в том же /tmp: распаковываем заново,
	// чтобы не смешивать старую и новую версии контента.
	if err := os.RemoveAll(dir); err != nil {
		return false, fmt.Errorf("очистить каталог контента: %w", err)
	}

	err = fs.WalkDir(root, ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		target := filepath.Join(dir, filepath.FromSlash(path))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := fs.ReadFile(root, path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
	if err != nil {
		return false, fmt.Errorf("распаковать контент: %w", err)
	}
	return true, nil
}
