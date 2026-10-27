// Package cards загружает колоды карточек из content/flashcards/decks.json.
//
// Контент — единственный источник текста карточек: база хранит только прогресс
// повторений, поэтому исправление формулировки в JSON сразу видно в интерфейсе.
package cards

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

// Card — одна карточка колоды.
type Card struct {
	ID    string `json:"id"`
	Front string `json:"front"`
	Back  string `json:"back"`
	Hint  string `json:"hint,omitempty"`
}

// Deck — набор карточек по теме.
type Deck struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Level       string `json:"level"`
	Module      int    `json:"module"`
	Icon        string `json:"icon"`
	Cards       []Card `json:"cards"`
}

// Store читает и кеширует колоды. Файл перечитывается по требованию, чтобы
// кнопка «Перечитать контент» обновляла и карточки.
type Store struct {
	dir   string
	mu    sync.RWMutex
	decks []Deck
	err   error
}

// NewStore создаёт хранилище колод для каталога content/.
func NewStore(contentDir string) *Store {
	return &Store{dir: contentDir}
}

// Reload перечитывает decks.json. Первая ошибка сохраняется и возвращается до
// успешной загрузки: интерфейс должен показать понятное сообщение.
func (s *Store) Reload() error {
	decks, err := load(filepath.Join(s.dir, "flashcards", "decks.json"))
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.err = err
		return err
	}
	s.decks = decks
	s.err = nil
	return nil
}

// Decks возвращает копию загруженных колод.
func (s *Store) Decks() []Deck {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Deck, len(s.decks))
	copy(out, s.decks)
	return out
}

// Deck находит колоду по идентификатору.
func (s *Store) Deck(id string) (Deck, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, deck := range s.decks {
		if deck.ID == id {
			return deck, true
		}
	}
	return Deck{}, false
}

// Err возвращает последнюю ошибку загрузки (nil, если всё в порядке).
func (s *Store) Err() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.err
}

// Total считает все карточки во всех колодах.
func (s *Store) Total() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	total := 0
	for _, deck := range s.decks {
		total += len(deck.Cards)
	}
	return total
}

func load(path string) ([]Deck, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("прочитать колоды: %w", err)
	}
	var file struct {
		Decks []Deck `json:"decks"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("разобрать колоды: %w", err)
	}
	if len(file.Decks) == 0 {
		return nil, fmt.Errorf("в %s нет ни одной колоды", filepath.Base(path))
	}

	deckIDs := make(map[string]struct{}, len(file.Decks))
	cardIDs := make(map[string]string, 256)
	for index := range file.Decks {
		deck := &file.Decks[index]
		deck.ID = strings.TrimSpace(deck.ID)
		if deck.ID == "" {
			return nil, fmt.Errorf("колода №%d без идентификатора", index+1)
		}
		if _, ok := deckIDs[deck.ID]; ok {
			return nil, fmt.Errorf("идентификатор колоды %q повторяется", deck.ID)
		}
		deckIDs[deck.ID] = struct{}{}
		if strings.TrimSpace(deck.Title) == "" {
			return nil, fmt.Errorf("у колоды %q нет названия", deck.ID)
		}
		if len(deck.Cards) == 0 {
			return nil, fmt.Errorf("колода %q пуста", deck.ID)
		}
		for cardIndex := range deck.Cards {
			card := &deck.Cards[cardIndex]
			card.ID = strings.TrimSpace(card.ID)
			card.Front = strings.TrimSpace(card.Front)
			card.Back = strings.TrimSpace(card.Back)
			if card.ID == "" {
				return nil, fmt.Errorf("карточка №%d в колоде %q без идентификатора", cardIndex+1, deck.ID)
			}
			if other, ok := cardIDs[card.ID]; ok {
				return nil, fmt.Errorf("идентификатор карточки %q повторяется (колоды %q и %q)", card.ID, other, deck.ID)
			}
			cardIDs[card.ID] = deck.ID
			if card.Front == "" || card.Back == "" {
				return nil, fmt.Errorf("карточка %q: нужны и вопрос, и ответ", card.ID)
			}
			if utf8.RuneCountInString(card.Front) > 400 || utf8.RuneCountInString(card.Back) > 2000 {
				return nil, fmt.Errorf("карточка %q: слишком длинный текст", card.ID)
			}
		}
	}
	sort.SliceStable(file.Decks, func(i, j int) bool {
		return file.Decks[i].Module < file.Decks[j].Module
	})
	return file.Decks, nil
}
