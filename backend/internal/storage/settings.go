// Package storage содержит доступ к данным приложения: настройки, активность,
// статистику и резервные копии. SQL-запросы живут здесь, HTTP-слой их не знает.
package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"goacademy/internal/database"
)

// Kind — тип значения настройки.
type Kind string

const (
	KindString Kind = "string"
	KindInt    Kind = "int"
	KindBool   Kind = "bool"
)

// Definition описывает одну настройку: тип, значение по умолчанию и ограничения.
type Definition struct {
	Key     string
	Kind    Kind
	Default any
	Enum    []string
	Min     int
	Max     int
	Group   string
	Label   string
}

// Definitions — реестр всех настроек приложения. Он же служит схемой валидации
// для PATCH /api/settings и источником значений по умолчанию.
var Definitions = []Definition{
	{Key: "theme", Kind: KindString, Default: "dark", Enum: []string{"dark", "light", "system"}, Group: "appearance", Label: "Тема"},
	{Key: "sidebar_collapsed", Kind: KindBool, Default: false, Group: "appearance", Label: "Свёрнутая боковая панель"},
	{Key: "reduced_motion", Kind: KindBool, Default: false, Group: "appearance", Label: "Меньше анимаций"},
	{Key: "daily_goal_minutes", Kind: KindInt, Default: 15, Min: 5, Max: 240, Group: "goals", Label: "Минут обучения в день"},
	{Key: "daily_goal_exercises", Kind: KindInt, Default: 3, Min: 1, Max: 20, Group: "goals", Label: "Задач в день"},
	{Key: "daily_goal_cards", Kind: KindInt, Default: 10, Min: 1, Max: 100, Group: "goals", Label: "Карточек в день"},
	{Key: "editor_font_size", Kind: KindInt, Default: 14, Min: 11, Max: 22, Group: "editor", Label: "Размер шрифта редактора"},
	{Key: "editor_tab_size", Kind: KindInt, Default: 4, Min: 2, Max: 8, Group: "editor", Label: "Ширина табуляции"},
	{Key: "code_autosave", Kind: KindBool, Default: true, Group: "editor", Label: "Автосохранение кода"},
	{Key: "onboarding_completed", Kind: KindBool, Default: false, Group: "system", Label: "Вводный тур пройден"},
}

func definitionByKey(key string) (Definition, bool) {
	for _, def := range Definitions {
		if def.Key == key {
			return def, true
		}
	}
	return Definition{}, false
}

// Defaults возвращает карту значений по умолчанию.
func Defaults() map[string]any {
	out := make(map[string]any, len(Definitions))
	for _, def := range Definitions {
		out[def.Key] = def.Default
	}
	return out
}

// Settings — сервис настроек.
type Settings struct{ db *database.DB }

// NewSettings создаёт сервис настроек.
func NewSettings(db *database.DB) *Settings { return &Settings{db: db} }

// All возвращает полный набор настроек: значения из базы поверх значений по умолчанию.
func (s *Settings) All(ctx context.Context) (map[string]any, error) {
	out := Defaults()
	rows, err := s.db.QueryContext(ctx, "SELECT key, value FROM settings")
	if err != nil {
		return nil, fmt.Errorf("прочитать настройки: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key, raw string
		if err := rows.Scan(&key, &raw); err != nil {
			return nil, err
		}
		def, ok := definitionByKey(key)
		if !ok {
			continue // устаревшие ключи игнорируем, но не удаляем
		}
		value, err := decodeValue(def, raw)
		if err != nil {
			continue // повреждённое значение не должно ломать приложение
		}
		out[key] = value
	}
	return out, rows.Err()
}

// ValidationError описывает одну невалидную настройку.
type ValidationError struct {
	Key     string `json:"key"`
	Message string `json:"message"`
}

// Patch проверяет и сохраняет изменения настроек, возвращая актуальный набор.
func (s *Settings) Patch(ctx context.Context, changes map[string]any) (map[string]any, error) {
	if len(changes) == 0 {
		return s.All(ctx)
	}
	keys := make([]string, 0, len(changes))
	for key := range changes {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var validation []ValidationError
	normalized := make(map[string]any, len(changes))
	for _, key := range keys {
		def, ok := definitionByKey(key)
		if !ok {
			validation = append(validation, ValidationError{Key: key, Message: "неизвестная настройка"})
			continue
		}
		value, msg := normalize(def, changes[key])
		if msg != "" {
			validation = append(validation, ValidationError{Key: key, Message: msg})
			continue
		}
		normalized[key] = value
	}
	if len(validation) > 0 {
		return nil, &SettingsValidationError{Issues: validation}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	now := database.Now()
	for key, value := range normalized {
		raw, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			key, string(raw), now); err != nil {
			return nil, fmt.Errorf("сохранить настройку %s: %w", key, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.All(ctx)
}

// SettingsValidationError агрегирует ошибки валидации.
type SettingsValidationError struct {
	Issues []ValidationError
}

func (e *SettingsValidationError) Error() string {
	return fmt.Sprintf("некорректные настройки: %d", len(e.Issues))
}

func decodeValue(def Definition, raw string) (any, error) {
	switch def.Kind {
	case KindInt:
		var v int
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			return nil, err
		}
		return v, nil
	case KindBool:
		var v bool
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			return nil, err
		}
		return v, nil
	default:
		var v string
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			return nil, err
		}
		return v, nil
	}
}

// normalize приводит значение к нужному типу и проверяет ограничения.
// Второе возвращаемое значение — текст ошибки (пустой, если всё в порядке).
func normalize(def Definition, value any) (any, string) {
	switch def.Kind {
	case KindInt:
		var num int
		switch v := value.(type) {
		case float64:
			if v != float64(int(v)) {
				return nil, "ожидается целое число"
			}
			num = int(v)
		case int:
			num = v
		case json.Number:
			parsed, err := v.Int64()
			if err != nil {
				return nil, "ожидается целое число"
			}
			num = int(parsed)
		default:
			return nil, "ожидается целое число"
		}
		if num < def.Min || num > def.Max {
			return nil, fmt.Sprintf("допустимый диапазон: %d–%d", def.Min, def.Max)
		}
		return num, ""
	case KindBool:
		if v, ok := value.(bool); ok {
			return v, ""
		}
		return nil, "ожидается true или false"
	default:
		str, ok := value.(string)
		if !ok {
			return nil, "ожидается строка"
		}
		if len(def.Enum) > 0 {
			for _, allowed := range def.Enum {
				if str == allowed {
					return str, ""
				}
			}
			return nil, fmt.Sprintf("допустимые значения: %v", def.Enum)
		}
		if len(str) > 500 {
			return nil, "слишком длинное значение"
		}
		return str, ""
	}
}
