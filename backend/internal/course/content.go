package course

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// Ошибки загрузки урока.
var (
	// ErrLessonUnknown — урока нет в программе курса.
	ErrLessonUnknown = errors.New("урок не найден в программе")
	// ErrContentMissing — урок есть в программе, но Markdown-файл ещё не написан.
	ErrContentMissing = errors.New("материал урока ещё не готов")
	// ErrContentInvalid — файл урока повреждён: нет front matter или он невалиден.
	ErrContentInvalid = errors.New("файл урока заполнен неверно")
)

// maxLessonBytes ограничивает размер одного Markdown-файла.
const maxLessonBytes = 512 << 10

// FrontMatter — служебные поля в начале файла урока (JSON между строками ---).
type FrontMatter struct {
	Title      string   `json:"title"`
	Summary    string   `json:"summary"`
	Minutes    int      `json:"minutes"`
	Objectives []string `json:"objectives"`
}

// Content — разобранный урок.
type Content struct {
	LessonID   string   `json:"lesson_id"`
	Title      string   `json:"title"`
	Summary    string   `json:"summary"`
	Minutes    int      `json:"minutes"`
	Objectives []string `json:"objectives"`
	Markdown   string   `json:"markdown"`
	Words      int      `json:"words"`
	// StarterCode — первый ```go блок из раздела «Практика». Из него редактор
	// на странице урока берёт стартовый код задания.
	StarterCode string `json:"starter_code"`
}

// Content читает Markdown-файл урока.
//
// Формат файла: JSON front matter между двумя строками `---`, затем Markdown.
// Front matter обязателен, иначе легко получить урок без целей и названия.
func (s *Store) Content(lessonID string) (Content, error) {
	catalog, err := s.Load()
	if err != nil {
		return Content{}, err
	}
	module, lesson, ok := catalog.Lesson(lessonID)
	if !ok {
		return Content{}, ErrLessonUnknown
	}
	if !lesson.Available {
		return Content{}, ErrContentMissing
	}

	path := filepath.Join(s.dir, "lessons", module.ID, lesson.ID+".md")
	info, err := os.Stat(path)
	if err != nil {
		return Content{}, ErrContentMissing
	}
	if info.Size() > maxLessonBytes {
		return Content{}, fmt.Errorf("%w: файл больше %d КБ", ErrContentInvalid, maxLessonBytes/1024)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return Content{}, fmt.Errorf("%w: %v", ErrContentInvalid, err)
	}
	if !utf8.Valid(raw) {
		return Content{}, fmt.Errorf("%w: файл не в UTF-8", ErrContentInvalid)
	}

	front, body, err := splitFrontMatter(raw)
	if err != nil {
		return Content{}, err
	}
	if len(front.Objectives) == 0 {
		return Content{}, fmt.Errorf("%w: не указаны цели обучения", ErrContentInvalid)
	}
	if strings.TrimSpace(body) == "" {
		return Content{}, fmt.Errorf("%w: пустой текст урока", ErrContentInvalid)
	}

	title := front.Title
	if title == "" {
		title = lesson.Title
	}
	summary := front.Summary
	if summary == "" {
		summary = lesson.Summary
	}
	minutes := front.Minutes
	if minutes <= 0 {
		minutes = lesson.Minutes
	}

	return Content{
		LessonID:    lesson.ID,
		Title:       title,
		Summary:     summary,
		Minutes:     minutes,
		Objectives:  front.Objectives,
		Markdown:    body,
		Words:       len(strings.Fields(body)),
		StarterCode: ExtractStarterCode(body),
	}, nil
}

// ExtractStarterCode достаёт стартовый код из раздела «Практика».
//
// Приоритет: блок сразу после строки со словом «Стартовый код», затем первый
// ```go блок внутри раздела. Если раздела или блока нет, возвращается пустая
// строка — редактор подставит шаблон.
func ExtractStarterCode(markdown string) string {
	section := practiceSection(markdown)
	if section == "" {
		return ""
	}
	blocks := goCodeBlocks(section)
	if len(blocks) == 0 {
		return ""
	}
	lowered := strings.ToLower(section)
	if index := strings.Index(lowered, "стартовый код"); index >= 0 {
		// Ищем первый блок, который начинается после упоминания стартового кода.
		rest := section[index:]
		if after := goCodeBlocks(rest); len(after) > 0 {
			return after[0]
		}
	}
	return blocks[0]
}

// practiceSection возвращает текст раздела «Практика» до следующего раздела.
func practiceSection(markdown string) string {
	lines := strings.Split(markdown, "\n")
	start := -1
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if start < 0 {
			if strings.HasPrefix(trimmed, "## ") && strings.Contains(strings.ToLower(trimmed), "практика") {
				start = index + 1
			}
			continue
		}
		if strings.HasPrefix(trimmed, "## ") {
			return strings.Join(lines[start:index], "\n")
		}
	}
	if start >= 0 {
		return strings.Join(lines[start:], "\n")
	}
	return ""
}

// goCodeBlocks собирает содержимое ```go блоков, игнорируя другие языки.
func goCodeBlocks(markdown string) []string {
	var blocks []string
	var current []string
	inFence := false
	isGo := false

	for _, line := range strings.Split(markdown, "\n") {
		trimmed := strings.TrimSpace(line)
		if !inFence {
			if strings.HasPrefix(trimmed, "```") {
				language := strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
				inFence = true
				isGo = language == "" || language == "go" || language == "golang"
				current = nil
			}
			continue
		}
		if strings.HasPrefix(trimmed, "```") {
			if isGo && len(current) > 0 {
				blocks = append(blocks, strings.Join(current, "\n")+"\n")
			}
			inFence = false
			isGo = false
			current = nil
			continue
		}
		if isGo {
			current = append(current, line)
		}
	}
	return blocks
}

// splitFrontMatter отделяет JSON-заголовок от текста урока.
func splitFrontMatter(raw []byte) (FrontMatter, string, error) {
	normalized := strings.ReplaceAll(string(raw), "\r\n", "\n")
	if !strings.HasPrefix(normalized, "---\n") {
		return FrontMatter{}, "", fmt.Errorf("%w: файл должен начинаться с front matter", ErrContentInvalid)
	}
	rest := normalized[len("---\n"):]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return FrontMatter{}, "", fmt.Errorf("%w: не закрыт front matter", ErrContentInvalid)
	}
	header := strings.TrimSpace(rest[:end])
	body := rest[end+len("\n---"):]
	body = strings.TrimPrefix(body, "\n")

	var front FrontMatter
	decoder := json.NewDecoder(bytes.NewReader([]byte(header)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&front); err != nil {
		return FrontMatter{}, "", fmt.Errorf("%w: %v", ErrContentInvalid, err)
	}
	if strings.TrimSpace(front.Title) == "" {
		return FrontMatter{}, "", fmt.Errorf("%w: не указан заголовок", ErrContentInvalid)
	}
	return front, strings.TrimSpace(body) + "\n", nil
}
