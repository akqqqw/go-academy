package storage

import (
	"context"
	"fmt"

	"goacademy/internal/database"
)

// RecentItem — элемент ленты «Недавняя активность».
type RecentItem struct {
	// Type: lesson | exercise | note | quiz | run | card
	Type     string `json:"type"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Route    string `json:"route"`
	At       string `json:"at"`
}

// History — сервис истории действий пользователя.
type History struct{ db *database.DB }

// NewHistory создаёт сервис истории.
func NewHistory(db *database.DB) *History { return &History{db: db} }

// Recent возвращает последние действия пользователя из разных таблиц.
// Если данных ещё нет, возвращается пустой список — интерфейс покажет
// приглашение начать обучение.
func (h *History) Recent(ctx context.Context, limit int) ([]RecentItem, error) {
	if limit < 1 || limit > 50 {
		limit = 10
	}
	rows, err := h.db.QueryContext(ctx, `
		SELECT kind, ref, title, subtitle, at FROM (
			SELECT 'lesson' AS kind, id AS ref, title AS title,
			       'Урок' AS subtitle, last_opened_at AS at
			FROM lessons WHERE last_opened_at IS NOT NULL
			UNION ALL
			SELECT 'exercise', id, title, 'Практика', updated_at FROM exercises WHERE status <> 'todo'
			UNION ALL
			SELECT 'note', id, title, 'Заметка', updated_at FROM notes
			UNION ALL
			SELECT 'quiz', CAST(id AS TEXT), 'Тест ' || quiz_id, 'Викторина', created_at FROM quiz_attempts
			UNION ALL
			SELECT 'run', CAST(id AS TEXT), 'Запуск кода', 'Редактор', created_at FROM code_runs
		)
		ORDER BY at DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("прочитать недавнюю активность: %w", err)
	}
	defer rows.Close()

	items := make([]RecentItem, 0, limit)
	for rows.Next() {
		var item RecentItem
		if err := rows.Scan(&item.Type, &item.ID, &item.Title, &item.Subtitle, &item.At); err != nil {
			return nil, err
		}
		item.Route = routeFor(item.Type, item.ID)
		items = append(items, item)
	}
	return items, rows.Err()
}

func routeFor(kind, id string) string {
	switch kind {
	case "lesson":
		return "/learning/" + id
	case "exercise":
		return "/practice/" + id
	case "note":
		return "/notes/" + id
	case "quiz":
		return "/quizzes"
	case "run":
		return "/editor"
	default:
		return "/"
	}
}
