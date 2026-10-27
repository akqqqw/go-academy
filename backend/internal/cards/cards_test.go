package cards

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const contentDir = "../../../content"

func TestRepositoryDecksLoad(t *testing.T) {
	store := NewStore(contentDir)
	if err := store.Reload(); err != nil {
		t.Fatalf("загрузить колоды: %v", err)
	}
	decks := store.Decks()
	if len(decks) != 12 {
		t.Errorf("колод = %d, ожидалось 12", len(decks))
	}
	if total := store.Total(); total != 100 {
		t.Errorf("карточек = %d, ожидалось 100", total)
	}
	for _, deck := range decks {
		if deck.Title == "" || deck.Description == "" || deck.Icon == "" {
			t.Errorf("колода %q: пустые метаданные", deck.ID)
		}
		if deck.Module < 1 || deck.Module > 14 {
			t.Errorf("колода %q: модуль %d вне курса", deck.ID, deck.Module)
		}
		for _, card := range deck.Cards {
			if !strings.HasPrefix(card.ID, deck.ID+"-") {
				t.Errorf("карточка %q не относится к колоде %q", card.ID, deck.ID)
			}
			if card.Hint == "" {
				t.Errorf("карточка %q без подсказки", card.ID)
			}
		}
	}
	if _, ok := store.Deck("concurrency"); !ok {
		t.Error("нет колоды concurrency")
	}
}

func TestLoadRejectsBrokenDecks(t *testing.T) {
	cases := map[string]string{
		"пустой файл":     `{"decks":[]}`,
		"без id":          `{"decks":[{"id":"","title":"X","cards":[{"id":"a","front":"f","back":"b"}]}]}`,
		"дубли колод":     `{"decks":[{"id":"a","title":"A","cards":[{"id":"a-1","front":"f","back":"b"}]},{"id":"a","title":"B","cards":[{"id":"b-1","front":"f","back":"b"}]}]}`,
		"дубли карточек":  `{"decks":[{"id":"a","title":"A","cards":[{"id":"x","front":"f","back":"b"}]},{"id":"b","title":"B","cards":[{"id":"x","front":"f","back":"b"}]}]}`,
		"пустой вопрос":   `{"decks":[{"id":"a","title":"A","cards":[{"id":"a-1","front":" ","back":"b"}]}]}`,
		"колода без карт": `{"decks":[{"id":"a","title":"A","cards":[]}]}`,
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.MkdirAll(filepath.Join(dir, "flashcards"), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "flashcards", "decks.json"), []byte(payload), 0o644); err != nil {
				t.Fatal(err)
			}
			store := NewStore(dir)
			if err := store.Reload(); err == nil {
				t.Fatal("ожидалась ошибка загрузки")
			}
			if store.Err() == nil {
				t.Fatal("ошибка должна сохраниться в store")
			}
		})
	}
}
