package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"goacademy/internal/cards"
	"goacademy/internal/database"
)

// Ошибки карточек.
var (
	// ErrCardNotFound — карточки с таким идентификатором нет.
	ErrCardNotFound = errors.New("карточка не найдена")
	// ErrCardInvalid — карточка не прошла валидацию.
	ErrCardInvalid = errors.New("карточка заполнена неверно")
	// ErrDeckNotFound — колоды с таким идентификатором нет в контенте.
	ErrDeckNotFound = errors.New("колода не найдена")
	// ErrCardLocked — карточку из контента нельзя удалить.
	ErrCardLocked = errors.New("карточка из контента защищена от удаления")
)

// Оценки повторения.
const (
	GradeAgain = "again"
	GradeHard  = "hard"
	GradeGood  = "good"
	GradeEasy  = "easy"
)

// Ограничения и настройки повторений.
const (
	DefaultEase      = 2.5
	MinEase          = 1.3
	MaxEase          = 3.0
	DefaultQueue     = 20
	MaxQueue         = 100
	MaxFrontRunes    = 400
	MaxBackRunes     = 2000
	MaxCustomPerDeck = 200
	// againDelay — через сколько минут карточка снова попадёт в очередь.
	againDelay = 10 * time.Minute
)

// Flashcard — карточка вместе с прогрессом повторений.
type Flashcard struct {
	ID          string  `json:"id"`
	DeckID      string  `json:"deck_id"`
	Front       string  `json:"front"`
	Back        string  `json:"back"`
	Hint        string  `json:"hint,omitempty"`
	Ease        float64 `json:"ease"`
	Interval    int     `json:"interval_days"`
	Repetitions int     `json:"repetitions"`
	Lapses      int     `json:"lapses"`
	DueAt       string  `json:"due_at"`
	Custom      bool    `json:"custom"`
	Reviews     int     `json:"reviews"`
	LastReview  string  `json:"last_review,omitempty"`
	// New и Learning — подсказки для интерфейса: карточка ещё ни разу не
	// повторялась или повторялась неудачно.
	New      bool `json:"new"`
	Learning bool `json:"learning"`
}

// DeckView — колода с прогрессом.
type DeckView struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Level       string  `json:"level"`
	Icon        string  `json:"icon"`
	Module      int     `json:"module"`
	Total       int     `json:"total"`
	Due         int     `json:"due"`
	New         int     `json:"new"`
	Learned     int     `json:"learned"`
	Custom      int     `json:"custom"`
	Progress    float64 `json:"progress"`
}

// DayCount — число повторений за день.
type DayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// CardStats — сводка по карточкам.
type CardStats struct {
	Total        int        `json:"total"`
	Due          int        `json:"due"`
	New          int        `json:"new"`
	Learned      int        `json:"learned"`
	Reviews      int        `json:"reviews"`
	ReviewsToday int        `json:"reviews_today"`
	Accuracy     float64    `json:"accuracy"`
	Streak       int        `json:"streak"`
	Days         []DayCount `json:"days"`
}

// Flashcards — сервис карточек: синхронизация контента и планировщик SM-2.
type Flashcards struct {
	db    *database.DB
	store *cards.Store
}

// NewFlashcards создаёт сервис карточек.
func NewFlashcards(db *database.DB, store *cards.Store) *Flashcards {
	return &Flashcards{db: db, store: store}
}

// Sync переносит карточки из контента в базу: прогресс существующих карточек
// сохраняется, новые добавляются, исчезнувшие из контента удаляются.
func (f *Flashcards) Sync(ctx context.Context) (int, error) {
	decks := f.store.Decks()
	if len(decks) == 0 {
		return 0, nil
	}
	now := database.Now()

	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	known := make(map[string]struct{}, 128)
	count := 0
	for _, deck := range decks {
		for _, card := range deck.Cards {
			known[card.ID] = struct{}{}
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO flashcards (id, deck_id, front, back, hint, ease, interval_days,
					repetitions, lapses, due_at, custom, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					deck_id = excluded.deck_id,
					front = excluded.front,
					back = excluded.back,
					hint = excluded.hint,
					updated_at = excluded.updated_at`,
				card.ID, deck.ID, card.Front, card.Back, card.Hint, DefaultEase, now, now, now); err != nil {
				return 0, fmt.Errorf("сохранить карточку %q: %w", card.ID, err)
			}
			count++
		}
	}

	// Удаляем карточки, которых больше нет в контенте.
	rows, err := tx.QueryContext(ctx, "SELECT id FROM flashcards WHERE custom = 0")
	if err != nil {
		return 0, err
	}
	var stale []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		if _, ok := known[id]; !ok {
			stale = append(stale, id)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, id := range stale {
		if _, err := tx.ExecContext(ctx, "DELETE FROM card_reviews WHERE card_id = ?", id); err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM flashcards WHERE id = ?", id); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}

const cardColumns = `c.id, c.deck_id, c.front, c.back, c.hint, c.ease, c.interval_days,
	c.repetitions, c.lapses, COALESCE(c.due_at, ''), c.custom,
	COUNT(r.id), COALESCE(MAX(r.reviewed_at), '')`

// Overview собирает список колод с прогрессом и общую сводку.
func (f *Flashcards) Overview(ctx context.Context) ([]DeckView, CardStats, error) {
	decks := f.store.Decks()
	if len(decks) == 0 {
		return []DeckView{}, CardStats{Days: []DayCount{}}, nil
	}
	now := database.Now()

	rows, err := f.db.QueryContext(ctx, `
		SELECT c.deck_id,
			COUNT(*),
			COALESCE(SUM(CASE WHEN c.due_at IS NULL OR c.due_at <= ? THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN c.custom = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN c.interval_days > 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN r.cnt IS NULL THEN 1 ELSE 0 END), 0)
		FROM flashcards c
		LEFT JOIN (SELECT card_id, COUNT(*) AS cnt FROM card_reviews GROUP BY card_id) r
			ON r.card_id = c.id
		GROUP BY c.deck_id`, now)
	if err != nil {
		return nil, CardStats{}, fmt.Errorf("считать прогресс колод: %w", err)
	}
	defer rows.Close()

	type deckCounts struct{ total, due, custom, learned, fresh int }
	counts := make(map[string]deckCounts, len(decks))
	for rows.Next() {
		var deckID string
		var value deckCounts
		if err := rows.Scan(&deckID, &value.total, &value.due, &value.custom, &value.learned, &value.fresh); err != nil {
			return nil, CardStats{}, err
		}
		counts[deckID] = value
	}
	if err := rows.Err(); err != nil {
		return nil, CardStats{}, err
	}

	views := make([]DeckView, 0, len(decks))
	for _, deck := range decks {
		value := counts[deck.ID]
		progress := 0.0
		if value.total > 0 {
			progress = math.Round(float64(value.learned) / float64(value.total) * 100)
		}
		views = append(views, DeckView{
			ID:          deck.ID,
			Title:       deck.Title,
			Description: deck.Description,
			Level:       deck.Level,
			Icon:        deck.Icon,
			Module:      deck.Module,
			Total:       value.total,
			Due:         value.due,
			New:         value.fresh,
			Learned:     value.learned,
			Custom:      value.custom,
			Progress:    progress,
		})
	}

	stats, err := f.Stats(ctx)
	if err != nil {
		return nil, CardStats{}, err
	}
	return views, stats, nil
}

// Stats считает сводку по всем карточкам.
func (f *Flashcards) Stats(ctx context.Context) (CardStats, error) {
	today := time.Now().Format("2006-01-02") + "T00:00:00"
	stats := CardStats{}

	var successful int
	err := f.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM flashcards),
			(SELECT COUNT(*) FROM flashcards WHERE due_at IS NULL OR due_at <= ?),
			(SELECT COUNT(*) FROM flashcards WHERE interval_days > 0),
			(SELECT COUNT(*) FROM card_reviews),
			(SELECT COUNT(*) FROM card_reviews WHERE reviewed_at >= ?),
			(SELECT COUNT(*) FROM card_reviews WHERE grade IN ('good', 'easy')),
			(SELECT COUNT(*) FROM flashcards c WHERE NOT EXISTS
				(SELECT 1 FROM card_reviews r WHERE r.card_id = c.id))`,
		database.Now(), today).Scan(
		&stats.Total, &stats.Due, &stats.Learned, &stats.Reviews, &stats.ReviewsToday,
		&successful, &stats.New)
	if err != nil {
		return CardStats{}, fmt.Errorf("считать статистику карточек: %w", err)
	}
	if stats.Reviews > 0 {
		stats.Accuracy = math.Round(float64(successful) / float64(stats.Reviews) * 100)
	}

	days, err := f.reviewDays(ctx, 14)
	if err != nil {
		return CardStats{}, err
	}
	stats.Days = days
	stats.Streak, err = f.streak(ctx)
	if err != nil {
		return CardStats{}, err
	}
	return stats, nil
}

// reviewDays возвращает количество повторений по дням, включая пустые дни.
func (f *Flashcards) reviewDays(ctx context.Context, days int) ([]DayCount, error) {
	if days <= 0 {
		return []DayCount{}, nil
	}
	today := time.Now()
	out := make([]DayCount, 0, days)
	byDate := make(map[string]int, days)

	from := today.AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	rows, err := f.db.QueryContext(ctx,
		`SELECT substr(reviewed_at, 1, 10) AS day, COUNT(*) FROM card_reviews
		 WHERE substr(reviewed_at, 1, 10) >= ?
		 GROUP BY day`, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var day string
		var count int
		if err := rows.Scan(&day, &count); err != nil {
			return nil, err
		}
		byDate[day] = count
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for offset := days - 1; offset >= 0; offset-- {
		date := today.AddDate(0, 0, -offset).Format("2006-01-02")
		out = append(out, DayCount{Date: date, Count: byDate[date]})
	}
	return out, nil
}

// streak считает серию дней подряд с повторениями.
func (f *Flashcards) streak(ctx context.Context) (int, error) {
	rows, err := f.db.QueryContext(ctx,
		"SELECT DISTINCT substr(reviewed_at, 1, 10) FROM card_reviews ORDER BY 1 DESC LIMIT 400")
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	dates := make([]string, 0, 32)
	for rows.Next() {
		var day string
		if err := rows.Scan(&day); err != nil {
			return 0, err
		}
		dates = append(dates, day)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(dates) == 0 {
		return 0, nil
	}
	today := time.Now()
	expected := today.Format("2006-01-02")
	if dates[0] != expected {
		// Серия может начаться вчера: сегодня ещё не занимались.
		expected = today.AddDate(0, 0, -1).Format("2006-01-02")
		if dates[0] != expected {
			return 0, nil
		}
	}
	streak := 0
	for _, day := range dates {
		if day != expected {
			break
		}
		streak++
		parsed, err := time.ParseInLocation("2006-01-02", expected, time.Local)
		if err != nil {
			return streak, nil
		}
		expected = parsed.AddDate(0, 0, -1).Format("2006-01-02")
	}
	return streak, nil
}

// Queue возвращает карточки, готовые к повторению: новые и просроченные.
func (f *Flashcards) Queue(ctx context.Context, deckID string, limit int) ([]Flashcard, int, error) {
	if limit <= 0 {
		limit = DefaultQueue
	}
	if limit > MaxQueue {
		limit = MaxQueue
	}
	if deckID != "" {
		if _, ok := f.store.Deck(deckID); !ok {
			return nil, 0, ErrDeckNotFound
		}
	}

	now := database.Now()
	where := "WHERE (c.due_at IS NULL OR c.due_at <= ?)"
	args := []any{now}
	if deckID != "" {
		where += " AND c.deck_id = ?"
		args = append(args, deckID)
	}

	var remaining int
	if err := f.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM flashcards c "+where, args...).Scan(&remaining); err != nil {
		return nil, 0, fmt.Errorf("считать очередь: %w", err)
	}

	query := `SELECT ` + cardColumns + `
		FROM flashcards c
		LEFT JOIN card_reviews r ON r.card_id = c.id
		` + where + `
		GROUP BY c.id
		ORDER BY c.due_at IS NULL, c.due_at, c.id
		LIMIT ?`
	rows, err := f.db.QueryContext(ctx, query, append(args, limit)...)
	if err != nil {
		return nil, 0, fmt.Errorf("прочитать очередь: %w", err)
	}
	defer rows.Close()

	out := make([]Flashcard, 0, limit)
	for rows.Next() {
		card, err := scanCard(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, card)
	}
	return out, remaining, rows.Err()
}

// Get возвращает карточку по идентификатору.
func (f *Flashcards) Get(ctx context.Context, id string) (Flashcard, error) {
	rows, err := f.db.QueryContext(ctx, `SELECT `+cardColumns+`
		FROM flashcards c LEFT JOIN card_reviews r ON r.card_id = c.id
		WHERE c.id = ? GROUP BY c.id`, id)
	if err != nil {
		return Flashcard{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return Flashcard{}, err
		}
		return Flashcard{}, ErrCardNotFound
	}
	return scanCard(rows)
}

// Review применяет оценку SM-2 и сохраняет повторение.
func (f *Flashcards) Review(ctx context.Context, id, grade string) (Flashcard, error) {
	grade = strings.ToLower(strings.TrimSpace(grade))
	card, err := f.Get(ctx, id)
	if err != nil {
		return Flashcard{}, err
	}
	now := time.Now()
	interval, ease, repetitions, lapses, due, err := schedule(card, grade, now)
	if err != nil {
		return Flashcard{}, err
	}

	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return Flashcard{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		UPDATE flashcards SET ease = ?, interval_days = ?, repetitions = ?, lapses = ?,
			due_at = ?, updated_at = ? WHERE id = ?`,
		ease, interval, repetitions, lapses, due.Format(time.RFC3339), database.Now(), id); err != nil {
		return Flashcard{}, fmt.Errorf("сохранить повторение: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO card_reviews (card_id, grade, reviewed_at) VALUES (?, ?, ?)",
		id, grade, database.Now()); err != nil {
		return Flashcard{}, fmt.Errorf("записать повторение: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Flashcard{}, err
	}
	return f.Get(ctx, id)
}

// schedule рассчитывает следующее повторение по правилам SM-2 с четырьмя
// оценками. Возвращает интервал в днях (0 — карточка вернётся на этой сессии).
func schedule(card Flashcard, grade string, now time.Time) (interval int, ease float64, repetitions, lapses int, due time.Time, err error) {
	ease = card.Ease
	if ease <= 0 {
		ease = DefaultEase
	}
	repetitions = card.Repetitions
	lapses = card.Lapses
	interval = card.Interval

	switch grade {
	case GradeAgain:
		ease = math.Max(MinEase, ease-0.2)
		repetitions = 0
		interval = 0
		lapses++
		due = now.Add(againDelay)
	case GradeHard:
		ease = math.Max(MinEase, ease-0.15)
		if repetitions == 0 {
			interval = 1
		} else {
			interval = maxInt(1, int(math.Round(float64(interval)*1.2)))
		}
		repetitions++
		due = now.AddDate(0, 0, interval)
	case GradeGood:
		switch repetitions {
		case 0:
			interval = 1
		case 1:
			interval = 3
		default:
			interval = maxInt(1, int(math.Round(float64(interval)*ease)))
		}
		repetitions++
		due = now.AddDate(0, 0, interval)
	case GradeEasy:
		ease = math.Min(MaxEase, ease+0.15)
		if repetitions == 0 {
			interval = 4
		} else {
			interval = maxInt(4, int(math.Round(float64(interval)*ease*1.3)))
		}
		repetitions++
		due = now.AddDate(0, 0, interval)
	default:
		return 0, 0, 0, 0, time.Time{}, fmt.Errorf("%w: оценка %q, ожидалось again/hard/good/easy", ErrCardInvalid, grade)
	}
	ease = math.Round(ease*100) / 100
	return interval, ease, repetitions, lapses, due, nil
}

// CreateCard добавляет свою карточку в колоду.
func (f *Flashcards) CreateCard(ctx context.Context, deckID, front, back, hint string) (Flashcard, error) {
	deckID = strings.TrimSpace(deckID)
	deck, ok := f.store.Deck(deckID)
	if !ok {
		return Flashcard{}, ErrDeckNotFound
	}
	front = strings.TrimSpace(front)
	back = strings.TrimSpace(back)
	hint = strings.TrimSpace(hint)
	if front == "" || back == "" {
		return Flashcard{}, fmt.Errorf("%w: нужны вопрос и ответ", ErrCardInvalid)
	}
	if utf8.RuneCountInString(front) > MaxFrontRunes {
		return Flashcard{}, fmt.Errorf("%w: вопрос длиннее %d символов", ErrCardInvalid, MaxFrontRunes)
	}
	if utf8.RuneCountInString(back) > MaxBackRunes {
		return Flashcard{}, fmt.Errorf("%w: ответ длиннее %d символов", ErrCardInvalid, MaxBackRunes)
	}

	var custom int
	if err := f.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM flashcards WHERE deck_id = ? AND custom = 1", deck.ID).Scan(&custom); err != nil {
		return Flashcard{}, err
	}
	if custom >= MaxCustomPerDeck {
		return Flashcard{}, fmt.Errorf("%w: в колоде уже %d своих карточек", ErrCardInvalid, MaxCustomPerDeck)
	}

	id, err := newCardID()
	if err != nil {
		return Flashcard{}, err
	}
	now := database.Now()
	if _, err := f.db.ExecContext(ctx, `
		INSERT INTO flashcards (id, deck_id, front, back, hint, ease, interval_days,
			repetitions, lapses, due_at, custom, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 1, ?, ?)`,
		id, deck.ID, front, back, hint, DefaultEase, now, now, now); err != nil {
		return Flashcard{}, fmt.Errorf("создать карточку: %w", err)
	}
	return f.Get(ctx, id)
}

// DeleteCard удаляет свою карточку. Карточки из контента защищены.
func (f *Flashcards) DeleteCard(ctx context.Context, id string) error {
	card, err := f.Get(ctx, id)
	if err != nil {
		return err
	}
	if !card.Custom {
		return ErrCardLocked
	}
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, "DELETE FROM card_reviews WHERE card_id = ?", id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM flashcards WHERE id = ?", id); err != nil {
		return err
	}
	return tx.Commit()
}

// ResetDeck обнуляет прогресс колоды: карточки снова становятся новыми.
func (f *Flashcards) ResetDeck(ctx context.Context, deckID string) (int, error) {
	if _, ok := f.store.Deck(deckID); !ok {
		return 0, ErrDeckNotFound
	}
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		"DELETE FROM card_reviews WHERE card_id IN (SELECT id FROM flashcards WHERE deck_id = ?)", deckID); err != nil {
		return 0, err
	}
	result, err := tx.ExecContext(ctx, `
		UPDATE flashcards SET ease = ?, interval_days = 0, repetitions = 0, lapses = 0,
			due_at = ?, updated_at = ? WHERE deck_id = ?`,
		DefaultEase, database.Now(), database.Now(), deckID)
	if err != nil {
		return 0, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(affected), nil
}

// CardReviews возвращает историю повторений карточки (для отладки и тестов).
func (f *Flashcards) CardReviews(ctx context.Context, cardID string) ([]string, error) {
	rows, err := f.db.QueryContext(ctx,
		"SELECT grade FROM card_reviews WHERE card_id = ? ORDER BY id", cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, 4)
	for rows.Next() {
		var grade string
		if err := rows.Scan(&grade); err != nil {
			return nil, err
		}
		out = append(out, grade)
	}
	return out, rows.Err()
}

func scanCard(scanner interface{ Scan(dest ...any) error }) (Flashcard, error) {
	var card Flashcard
	var custom int
	if err := scanner.Scan(&card.ID, &card.DeckID, &card.Front, &card.Back, &card.Hint,
		&card.Ease, &card.Interval, &card.Repetitions, &card.Lapses, &card.DueAt, &custom,
		&card.Reviews, &card.LastReview); err != nil {
		return Flashcard{}, err
	}
	card.Custom = custom == 1
	card.New = card.Reviews == 0
	card.Learning = !card.New && card.Interval == 0
	return card, nil
}

func newCardID() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "custom-" + hex.EncodeToString(buf), nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
