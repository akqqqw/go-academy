package api

import (
	"errors"
	"net/http"
	"strings"

	"goacademy/internal/runner"
	"goacademy/internal/storage"
)

// maxDraftBytes ограничивает размер сохраняемого кода.
const maxDraftBytes = 256 << 10

// runRequest — тело запроса на запуск кода.
type runRequest struct {
	Code   string `json:"code"`
	Source string `json:"source"`
	RefID  string `json:"ref_id"`
}

// handleEditorStatus рассказывает интерфейсу, доступен ли запуск кода.
func (s *Server) handleEditorStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"runner": s.runner.Status(r.Context())})
}

// handleRunCode компилирует и запускает код во временном каталоге.
func (s *Server) handleRunCode(w http.ResponseWriter, r *http.Request) {
	var payload runRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}

	source := normalizeRunSource(payload.Source)
	result, err := s.runner.Run(r.Context(), payload.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "run_failed", err.Error())
		return
	}

	// В историю попадают все запуски, включая ошибки: это часть статистики.
	if recordErr := s.drafts.RecordRun(r.Context(), source, payload.RefID,
		payload.Code, result.Status == runner.StatusOK, result.DurationMs); recordErr != nil {
		s.log.Warn("не удалось записать запуск", "err", recordErr)
	}
	writeJSON(w, http.StatusOK, result)
}

// handleCheckCode компилирует код, ничего не запуская.
func (s *Server) handleCheckCode(w http.ResponseWriter, r *http.Request) {
	var payload runRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	result, err := s.runner.Build(r.Context(), payload.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "check_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleFormatCode форматирует код через gofmt.
func (s *Server) handleFormatCode(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}

	formatted, diagnostics, err := s.runner.Format(payload.Code)
	if err != nil {
		writeError(w, http.StatusBadRequest, "format_failed", err.Error())
		return
	}
	if diagnostics == nil {
		diagnostics = []runner.Diagnostic{}
	}
	status := "ok"
	if len(diagnostics) > 0 {
		status = runner.StatusCompileError
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      status,
		"code":        formatted,
		"diagnostics": diagnostics,
	})
}

// handleDraftGet возвращает сохранённый черновик.
func (s *Server) handleDraftGet(w http.ResponseWriter, r *http.Request) {
	key, ok := draftKey(w, r)
	if !ok {
		return
	}
	draft, err := s.drafts.Get(r.Context(), key)
	if errors.Is(err, storage.ErrDraftNotFound) {
		writeError(w, http.StatusNotFound, "draft_not_found", "черновик не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "draft_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"draft": draft})
}

// handleDraftSave сохраняет код (PUT) — используется автосохранением.
func (s *Server) handleDraftSave(w http.ResponseWriter, r *http.Request) {
	key, ok := draftKey(w, r)
	if !ok {
		return
	}
	var payload struct {
		Code  string `json:"code"`
		Title string `json:"title"`
	}
	if err := decodeJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	if len(payload.Code) > maxDraftBytes {
		writeError(w, http.StatusBadRequest, "draft_too_large", "код больше 256 КиБ")
		return
	}
	if len(payload.Title) > 200 {
		payload.Title = payload.Title[:200]
	}

	draft, err := s.drafts.Save(r.Context(), key, payload.Title, payload.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "draft_save_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"draft": draft})
}

// handleDraftDelete удаляет черновик.
func (s *Server) handleDraftDelete(w http.ResponseWriter, r *http.Request) {
	key, ok := draftKey(w, r)
	if !ok {
		return
	}
	err := s.drafts.Delete(r.Context(), key)
	if errors.Is(err, storage.ErrDraftNotFound) {
		writeError(w, http.StatusNotFound, "draft_not_found", "черновик не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "draft_delete_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "key": key})
}

// handleDraftsList возвращает сохранённые черновики и историю запусков.
func (s *Server) handleDraftsList(w http.ResponseWriter, r *http.Request) {
	limit, err := queryInt(r, "limit", 50, 1, 200)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	drafts, err := s.drafts.List(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "drafts_read_failed", err.Error())
		return
	}
	runs, err := s.drafts.RecentRuns(r.Context(), 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "runs_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"drafts": drafts, "runs": runs})
}

// draftKey читает и валидирует ключ черновика из пути.
func draftKey(w http.ResponseWriter, r *http.Request) (string, bool) {
	key := strings.TrimSpace(r.PathValue("key"))
	if key == "" {
		writeError(w, http.StatusBadRequest, "invalid_key", "ключ черновика не указан")
		return "", false
	}
	if len(key) > 120 {
		writeError(w, http.StatusBadRequest, "invalid_key", "ключ черновика длиннее 120 символов")
		return "", false
	}
	for _, char := range key {
		valid := char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' ||
			char >= '0' && char <= '9' || char == '-' || char == '_' || char == ':' || char == '.' || char == '/'
		if !valid {
			writeError(w, http.StatusBadRequest, "invalid_key",
				"ключ может содержать только латиницу, цифры и символы - _ : . /")
			return "", false
		}
	}
	return key, true
}

// normalizeRunSource ограничивает значение source известным набором.
func normalizeRunSource(source string) string {
	switch source {
	case "lesson", "exercise", "practice":
		return source
	default:
		return "editor"
	}
}
