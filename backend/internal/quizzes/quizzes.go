// Package quizzes загружает викторины из content/quizzes/quizzes.json.
//
// Правильные ответы и объяснения живут только на сервере: клиент получает
// вопросы без ответов, а проверку делает submit — так подсмотреть ответ в
// сетевом ответе нельзя.
package quizzes

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"
)

// Типы вопросов.
const (
	TypeSingle    = "single"     // один вариант
	TypeMultiple  = "multiple"   // несколько вариантов
	TypeTrueFalse = "true_false" // верно/неверно
	TypeInput     = "input"      // короткий ввод текста
	TypeCode      = "code"       // вопрос по фрагменту кода
)

// Option — вариант ответа.
type Option struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// Question — вопрос викторины вместе с ответами (только для сервера).
type Question struct {
	ID          string   `json:"id"`
	Type        string   `json:"type"`
	Prompt      string   `json:"prompt"`
	Code        string   `json:"code,omitempty"`
	Options     []Option `json:"options,omitempty"`
	Correct     []string `json:"correct,omitempty"`
	Accepted    []string `json:"accepted,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
}

// Quiz — викторина по модулю.
type Quiz struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Module      int        `json:"module"`
	Level       string     `json:"level"`
	Questions   []Question `json:"questions"`
}

// Store читает и кеширует викторины.
type Store struct {
	dir string
	mu  sync.RWMutex
	all []Quiz
	err error
}

// NewStore создаёт хранилище викторин для каталога content/.
func NewStore(contentDir string) *Store {
	return &Store{dir: contentDir}
}

// Reload перечитывает файл викторин.
func (s *Store) Reload() error {
	quizzes, err := load(filepath.Join(s.dir, "quizzes", "quizzes.json"))
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.err = err
		return err
	}
	s.all = quizzes
	s.err = nil
	return nil
}

// All возвращает копию списка викторин.
func (s *Store) All() []Quiz {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Quiz, len(s.all))
	copy(out, s.all)
	return out
}

// Get находит викторину по идентификатору.
func (s *Store) Get(id string) (Quiz, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, quiz := range s.all {
		if quiz.ID == id {
			return quiz, true
		}
	}
	return Quiz{}, false
}

// TotalQuestions считает вопросы во всех викторинах.
func (s *Store) TotalQuestions() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	total := 0
	for _, quiz := range s.all {
		total += len(quiz.Questions)
	}
	return total
}

// Err возвращает последнюю ошибку загрузки.
func (s *Store) Err() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.err
}

// Normalize приводит свободный ответ к сравнимому виду: нижний регистр, без
// лишних пробелов, кавычек и завершающей точки.
func Normalize(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.Trim(value, "`\"'«»„“”")
	value = strings.Join(strings.Fields(value), " ")
	value = strings.TrimSuffix(value, ".")
	value = strings.TrimPrefix(value, "`")
	value = strings.TrimSuffix(value, "`")
	return strings.TrimSpace(value)
}

// Check проверяет ответ на вопрос. grades — выбранные идентификаторы вариантов
// или (для input) одна строка ответа.
func Check(question Question, given []string) bool {
	switch question.Type {
	case TypeInput:
		if len(given) == 0 {
			return false
		}
		answer := Normalize(given[0])
		if answer == "" {
			return false
		}
		for _, accepted := range question.Accepted {
			if Normalize(accepted) == answer {
				return true
			}
		}
		return false
	case TypeTrueFalse, TypeSingle, TypeCode:
		return len(given) == 1 && contains(question.Correct, given[0])
	case TypeMultiple:
		// Засчитывается только полный набор: ни одного лишнего, ни одного пропущенного.
		if len(given) == 0 || len(given) != len(question.Correct) {
			return false
		}
		seen := make(map[string]struct{}, len(given))
		for _, value := range given {
			if !contains(question.Correct, value) {
				return false
			}
			if _, exists := seen[value]; exists {
				return false
			}
			seen[value] = struct{}{}
		}
		return true
	default:
		return false
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func load(path string) ([]Quiz, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("прочитать викторины: %w", err)
	}
	var file struct {
		Quizzes []Quiz `json:"quizzes"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("разобрать викторины: %w", err)
	}
	if len(file.Quizzes) == 0 {
		return nil, fmt.Errorf("в %s нет ни одной викторины", filepath.Base(path))
	}

	quizIDs := make(map[string]struct{}, len(file.Quizzes))
	questionIDs := make(map[string]string, 128)
	for quizIndex := range file.Quizzes {
		quiz := &file.Quizzes[quizIndex]
		quiz.ID = strings.TrimSpace(quiz.ID)
		if quiz.ID == "" {
			return nil, fmt.Errorf("викторина №%d без идентификатора", quizIndex+1)
		}
		if _, ok := quizIDs[quiz.ID]; ok {
			return nil, fmt.Errorf("идентификатор викторины %q повторяется", quiz.ID)
		}
		quizIDs[quiz.ID] = struct{}{}
		if strings.TrimSpace(quiz.Title) == "" {
			return nil, fmt.Errorf("у викторины %q нет названия", quiz.ID)
		}
		if len(quiz.Questions) == 0 {
			return nil, fmt.Errorf("викторина %q пуста", quiz.ID)
		}
		for questionIndex := range quiz.Questions {
			question := &quiz.Questions[questionIndex]
			question.ID = strings.TrimSpace(question.ID)
			question.Prompt = strings.TrimSpace(question.Prompt)
			if question.ID == "" {
				return nil, fmt.Errorf("вопрос №%d викторины %q без идентификатора", questionIndex+1, quiz.ID)
			}
			if other, ok := questionIDs[question.ID]; ok {
				return nil, fmt.Errorf("идентификатор вопроса %q повторяется (викторины %q и %q)", question.ID, other, quiz.ID)
			}
			questionIDs[question.ID] = quiz.ID
			if question.Prompt == "" || utf8.RuneCountInString(question.Prompt) > 600 {
				return nil, fmt.Errorf("вопрос %q: пустой или слишком длинный текст", question.ID)
			}
			if err := validateQuestion(question); err != nil {
				return nil, err
			}
		}
	}
	sort.SliceStable(file.Quizzes, func(i, j int) bool {
		if file.Quizzes[i].Module == file.Quizzes[j].Module {
			return file.Quizzes[i].ID < file.Quizzes[j].ID
		}
		return file.Quizzes[i].Module < file.Quizzes[j].Module
	})
	return file.Quizzes, nil
}

func validateQuestion(question *Question) error {
	switch question.Type {
	case TypeSingle, TypeCode:
		if len(question.Options) < 2 {
			return fmt.Errorf("вопрос %q: нужно минимум два варианта ответа", question.ID)
		}
		if len(question.Correct) != 1 {
			return fmt.Errorf("вопрос %q: ровно один правильный вариант", question.ID)
		}
		if !hasOption(question.Options, question.Correct[0]) {
			return fmt.Errorf("вопрос %q: правильный вариант %q отсутствует", question.ID, question.Correct[0])
		}
	case TypeMultiple:
		if len(question.Options) < 2 {
			return fmt.Errorf("вопрос %q: нужно минимум два варианта ответа", question.ID)
		}
		if len(question.Correct) == 0 || len(question.Correct) >= len(question.Options) {
			return fmt.Errorf("вопрос %q: правильных вариантов должно быть от 1 до %d", question.ID, len(question.Options)-1)
		}
		for _, correct := range question.Correct {
			if !hasOption(question.Options, correct) {
				return fmt.Errorf("вопрос %q: правильный вариант %q отсутствует", question.ID, correct)
			}
		}
	case TypeTrueFalse:
		if len(question.Correct) != 1 || (question.Correct[0] != "true" && question.Correct[0] != "false") {
			return fmt.Errorf("вопрос %q: правильный ответ true или false", question.ID)
		}
	case TypeInput:
		if len(question.Accepted) == 0 {
			return fmt.Errorf("вопрос %q: нужен список допустимых ответов", question.ID)
		}
		question.Correct = nil
	default:
		return fmt.Errorf("вопрос %q: неизвестный тип %q", question.ID, question.Type)
	}
	// Для вариантов ответа проверим уникальность идентификаторов.
	seen := make(map[string]struct{}, len(question.Options))
	for _, option := range question.Options {
		option.ID = strings.TrimSpace(option.ID)
		if option.ID == "" || strings.TrimSpace(option.Text) == "" {
			return fmt.Errorf("вопрос %q: вариант без идентификатора или текста", question.ID)
		}
		if _, ok := seen[option.ID]; ok {
			return fmt.Errorf("вопрос %q: вариант %q повторяется", question.ID, option.ID)
		}
		seen[option.ID] = struct{}{}
	}
	if question.Explanation == "" {
		return fmt.Errorf("вопрос %q: нет объяснения", question.ID)
	}
	return nil
}

func hasOption(options []Option, id string) bool {
	for _, option := range options {
		if option.ID == id {
			return true
		}
	}
	return false
}
