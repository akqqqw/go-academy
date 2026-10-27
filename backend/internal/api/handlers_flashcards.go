package api

import (
	"errors"
	"net/http"
	"strings"

	"goacademy/internal/storage"
)

// flashcardRequest — тело запроса на создание своей карточки.
type flashcardRequest struct {
	DeckID string `json:"deck_id"`
	Front  string `json:"front"`
	Back   string `json:"back"`
	Hint   string `json:"hint"`
}

// reviewRequest — оценка повторения.
type reviewRequest struct {
	Grade string `json:"grade"`
}

// handleFlashcardsOverview отдаёт колоды с прогрессом и общую сводку.
func (s *Server) handleFlashcardsOverview(w http.ResponseWriter, r *http.Request) {
	decks, stats, err := s.flashcards.Overview(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "flashcards_read_failed", err.Error())
		return
	}
	if decks == nil {
		decks = []storage.DeckView{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"decks":  decks,
		"stats":  stats,
		"source": "content/flashcards/decks.json",
	})
}

// handleFlashcardsQueue отдаёт карточки к повторению.
func (s *Server) handleFlashcardsQueue(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit, err := queryInt(r, "limit", storage.DefaultQueue, 1, storage.MaxQueue)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	deckID := strings.TrimSpace(query.Get("deck"))

	cards, remaining, err := s.flashcards.Queue(r.Context(), deckID, limit)
	if err != nil {
		s.writeCardError(w, err)
		return
	}
	if cards == nil {
		cards = []storage.Flashcard{}
	}
	response := map[string]any{
		"cards":     cards,
		"remaining": remaining,
		"limit":     limit,
	}
	if deckID != "" {
		if deck, ok := s.cardDecks.Deck(deckID); ok {
			response["deck"] = map[string]any{
				"id":          deck.ID,
				"title":       deck.Title,
				"description": deck.Description,
				"level":       deck.Level,
				"icon":        deck.Icon,
				"module":      deck.Module,
			}
		}
	}
	writeJSON(w, http.StatusOK, response)
}

// handleFlashcardsStats отдаёт только сводку: её перезапрашивает интерфейс
// после каждой оценки.
func (s *Server) handleFlashcardsStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.flashcards.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "flashcards_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"stats": stats})
}

// handleFlashcardGet отдаёт одну карточку с прогрессом.
func (s *Server) handleFlashcardGet(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	card, err := s.flashcards.Get(r.Context(), id)
	if err != nil {
		s.writeCardError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"card": card})
}

// handleFlashcardReview сохраняет оценку и возвращает обновлённую карточку.
func (s *Server) handleFlashcardReview(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	var payload reviewRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	card, err := s.flashcards.Review(r.Context(), id, payload.Grade)
	if err != nil {
		s.writeCardError(w, err)
		return
	}
	stats, err := s.flashcards.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "flashcards_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"card":  card,
		"stats": stats,
		// due — сколько карточек осталось повторить сейчас, с учётом новой даты.
		"due": stats.Due,
	})
}

// handleFlashcardCreate добавляет свою карточку в колоду.
func (s *Server) handleFlashcardCreate(w http.ResponseWriter, r *http.Request) {
	var payload flashcardRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	card, err := s.flashcards.CreateCard(r.Context(), payload.DeckID, payload.Front, payload.Back, payload.Hint)
	if err != nil {
		s.writeCardError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"card": card})
}

// handleFlashcardDelete удаляет свою карточку.
func (s *Server) handleFlashcardDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if err := s.flashcards.DeleteCard(r.Context(), id); err != nil {
		s.writeCardError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": id})
}

// handleDeckReset обнуляет прогресс колоды.
func (s *Server) handleDeckReset(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	reset, err := s.flashcards.ResetDeck(r.Context(), id)
	if err != nil {
		s.writeCardError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reset": reset, "deck_id": id})
}

// writeCardError переводит ошибки сервиса карточек в HTTP-коды.
func (s *Server) writeCardError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, storage.ErrCardNotFound):
		writeError(w, http.StatusNotFound, "card_not_found", "карточка не найдена")
	case errors.Is(err, storage.ErrDeckNotFound):
		writeError(w, http.StatusNotFound, "deck_not_found", "колода не найдена")
	case errors.Is(err, storage.ErrCardInvalid):
		writeError(w, http.StatusBadRequest, "card_invalid",
			strings.TrimPrefix(err.Error(), storage.ErrCardInvalid.Error()+": "))
	case errors.Is(err, storage.ErrCardLocked):
		writeError(w, http.StatusBadRequest, "card_locked",
			"карточки из контента не удаляются: измените content/flashcards/decks.json")
	default:
		writeError(w, http.StatusInternalServerError, "flashcards_error", err.Error())
	}
}
