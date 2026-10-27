// Package course загружает программу курса из каталога content/.
// Учебный контент хранится отдельно от кода: JSON-описание курса и Markdown-файлы уроков.
package course

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// Lesson — урок в программе курса.
type Lesson struct {
	ID        string `json:"id"`
	ModuleID  string `json:"module_id"`
	Number    int    `json:"number"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Minutes   int    `json:"minutes"`
	Available bool   `json:"available"`
	// Status заполняется в API из сохранённого прогресса: not_started,
	// in_progress или completed.
	Status string `json:"status"`
}

// Module — модуль курса.
type Module struct {
	ID       string   `json:"id"`
	Number   int      `json:"number"`
	Title    string   `json:"title"`
	Summary  string   `json:"summary"`
	Level    string   `json:"level"`
	Lessons  []Lesson `json:"lessons"`
	Minutes  int      `json:"minutes"`
	Ready    int      `json:"ready"`
	Progress int      `json:"progress"`
}

// Catalog — вся программа курса.
type Catalog struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"`
	Description string   `json:"description"`
	Modules     []Module `json:"modules"`
	LessonCount int      `json:"lesson_count"`
	ReadyCount  int      `json:"ready_count"`
	Minutes     int      `json:"minutes"`
}

// fileSchema — структура content/course.json.
type fileSchema struct {
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	Description string `json:"description"`
	Modules     []struct {
		ID      string `json:"id"`
		Number  int    `json:"number"`
		Title   string `json:"title"`
		Summary string `json:"summary"`
		Level   string `json:"level"`
		Lessons []struct {
			ID      string `json:"id"`
			Title   string `json:"title"`
			Summary string `json:"summary"`
			Minutes int    `json:"minutes"`
		} `json:"lessons"`
	} `json:"modules"`
}

// Store кэширует программу курса и умеет перечитывать её с диска.
type Store struct {
	dir     string
	mu      sync.RWMutex
	catalog *Catalog
	err     error
}

// NewStore создаёт хранилище контента.
func NewStore(contentDir string) *Store {
	return &Store{dir: contentDir}
}

// Load читает программу курса. Первый успешный результат кэшируется.
func (s *Store) Load() (*Catalog, error) {
	s.mu.RLock()
	if s.catalog != nil || s.err != nil {
		catalog, err := s.catalog, s.err
		s.mu.RUnlock()
		return catalog, err
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.catalog != nil || s.err != nil {
		return s.catalog, s.err
	}
	catalog, err := s.read()
	if err != nil {
		s.err = err
		return nil, err
	}
	s.catalog = catalog
	return catalog, nil
}

// Reload сбрасывает кэш и читает контент заново.
func (s *Store) Reload() (*Catalog, error) {
	s.mu.Lock()
	s.catalog = nil
	s.err = nil
	s.mu.Unlock()
	return s.Load()
}

func (s *Store) read() (*Catalog, error) {
	path := filepath.Join(s.dir, "course.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("прочитать курс %s: %w", path, err)
	}
	var schema fileSchema
	if err := json.Unmarshal(raw, &schema); err != nil {
		return nil, fmt.Errorf("разобрать %s: %w", path, err)
	}

	catalog := &Catalog{
		Title:       schema.Title,
		Subtitle:    schema.Subtitle,
		Description: schema.Description,
	}
	for _, m := range schema.Modules {
		module := Module{
			ID:      m.ID,
			Number:  m.Number,
			Title:   m.Title,
			Summary: m.Summary,
			Level:   m.Level,
		}
		for _, l := range m.Lessons {
			lesson := Lesson{
				ID:       l.ID,
				ModuleID: m.ID,
				Number:   len(module.Lessons) + 1,
				Title:    l.Title,
				Summary:  l.Summary,
				Minutes:  l.Minutes,
				// Урок доступен, если для него есть Markdown-файл с теорией.
				Available: fileExists(filepath.Join(s.dir, "lessons", m.ID, l.ID+".md")),
			}
			module.Lessons = append(module.Lessons, lesson)
			module.Minutes += lesson.Minutes
			if lesson.Available {
				module.Ready++
			}
		}
		catalog.Modules = append(catalog.Modules, module)
		catalog.LessonCount += len(module.Lessons)
		catalog.ReadyCount += module.Ready
		catalog.Minutes += module.Minutes
	}
	if catalog.LessonCount == 0 {
		return nil, fmt.Errorf("в %s не найдено ни одного урока", path)
	}
	return catalog, nil
}

// Module ищет модуль по идентификатору.
func (c *Catalog) Module(id string) (Module, bool) {
	for _, m := range c.Modules {
		if m.ID == id {
			return m, true
		}
	}
	return Module{}, false
}

// Lesson ищет урок по идентификатору.
func (c *Catalog) Lesson(id string) (Module, Lesson, bool) {
	for _, m := range c.Modules {
		for _, l := range m.Lessons {
			if l.ID == id {
				return m, l, true
			}
		}
	}
	return Module{}, Lesson{}, false
}

// FirstLesson возвращает первый доступный урок (или самый первый в программе).
func (c *Catalog) FirstLesson() (Module, Lesson, bool) {
	for _, m := range c.Modules {
		for _, l := range m.Lessons {
			if l.Available {
				return m, l, true
			}
		}
	}
	for _, m := range c.Modules {
		if len(m.Lessons) > 0 {
			return m, m.Lessons[0], true
		}
	}
	return Module{}, Lesson{}, false
}

// SearchResult — результат глобального поиска по программе курса.
type SearchResult struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Title     string `json:"title"`
	Subtitle  string `json:"subtitle"`
	Route     string `json:"route"`
	Available bool   `json:"available"`
	Score     int    `json:"score"`
}

// SearchCatalog ищет совпадения в названиях модулей и уроков.
func SearchCatalog(c *Catalog, query string) []SearchResult {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return nil
	}
	var results []SearchResult
	for _, m := range c.Modules {
		if strings.Contains(strings.ToLower(m.Title), q) {
			results = append(results, SearchResult{
				Type:      "module",
				ID:        m.ID,
				Title:     m.Title,
				Subtitle:  fmt.Sprintf("Модуль %d · %d уроков", m.Number, len(m.Lessons)),
				Route:     "/learning",
				Available: true,
				Score:     score(m.Title, q),
			})
		}
		for _, l := range m.Lessons {
			haystack := strings.ToLower(l.Title + " " + l.Summary)
			if strings.Contains(haystack, q) {
				results = append(results, SearchResult{
					Type:      "lesson",
					ID:        l.ID,
					Title:     l.Title,
					Subtitle:  fmt.Sprintf("Модуль %d · %s", m.Number, m.Title),
					Route:     "/learning/" + l.ID,
					Available: l.Available,
					Score:     score(l.Title, q) - 1,
				})
			}
		}
	}
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Score != results[j].Score {
			return results[i].Score > results[j].Score
		}
		return results[i].Type == "module"
	})
	if len(results) > 25 {
		results = results[:25]
	}
	return results
}

// score — примитивная эвристика релевантности: совпадение с начала строки выше.
func score(title, query string) int {
	lower := strings.ToLower(title)
	switch {
	case lower == query:
		return 30
	case strings.HasPrefix(lower, query):
		return 20
	default:
		return 10
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
