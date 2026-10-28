package api

import (
	"errors"
	"net/http"
	"strings"

	"goacademy/internal/storage"
)

// noteRequest — тело запроса на создание или обновление заметки.
type noteRequest struct {
	Title    string   `json:"title"`
	Body     string   `json:"body"`
	Folder   string   `json:"folder"`
	LessonID string   `json:"lesson_id"`
	Pinned   bool     `json:"pinned"`
	Tags     []string `json:"tags"`
}

func (r noteRequest) input() storage.NoteInput {
	return storage.NoteInput{
		Title:    r.Title,
		Body:     r.Body,
		Folder:   r.Folder,
		LessonID: r.LessonID,
		Pinned:   r.Pinned,
		Tags:     r.Tags,
	}
}

// handleNotesList отдаёт заметки с фильтрами, тегами, папками и сводкой.
func (s *Server) handleNotesList(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit, err := queryInt(r, "limit", 100, 1, 500)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	filter := storage.NoteFilter{
		Query:    strings.TrimSpace(query.Get("q")),
		Folder:   strings.TrimSpace(query.Get("folder")),
		Tag:      strings.TrimSpace(query.Get("tag")),
		LessonID: strings.TrimSpace(query.Get("lesson")),
		Pinned:   query.Get("pinned") == "1" || query.Get("pinned") == "true",
		Limit:    limit,
	}

	notes, err := s.notes.List(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "notes_read_failed", err.Error())
		return
	}
	if notes == nil {
		notes = []storage.Note{}
	}
	folders, err := s.notes.Folders(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "folders_read_failed", err.Error())
		return
	}
	if folders == nil {
		folders = []storage.Folder{}
	}
	tags, err := s.notes.Tags(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "tags_read_failed", err.Error())
		return
	}
	if tags == nil {
		tags = []storage.TagCount{}
	}
	stats, err := s.notes.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stats_read_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"notes":    notes,
		"folders":  folders,
		"tags":     tags,
		"stats":    stats,
		"filtered": len(notes),
	})
}

// handleNoteCreate создаёт заметку.
func (s *Server) handleNoteCreate(w http.ResponseWriter, r *http.Request) {
	var payload noteRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	note, err := s.notes.Create(r.Context(), payload.input())
	if err != nil {
		s.writeNoteError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"note": note})
}

// handleNoteGet отдаёт одну заметку.
func (s *Server) handleNoteGet(w http.ResponseWriter, r *http.Request) {
	note, ok := s.noteFromPath(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"note": note})
}

// handleNoteUpdate перезаписывает заметку: этим же путём работает автосохранение.
func (s *Server) handleNoteUpdate(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_id", "не указан идентификатор заметки")
		return
	}
	var payload noteRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	note, err := s.notes.Update(r.Context(), id, payload.input())
	if err != nil {
		s.writeNoteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"note": note})
}

// handleNoteDelete удаляет заметку.
func (s *Server) handleNoteDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_id", "не указан идентификатор заметки")
		return
	}
	if err := s.notes.Delete(r.Context(), id); err != nil {
		s.writeNoteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": id})
}

// handleNoteTags отдаёт список тегов с количеством заметок.
func (s *Server) handleNoteTags(w http.ResponseWriter, r *http.Request) {
	tags, err := s.notes.Tags(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "tags_read_failed", err.Error())
		return
	}
	if tags == nil {
		tags = []storage.TagCount{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tags": tags})
}

// handleFoldersList отдаёт папки заметок.
func (s *Server) handleFoldersList(w http.ResponseWriter, r *http.Request) {
	folders, err := s.notes.Folders(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "folders_read_failed", err.Error())
		return
	}
	if folders == nil {
		folders = []storage.Folder{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"folders": folders})
}

// handleFolderCreate создаёт папку.
func (s *Server) handleFolderCreate(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	folder, err := s.notes.CreateFolder(r.Context(), payload.Name)
	if err != nil {
		s.writeNoteError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"folder": folder})
}

// handleFolderRename переименовывает папку: заметки переезжают вместе с ней.
func (s *Server) handleFolderRename(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_id", "не указан идентификатор папки")
		return
	}
	var payload struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	folder, err := s.notes.RenameFolder(r.Context(), id, payload.Name)
	if err != nil {
		s.writeNoteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folder": folder})
}

// handleFolderDelete удаляет папку, перенося заметки в «Общее».
func (s *Server) handleFolderDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_id", "не указан идентификатор папки")
		return
	}
	if err := s.notes.DeleteFolder(r.Context(), id); err != nil {
		s.writeNoteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": id})
}

// noteFromPath читает заметку по {id} или отвечает 404.
func (s *Server) noteFromPath(w http.ResponseWriter, r *http.Request) (storage.Note, bool) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_id", "не указан идентификатор заметки")
		return storage.Note{}, false
	}
	note, err := s.notes.Get(r.Context(), id)
	if err != nil {
		s.writeNoteError(w, err)
		return storage.Note{}, false
	}
	return note, true
}

// writeNoteError переводит ошибки заметок в HTTP-ответы.
func (s *Server) writeNoteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, storage.ErrNoteNotFound):
		writeError(w, http.StatusNotFound, "note_not_found", "заметка не найдена")
	case errors.Is(err, storage.ErrNoteInvalid):
		writeError(w, http.StatusBadRequest, "note_invalid", strings.TrimPrefix(err.Error(), storage.ErrNoteInvalid.Error()+": "))
	case errors.Is(err, storage.ErrFolderNotFound):
		writeError(w, http.StatusNotFound, "folder_not_found", "папка не найдена")
	case errors.Is(err, storage.ErrFolderExists):
		writeError(w, http.StatusConflict, "folder_exists", "папка с таким названием уже есть")
	default:
		writeError(w, http.StatusInternalServerError, "notes_error", err.Error())
	}
}
