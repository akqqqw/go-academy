package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// maxBodyBytes ограничивает размер JSON-тела запроса.
const maxBodyBytes = 1 << 20 // 1 МиБ

// ErrorPayload — тело ошибки API. Формат единый для всех эндпоинтов.
type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]ErrorPayload{"error": {Code: code, Message: message}})
}

func writeErrorDetails(w http.ResponseWriter, status int, code, message string, details any) {
	writeJSON(w, status, map[string]ErrorPayload{"error": {Code: code, Message: message, Details: details}})
}

// decodeJSON читает JSON-тело запроса с ограничением размера и строгим разбором.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		switch {
		case errors.As(err, &maxErr):
			return fmt.Errorf("тело запроса слишком большое")
		case errors.Is(err, io.EOF):
			return fmt.Errorf("тело запроса пустое")
		case strings.HasPrefix(err.Error(), "json: unknown field"):
			return fmt.Errorf("неизвестное поле: %s", strings.TrimPrefix(err.Error(), "json: unknown field "))
		default:
			return fmt.Errorf("некорректный JSON: %w", err)
		}
	}
	if decoder.More() {
		return fmt.Errorf("в теле запроса больше одного JSON-значения")
	}
	return nil
}

// queryInt читает целочисленный query-параметр с ограничением диапазона.
func queryInt(r *http.Request, key string, fallback, minValue, maxValue int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	var value int
	if _, err := fmt.Sscanf(raw, "%d", &value); err != nil {
		return 0, fmt.Errorf("параметр %s должен быть числом", key)
	}
	if value < minValue {
		value = minValue
	}
	if value > maxValue {
		value = maxValue
	}
	return value, nil
}
