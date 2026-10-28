// Package practice загружает практические задания курса и готовит их к
// проверке.
//
// Задания лежат отдельно от кода — в content/exercises/exercises.json. Каждое
// задание содержит условие в Markdown, стартовый код, подсказки, эталонное
// решение и файл Go-тестов. Тесты и решение в браузер не отправляются: проверка
// выполняется на сервере настоящим `go test`.
package practice

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"goacademy/internal/course"
	"goacademy/internal/runner"
)

// Ошибки загрузки заданий.
var (
	// ErrExerciseNotFound — задания с таким идентификатором нет в каталоге.
	ErrExerciseNotFound = errors.New("задание не найдено")
	// ErrCatalogInvalid — файл заданий повреждён.
	ErrCatalogInvalid = errors.New("каталог заданий заполнен неверно")
)

// Уровни сложности.
const (
	DifficultyEasy   = "easy"
	DifficultyMedium = "medium"
	DifficultyHard   = "hard"
)

// Difficulties — допустимые уровни в порядке возрастания.
var Difficulties = []string{DifficultyEasy, DifficultyMedium, DifficultyHard}

// maxCatalogBytes ограничивает размер файла заданий.
const maxCatalogBytes = 4 << 20

// Exercise — одно практическое задание в полном виде (для сервера).
type Exercise struct {
	ID          string   `json:"id"`
	Module      string   `json:"module"`
	ModuleTitle string   `json:"module_title"`
	ModuleNum   int      `json:"module_number"`
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Difficulty  string   `json:"difficulty"`
	Topics      []string `json:"topics"`
	Minutes     int      `json:"minutes"`
	Statement   string   `json:"statement"`
	StarterCode string   `json:"starter_code"`
	Hints       []string `json:"hints"`
	Solution    string   `json:"solution"`
	// Tests — скрытый файл проверок. В API не попадает: иначе решение можно
	// было бы подогнать под конкретные проверки.
	Tests string `json:"-"`
	// Checks — имена и описания проверок, которые видит пользователь.
	Checks []runner.TestCase `json:"checks"`
}

// Summary — краткая карточка задания для списка.
type Summary struct {
	ID          string   `json:"id"`
	Module      string   `json:"module"`
	ModuleTitle string   `json:"module_title"`
	ModuleNum   int      `json:"module_number"`
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Difficulty  string   `json:"difficulty"`
	Topics      []string `json:"topics"`
	Minutes     int      `json:"minutes"`
	ChecksCount int      `json:"checks_count"`
	HintsCount  int      `json:"hints_count"`
}

// Stats — количество заданий и решений.
type Stats struct {
	Total   int            `json:"total"`
	Minutes int            `json:"minutes"`
	ByLevel map[string]int `json:"by_level"`
}

// Catalog — разобранный каталог заданий.
type Catalog struct {
	Exercises []Exercise
	Stats     Stats
	byID      map[string]int
}

// Store кэширует каталог заданий и умеет перечитывать его с диска.
type Store struct {
	dir    string
	course *course.Store

	mu      sync.RWMutex
	catalog *Catalog
	err     error
}

// NewStore создаёт хранилище заданий. Курс нужен, чтобы подставлять названия
// модулей и проверять, что задание ссылается на существующий модуль.
func NewStore(contentDir string, courseStore *course.Store) *Store {
	return &Store{dir: contentDir, course: courseStore}
}

// fileSchema описывает exercises.json.
type fileSchema struct {
	Version   int `json:"version"`
	Exercises []struct {
		ID          string   `json:"id"`
		Module      string   `json:"module"`
		Title       string   `json:"title"`
		Summary     string   `json:"summary"`
		Difficulty  string   `json:"difficulty"`
		Topics      []string `json:"topics"`
		Minutes     int      `json:"minutes"`
		Statement   string   `json:"statement"`
		StarterCode string   `json:"starter_code"`
		Hints       []string `json:"hints"`
		Solution    string   `json:"solution"`
		Tests       string   `json:"tests"`
	} `json:"exercises"`
}

// Load читает каталог заданий с диска (с кэшем).
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
	catalog, err := s.parse()
	if err != nil {
		s.err = err
		return nil, err
	}
	s.catalog = catalog
	return catalog, nil
}

// Reload сбрасывает кэш: используется после правки файлов контента.
func (s *Store) Reload() (*Catalog, error) {
	s.mu.Lock()
	s.catalog = nil
	s.err = nil
	s.mu.Unlock()
	return s.Load()
}

// Get возвращает задание по идентификатору.
func (s *Store) Get(id string) (Exercise, error) {
	catalog, err := s.Load()
	if err != nil {
		return Exercise{}, err
	}
	index, ok := catalog.byID[id]
	if !ok {
		return Exercise{}, ErrExerciseNotFound
	}
	return catalog.Exercises[index], nil
}

// List возвращает краткие карточки заданий в порядке файла.
func (s *Store) List() ([]Summary, Stats, error) {
	catalog, err := s.Load()
	if err != nil {
		return nil, Stats{}, err
	}
	out := make([]Summary, 0, len(catalog.Exercises))
	for _, exercise := range catalog.Exercises {
		out = append(out, Summary{
			ID:          exercise.ID,
			Module:      exercise.Module,
			ModuleTitle: exercise.ModuleTitle,
			ModuleNum:   exercise.ModuleNum,
			Title:       exercise.Title,
			Summary:     exercise.Summary,
			Difficulty:  exercise.Difficulty,
			Topics:      exercise.Topics,
			Minutes:     exercise.Minutes,
			ChecksCount: len(exercise.Checks),
			HintsCount:  len(exercise.Hints),
		})
	}
	return out, catalog.Stats, nil
}

// parse читает файл и проверяет его целиком. Любая ошибка означает проблему в
// контенте, а не в запросе пользователя, поэтому сообщения подробные.
func (s *Store) parse() (*Catalog, error) {
	path := filepath.Join(s.dir, "exercises", "exercises.json")
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("%w: нет файла exercises/exercises.json", ErrCatalogInvalid)
	}
	if info.Size() > maxCatalogBytes {
		return nil, fmt.Errorf("%w: файл больше %d МБ", ErrCatalogInvalid, maxCatalogBytes>>20)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCatalogInvalid, err)
	}

	var file fileSchema
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&file); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCatalogInvalid, err)
	}
	if len(file.Exercises) == 0 {
		return nil, fmt.Errorf("%w: нет ни одного задания", ErrCatalogInvalid)
	}

	catalog, err := s.course.Load()
	if err != nil {
		return nil, fmt.Errorf("прочитать программу курса: %w", err)
	}
	modules := map[string]course.Module{}
	for _, module := range catalog.Modules {
		modules[module.ID] = module
	}

	parsed := &Catalog{
		Exercises: make([]Exercise, 0, len(file.Exercises)),
		byID:      make(map[string]int, len(file.Exercises)),
		Stats:     Stats{ByLevel: map[string]int{}},
	}

	for index, item := range file.Exercises {
		where := fmt.Sprintf("задание №%d (%s)", index+1, item.ID)
		if err := validateID(item.ID); err != nil {
			return nil, fmt.Errorf("%w: %s: %v", ErrCatalogInvalid, where, err)
		}
		if _, exists := parsed.byID[item.ID]; exists {
			return nil, fmt.Errorf("%w: %s: идентификатор повторяется", ErrCatalogInvalid, where)
		}
		module, ok := modules[item.Module]
		if !ok {
			return nil, fmt.Errorf("%w: %s: неизвестный модуль %q", ErrCatalogInvalid, where, item.Module)
		}
		if item.Title == "" || item.Summary == "" || item.Statement == "" {
			return nil, fmt.Errorf("%w: %s: нужны title, summary и statement", ErrCatalogInvalid, where)
		}
		if item.Difficulty != DifficultyEasy && item.Difficulty != DifficultyMedium && item.Difficulty != DifficultyHard {
			return nil, fmt.Errorf("%w: %s: сложность должна быть easy, medium или hard", ErrCatalogInvalid, where)
		}
		if len(item.Topics) == 0 {
			return nil, fmt.Errorf("%w: %s: не указаны темы", ErrCatalogInvalid, where)
		}
		if strings.TrimSpace(item.StarterCode) == "" {
			return nil, fmt.Errorf("%w: %s: нет стартового кода", ErrCatalogInvalid, where)
		}
		if strings.TrimSpace(item.Solution) == "" {
			return nil, fmt.Errorf("%w: %s: нет эталонного решения", ErrCatalogInvalid, where)
		}
		checks, err := runner.ParseTests(item.Tests)
		if err != nil {
			return nil, fmt.Errorf("%w: %s: %v", ErrCatalogInvalid, where, err)
		}
		seen := map[string]bool{}
		for _, check := range checks {
			if seen[check.Name] {
				return nil, fmt.Errorf("%w: %s: тест %s объявлен дважды", ErrCatalogInvalid, where, check.Name)
			}
			seen[check.Name] = true
		}
		if item.Minutes <= 0 {
			item.Minutes = 10
		}
		topics := make([]string, 0, len(item.Topics))
		for _, topic := range item.Topics {
			if trimmed := strings.TrimSpace(topic); trimmed != "" {
				topics = append(topics, trimmed)
			}
		}
		hints := item.Hints
		if hints == nil {
			hints = []string{}
		}

		parsed.byID[item.ID] = len(parsed.Exercises)
		parsed.Exercises = append(parsed.Exercises, Exercise{
			ID:          item.ID,
			Module:      module.ID,
			ModuleTitle: module.Title,
			ModuleNum:   module.Number,
			Title:       item.Title,
			Summary:     item.Summary,
			Difficulty:  item.Difficulty,
			Topics:      topics,
			Minutes:     item.Minutes,
			Statement:   item.Statement,
			StarterCode: item.StarterCode,
			Hints:       hints,
			Solution:    item.Solution,
			Tests:       item.Tests,
			Checks:      checks,
		})

		parsed.Stats.Total++
		parsed.Stats.Minutes += item.Minutes
		parsed.Stats.ByLevel[item.Difficulty]++
	}

	sort.SliceStable(parsed.Exercises, func(i, j int) bool {
		left, right := parsed.Exercises[i], parsed.Exercises[j]
		if left.ModuleNum != right.ModuleNum {
			return left.ModuleNum < right.ModuleNum
		}
		return false
	})
	// После сортировки индексы byID нужно пересчитать.
	for index, exercise := range parsed.Exercises {
		parsed.byID[exercise.ID] = index
	}
	return parsed, nil
}

// validateID проверяет, что идентификатор годится для URL и ключа черновика.
func validateID(id string) error {
	if id == "" {
		return errors.New("пустой идентификатор")
	}
	if len(id) > 60 {
		return errors.New("идентификатор длиннее 60 символов")
	}
	for _, char := range id {
		valid := char >= 'a' && char <= 'z' || char >= '0' && char <= '9' || char == '-'
		if !valid {
			return fmt.Errorf("идентификатор %q: только строчная латиница, цифры и дефис", id)
		}
	}
	return nil
}
