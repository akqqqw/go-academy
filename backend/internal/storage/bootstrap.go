package storage

import (
	"context"

	"goacademy/internal/database"
)

// BootstrapUser создаёт профиль и стартовые папки заметок при первом входе.
// Возвращает true, если пользователь заведён впервые (тогда вызывающий код
// синхронизирует карточки из контента).
func BootstrapUser(ctx context.Context, db *database.DB, email string) (bool, error) {
	result, err := db.ExecContext(ctx,
		`INSERT INTO user_profiles (email, created_at) VALUES (?, ?)
		 ON CONFLICT (user_id) DO NOTHING`, email, database.Now())
	if err != nil {
		return false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if inserted == 0 {
		return false, nil
	}

	folders := []struct {
		id       string
		name     string
		position int
	}{
		{id: "general", name: DefaultFolder, position: 0},
		{id: "lessons", name: LessonsFolder, position: 1},
	}
	for _, folder := range folders {
		if _, err := db.ExecContext(ctx,
			`INSERT INTO note_folders (id, name, position, created_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT DO NOTHING`, folder.id, folder.name, folder.position, database.Now()); err != nil {
			return false, err
		}
	}
	return true, nil
}
