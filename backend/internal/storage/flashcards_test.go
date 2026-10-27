package storage

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"goacademy/internal/cards"
)

// writeDecks создаёт временный content-каталог с колодами.
func writeDecks(t *testing.T, decks cards.Deck) *cards.Store {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "flashcards"), 0o755); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(map[string]any{"decks": []cards.Deck{decks}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "flashcards", "decks.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	store := cards.NewStore(dir)
	if err := store.Reload(); err != nil {
		t.Fatalf("загрузить колоды: %v", err)
	}
	return store
}

func sampleDeck() cards.Deck {
	return cards.Deck{
		ID:          "basics",
		Title:       "Основы",
		Description: "Простые вопросы",
		Level:       "beginner",
		Module:      1,
		Icon:        "sparkles",
		Cards: []cards.Card{
			{ID: "basics-01", Front: "Что такое Go?", Back: "Язык программирования.", Hint: "Компилируемый."},
			{ID: "basics-02", Front: "Что такое горутина?", Back: "Легкий поток.", Hint: "go f()"},
			{ID: "basics-03", Front: "Что такое слайс?", Back: "Указатель, длина, ёмкость.", Hint: "len и cap"},
		},
	}
}

func TestFlashcardsSyncAndOverview(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	store := writeDecks(t, sampleDeck())
	fc := NewFlashcards(db, store)

	synced, err := fc.Sync(ctx)
	if err != nil {
		t.Fatalf("синхронизация: %v", err)
	}
	if synced != 3 {
		t.Fatalf("синхронизировано %d карточек, ожидалось 3", synced)
	}
	// Повторная синхронизация не должна дублировать карточки.
	if _, err := fc.Sync(ctx); err != nil {
		t.Fatalf("повторная синхронизация: %v", err)
	}

	decks, stats, err := fc.Overview(ctx)
	if err != nil {
		t.Fatalf("обзор: %v", err)
	}
	if len(decks) != 1 {
		t.Fatalf("колод = %d", len(decks))
	}
	deck := decks[0]
	if deck.Total != 3 || deck.Due != 3 || deck.New != 3 || deck.Learned != 0 {
		t.Errorf("колода = %+v", deck)
	}
	if deck.Title != "Основы" || deck.Progress != 0 {
		t.Errorf("метаданные колоды = %+v", deck)
	}
	if stats.Total != 3 || stats.Due != 3 || stats.New != 3 || stats.Reviews != 0 {
		t.Errorf("статистика = %+v", stats)
	}
	if len(stats.Days) != 14 {
		t.Errorf("дней в истории = %d, ожидалось 14", len(stats.Days))
	}
}

func TestFlashcardSchedule(t *testing.T) {
	cases := []struct {
		name       string
		card       Flashcard
		grade      string
		interval   int
		repetition int
		ease       float64
		lapses     int
	}{
		{
			name: "первое «хорошо»", card: Flashcard{Ease: 2.5}, grade: GradeGood,
			interval: 1, repetition: 1, ease: 2.5,
		},
		{
			name: "второе «хорошо»", card: Flashcard{Ease: 2.5, Interval: 1, Repetitions: 1}, grade: GradeGood,
			interval: 3, repetition: 2, ease: 2.5,
		},
		{
			name: "третье «хорошо»", card: Flashcard{Ease: 2.5, Interval: 3, Repetitions: 2}, grade: GradeGood,
			interval: 8, repetition: 3, ease: 2.5,
		},
		{
			name: "«снова» сбрасывает интервал", card: Flashcard{Ease: 2.5, Interval: 10, Repetitions: 4, Lapses: 1}, grade: GradeAgain,
			interval: 0, repetition: 0, ease: 2.3, lapses: 2,
		},
		{
			name: "«трудно» растёт медленно", card: Flashcard{Ease: 2.5, Interval: 10, Repetitions: 3}, grade: GradeHard,
			interval: 12, repetition: 4, ease: 2.35,
		},
		{
			name: "«легко» даёт четыре дня с нуля", card: Flashcard{Ease: 2.5}, grade: GradeEasy,
			interval: 4, repetition: 1, ease: 2.65,
		},
		{
			name: "сложность не падает ниже 1.3", card: Flashcard{Ease: 1.35, Interval: 5, Repetitions: 2}, grade: GradeAgain,
			interval: 0, repetition: 0, ease: 1.3, lapses: 1,
		},
		{
			name: "сложность не растёт выше 3.0", card: Flashcard{Ease: 2.95, Interval: 20, Repetitions: 5}, grade: GradeEasy,
			interval: 78, repetition: 6, ease: 3.0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			interval, ease, repetitions, lapses, _, err := schedule(tc.card, tc.grade, time.Now())
			if err != nil {
				t.Fatalf("ошибка: %v", err)
			}
			if interval != tc.interval || repetitions != tc.repetition || lapses != tc.lapses {
				t.Errorf("интервал/повторения/срывы = %d/%d/%d, ожидалось %d/%d/%d",
					interval, repetitions, lapses, tc.interval, tc.repetition, tc.lapses)
			}
			if diff := ease - tc.ease; diff > 0.001 || diff < -0.001 {
				t.Errorf("сложность = %.2f, ожидалось %.2f", ease, tc.ease)
			}
		})
	}

	if _, _, _, _, _, err := schedule(Flashcard{Ease: 2.5}, "excellent", time.Now()); !errors.Is(err, ErrCardInvalid) {
		t.Errorf("неизвестная оценка должна давать ErrCardInvalid, получено %v", err)
	}
}

func TestFlashcardReviewFlow(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	fc := NewFlashcards(db, writeDecks(t, sampleDeck()))
	if _, err := fc.Sync(ctx); err != nil {
		t.Fatal(err)
	}

	cards, remaining, err := fc.Queue(ctx, "", 10)
	if err != nil {
		t.Fatalf("очередь: %v", err)
	}
	if len(cards) != 3 || remaining != 3 {
		t.Fatalf("очередь = %d (осталось %d), ожидалось 3", len(cards), remaining)
	}
	if !cards[0].New || cards[0].Front == "" || cards[0].Hint == "" {
		t.Errorf("карточка = %+v", cards[0])
	}

	// «Хорошо» уводит карточку из очереди на сутки.
	updated, err := fc.Review(ctx, cards[0].ID, GradeGood)
	if err != nil {
		t.Fatalf("повторение: %v", err)
	}
	if updated.Interval != 1 || updated.Repetitions != 1 || updated.New {
		t.Errorf("после повтора = %+v", updated)
	}
	if _, _, err := fc.Queue(ctx, "", 10); err != nil {
		t.Fatal(err)
	}
	queue, remaining, err := fc.Queue(ctx, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(queue) != 2 || remaining != 2 {
		t.Errorf("очередь после повтора = %d (осталось %d), ожидалось 2", len(queue), remaining)
	}

	// «Снова» возвращает карточку через 10 минут: сейчас она не в очереди.
	again, err := fc.Review(ctx, queue[0].ID, GradeAgain)
	if err != nil {
		t.Fatal(err)
	}
	if again.Interval != 0 || !again.Learning {
		t.Errorf("после «снова» = %+v", again)
	}
	if queue, _, _ := fc.Queue(ctx, "", 10); len(queue) != 1 {
		t.Errorf("в очереди осталась %d карточек, ожидалась 1", len(queue))
	}

	reviews, err := fc.CardReviews(ctx, updated.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(reviews) != 1 || reviews[0] != GradeGood {
		t.Errorf("история повторений = %v", reviews)
	}

	stats, err := fc.Stats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Reviews != 2 || stats.ReviewsToday != 2 || stats.Accuracy != 50 {
		t.Errorf("статистика = %+v", stats)
	}
	if stats.Streak != 1 {
		t.Errorf("серия = %d, ожидалась 1", stats.Streak)
	}
}

func TestFlashcardCustomCardsAndReset(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	store := writeDecks(t, sampleDeck())
	fc := NewFlashcards(db, store)
	if _, err := fc.Sync(ctx); err != nil {
		t.Fatal(err)
	}

	custom, err := fc.CreateCard(ctx, "basics", "  Что такое defer?  ", "Отложенный вызов.", "")
	if err != nil {
		t.Fatalf("создать карточку: %v", err)
	}
	if !custom.Custom || custom.Front != "Что такое defer?" || !custom.New {
		t.Errorf("своя карточка = %+v", custom)
	}
	if custom.DeckID != "basics" {
		t.Errorf("колода = %q", custom.DeckID)
	}

	if _, err := fc.CreateCard(ctx, "nope", "a", "b", ""); !errors.Is(err, ErrDeckNotFound) {
		t.Errorf("неизвестная колода: %v", err)
	}
	if _, err := fc.CreateCard(ctx, "basics", "  ", "b", ""); !errors.Is(err, ErrCardInvalid) {
		t.Errorf("пустой вопрос: %v", err)
	}
	if _, err := fc.CreateCard(ctx, "basics", strings.Repeat("я", MaxFrontRunes+1), "b", ""); !errors.Is(err, ErrCardInvalid) {
		t.Errorf("длинный вопрос: %v", err)
	}

	if err := fc.DeleteCard(ctx, "basics-01"); !errors.Is(err, ErrCardLocked) {
		t.Errorf("карточку из контента удалить нельзя, получено %v", err)
	}
	if err := fc.DeleteCard(ctx, custom.ID); err != nil {
		t.Fatalf("удалить свою карточку: %v", err)
	}
	if _, err := fc.Get(ctx, custom.ID); !errors.Is(err, ErrCardNotFound) {
		t.Errorf("после удаления: %v", err)
	}

	// Прогресс: два повторения, затем сброс колоды.
	cards, _, err := fc.Queue(ctx, "basics", 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, card := range cards {
		if _, err := fc.Review(ctx, card.ID, GradeEasy); err != nil {
			t.Fatal(err)
		}
	}
	stats, err := fc.Stats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Learned != 3 || stats.Due != 0 {
		t.Errorf("после повторов: %+v", stats)
	}

	reset, err := fc.ResetDeck(ctx, "basics")
	if err != nil {
		t.Fatalf("сброс колоды: %v", err)
	}
	if reset != 3 {
		t.Errorf("сброшено %d карточек, ожидалось 3", reset)
	}
	stats, err = fc.Stats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Reviews != 0 || stats.Learned != 0 || stats.Due != 3 || stats.New != 3 {
		t.Errorf("после сброса: %+v", stats)
	}
	if _, err := fc.ResetDeck(ctx, "nope"); !errors.Is(err, ErrDeckNotFound) {
		t.Errorf("сброс неизвестной колоды: %v", err)
	}
}
