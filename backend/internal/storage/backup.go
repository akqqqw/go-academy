package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"goacademy/internal/database"
)

// Backup — резервная копия базы данных.
type Backup struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt string `json:"created_at"`
}

// Backups управляет резервными копиями в каталоге данных.
type Backups struct {
	db  *database.DB
	dir string
}

// NewBackups создаёт сервис резервного копирования.
func NewBackups(db *database.DB, dataDir string) *Backups {
	return &Backups{db: db, dir: filepath.Join(dataDir, "backups")}
}

// CreateBackup делает копию базы и возвращает её описание.
func (b *Backups) CreateBackup(ctx context.Context) (Backup, error) {
	if err := os.MkdirAll(b.dir, 0o755); err != nil {
		return Backup{}, fmt.Errorf("создать каталог копий: %w", err)
	}
	if err := b.db.Checkpoint(ctx); err != nil {
		return Backup{}, fmt.Errorf("сбросить WAL: %w", err)
	}
	stamp := time.Now().Format("20060102-150405")
	name := fmt.Sprintf("academy-%s.db", stamp)
	dest := filepath.Join(b.dir, name)
	if err := b.db.BackupTo(ctx, dest); err != nil {
		return Backup{}, fmt.Errorf("скопировать базу: %w", err)
	}
	return b.describe(dest)
}

// List возвращает резервные копии (новые сначала).
func (b *Backups) List() ([]Backup, error) {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []Backup{}, nil
		}
		return nil, err
	}
	backups := make([]Backup, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".db") {
			continue
		}
		item, err := b.describe(filepath.Join(b.dir, entry.Name()))
		if err != nil {
			continue
		}
		backups = append(backups, item)
	}
	sort.Slice(backups, func(i, j int) bool { return backups[i].Name > backups[j].Name })
	return backups, nil
}

// Rotate оставляет только keep последних копий.
func (b *Backups) Rotate(keep int) error {
	if keep < 1 {
		keep = 1
	}
	backups, err := b.List()
	if err != nil {
		return err
	}
	for i, backup := range backups {
		if i < keep {
			continue
		}
		_ = os.Remove(backup.Path)
	}
	return nil
}

// BackupOnStart делает копию при запуске сервера и чистит старые.
func BackupOnStart(ctx context.Context, db *database.DB, dataDir string, keep int) (Backup, error) {
	manager := NewBackups(db, dataDir)
	backup, err := manager.CreateBackup(ctx)
	if err != nil {
		return Backup{}, err
	}
	if err := manager.Rotate(keep); err != nil {
		return backup, err
	}
	return backup, nil
}

func (b *Backups) describe(path string) (Backup, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Backup{}, err
	}
	return Backup{
		Name:      info.Name(),
		Path:      path,
		SizeBytes: info.Size(),
		CreatedAt: info.ModTime().Format(time.RFC3339),
	}, nil
}
