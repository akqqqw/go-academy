package course

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Extras — количество практических материалов в content/.
//
// Файлы заданий, карточек и тестов появляются в следующих этапах разработки;
// до тех пор счётчики честно возвращают нули, а не выдуманные числа.
type Extras struct {
	Exercises  int `json:"exercises"`
	Flashcards int `json:"flashcards"`
	Quizzes    int `json:"quizzes"`
	Questions  int `json:"questions"`
	Decks      int `json:"decks"`
}

type exerciseFile struct {
	Exercises []json.RawMessage `json:"exercises"`
}

type deckFile struct {
	Decks []struct {
		ID    string            `json:"id"`
		Cards []json.RawMessage `json:"cards"`
	} `json:"decks"`
}

type quizFile struct {
	Quizzes []struct {
		Questions []json.RawMessage `json:"questions"`
	} `json:"quizzes"`
}

var extrasMu sync.Mutex

// Extras читает и подсчитывает материалы практики. Ошибки чтения не фатальны:
// отсутствующий файл означает, что раздел ещё не наполнен.
func (s *Store) Extras() Extras {
	extrasMu.Lock()
	defer extrasMu.Unlock()

	var extras Extras

	if raw, err := os.ReadFile(filepath.Join(s.dir, "exercises", "exercises.json")); err == nil {
		var file exerciseFile
		if json.Unmarshal(raw, &file) == nil {
			extras.Exercises = len(file.Exercises)
		}
	}
	if raw, err := os.ReadFile(filepath.Join(s.dir, "flashcards", "decks.json")); err == nil {
		var file deckFile
		if json.Unmarshal(raw, &file) == nil {
			extras.Decks = len(file.Decks)
			for _, deck := range file.Decks {
				extras.Flashcards += len(deck.Cards)
			}
		}
	}
	if raw, err := os.ReadFile(filepath.Join(s.dir, "quizzes", "quizzes.json")); err == nil {
		var file quizFile
		if json.Unmarshal(raw, &file) == nil {
			extras.Quizzes = len(file.Quizzes)
			for _, quiz := range file.Quizzes {
				extras.Questions += len(quiz.Questions)
			}
		}
	}
	return extras
}
