package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"goacademy/internal/config"
	"goacademy/internal/database"
)

type testEnv struct {
	server *Server
	client *http.Client
	base   string
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	dir := t.TempDir()
	db, err := database.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("открыть базу: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	contentDir := filepath.Join("..", "..", "..", "content")
	cfg := config.Config{
		Addr:           "127.0.0.1:0",
		DataDir:        dir,
		ContentDir:     contentDir,
		FrontendDir:    filepath.Join(dir, "dist"),
		AllowedOrigins: []string{"http://localhost:5173"},
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server := New(cfg, db, logger)

	httpServer := httptest.NewServer(server.Handler())
	t.Cleanup(httpServer.Close)

	return &testEnv{server: server, client: httpServer.Client(), base: httpServer.URL}
}

func (e *testEnv) do(t *testing.T, method, path string, body any) (*http.Response, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, e.base+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp, payload
}

func decode(t *testing.T, payload []byte) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(payload, &out); err != nil {
		t.Fatalf("некорректный JSON (%s): %v", truncate(string(payload)), err)
	}
	return out
}

func truncate(s string) string {
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}

func TestHealth(t *testing.T) {
	env := newTestEnv(t)
	resp, payload := env.do(t, http.MethodGet, "/api/health", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	if got := decode(t, payload)["status"]; got != "ok" {
		t.Errorf("status = %v", got)
	}
}

func TestCourseEndpoint(t *testing.T) {
	env := newTestEnv(t)
	resp, payload := env.do(t, http.MethodGet, "/api/course", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	course, ok := body["course"].(map[string]any)
	if !ok {
		t.Fatalf("нет объекта course: %s", truncate(string(payload)))
	}
	modules, ok := course["modules"].([]any)
	if !ok || len(modules) != 14 {
		t.Fatalf("модулей = %d, ожидалось 14", len(modules))
	}
	if course["lesson_count"].(float64) != 104 {
		t.Errorf("уроков = %v", course["lesson_count"])
	}
	first := body["first_lesson"].(map[string]any)
	if first["id"] != "m01-01" {
		t.Errorf("первый урок = %v", first["id"])
	}
}

func TestSettingsFlow(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/settings", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	body := decode(t, payload)
	settings := body["settings"].(map[string]any)
	if settings["theme"] != "dark" {
		t.Errorf("тема = %v", settings["theme"])
	}
	if _, ok := body["definitions"].([]any); !ok {
		t.Error("нет описаний настроек")
	}

	resp, payload = env.do(t, http.MethodPatch, "/api/settings", map[string]any{"theme": "light"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH статус = %d: %s", resp.StatusCode, payload)
	}
	if decode(t, payload)["settings"].(map[string]any)["theme"] != "light" {
		t.Error("тема не обновилась")
	}

	resp, payload = env.do(t, http.MethodPatch, "/api/settings", map[string]any{"theme": "neon"})
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("статус для невалидного значения = %d, ожидался 422: %s", resp.StatusCode, payload)
	}
	errorBody := decode(t, payload)["error"].(map[string]any)
	if errorBody["code"] != "validation_error" {
		t.Errorf("код ошибки = %v", errorBody["code"])
	}

	resp, _ = env.do(t, http.MethodPatch, "/api/settings", map[string]any{"hack": 1})
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("неизвестная настройка: статус = %d", resp.StatusCode)
	}

	resp, _ = env.do(t, http.MethodPatch, "/api/settings", map[string]any{"daily_goal_minutes": "15"})
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("строка вместо числа: статус = %d", resp.StatusCode)
	}
}

func TestActivityStudyPing(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodPost, "/api/activity/study", map[string]any{"seconds": 45, "source": "heartbeat"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	today := body["today"].(map[string]any)
	if today["study_seconds"].(float64) != 45 {
		t.Errorf("секунды = %v", today["study_seconds"])
	}

	for _, bad := range []map[string]any{{"seconds": 0}, {"seconds": -5}, {"seconds": 1000}, {"seconds": 10, "source": "hack"}} {
		resp, _ := env.do(t, http.MethodPost, "/api/activity/study", bad)
		if resp.StatusCode != http.StatusUnprocessableEntity {
			t.Errorf("тело %v: статус = %d, ожидался 422", bad, resp.StatusCode)
		}
	}

	resp, payload = env.do(t, http.MethodGet, "/api/activity?days=30", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/activity статус = %d", resp.StatusCode)
	}
	days := decode(t, payload)["days"].([]any)
	if len(days) != 30 {
		t.Errorf("дней = %d, ожидалось 30", len(days))
	}
}

func TestProgressAndDashboard(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/progress", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	snapshot := decode(t, payload)["snapshot"].(map[string]any)
	lessons := snapshot["lessons"].(map[string]any)
	if lessons["total"].(float64) != 104 {
		t.Errorf("всего уроков = %v", lessons["total"])
	}
	if lessons["completed"].(float64) != 0 {
		t.Errorf("завершённых уроков = %v", lessons["completed"])
	}
	plan := snapshot["plan"].([]any)
	if len(plan) != 4 {
		t.Errorf("пунктов плана = %d", len(plan))
	}

	resp, payload = env.do(t, http.MethodGet, "/api/dashboard", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dashboard статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	if body["continue_lesson"] == nil {
		t.Fatal("нет блока «Продолжить обучение»")
	}
	card := body["continue_lesson"].(map[string]any)
	if card["lesson_id"] != "m01-01" {
		t.Errorf("продолжение = %v, ожидался m01-01", card["lesson_id"])
	}
	if card["module_stat"].(map[string]any)["total"].(float64) != 7 {
		t.Errorf("уроков в модуле 1 = %v", card["module_stat"])
	}
	if body["recent"].([]any) == nil {
		t.Error("recent должен быть массивом")
	}
}

func TestSearch(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/search?q=%D1%81%D1%80%D0%B5%D0%B7", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	body := decode(t, payload)
	results := body["results"].([]any)
	if len(results) == 0 {
		t.Fatal("поиск не вернул результатов")
	}
	routes := map[string]bool{}
	for _, item := range results {
		routes[item.(map[string]any)["route"].(string)] = true
	}
	if !routes["/learning/m04-02"] {
		t.Error("в результатах нет маршрута урока о срезах")
	}

	resp, payload = env.do(t, http.MethodGet, "/api/search?q=", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("пустой поиск: статус = %d", resp.StatusCode)
	}
	if decode(t, payload)["count"].(float64) != 0 {
		t.Error("пустой запрос должен возвращать 0 результатов")
	}
}

func TestUnknownAPIRoute(t *testing.T) {
	env := newTestEnv(t)
	resp, payload := env.do(t, http.MethodGet, "/api/nothing", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("статус = %d, ожидался 404", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %s, ожидался JSON", ct)
	}
	if decode(t, payload)["error"].(map[string]any)["code"] != "not_found" {
		t.Error("ожидался код not_found")
	}
}

func TestMethodNotAllowed(t *testing.T) {
	env := newTestEnv(t)
	resp, _ := env.do(t, http.MethodDelete, "/api/settings", nil)
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("статус = %d, ожидался 405", resp.StatusCode)
	}
}

func TestSPAFallbackWithoutBuild(t *testing.T) {
	env := newTestEnv(t)
	resp, payload := env.do(t, http.MethodGet, "/learning/m01-01", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	if !strings.Contains(string(payload), "Go Academy") {
		t.Error("страница-подсказка не отдана")
	}
	if env.server.FrontendReady() {
		t.Error("сборка фронтенда не должна считаться готовой")
	}
}

func TestCORSHeaders(t *testing.T) {
	env := newTestEnv(t)
	req, _ := http.NewRequest(http.MethodOptions, env.base+"/api/settings", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	resp, err := env.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("preflight статус = %d", resp.StatusCode)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Errorf("CORS заголовок = %q", resp.Header.Get("Access-Control-Allow-Origin"))
	}

	req, _ = http.NewRequest(http.MethodOptions, env.base+"/api/settings", nil)
	req.Header.Set("Origin", "http://evil.example")
	resp, err = env.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Error("чужой origin не должен получать CORS-разрешение")
	}
}

func TestInvalidJSON(t *testing.T) {
	env := newTestEnv(t)
	req, _ := http.NewRequest(http.MethodPatch, env.base+"/api/settings", strings.NewReader("{oops"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("статус = %d, ожидался 400", resp.StatusCode)
	}
}

func TestMetaAndBackups(t *testing.T) {
	env := newTestEnv(t)
	resp, payload := env.do(t, http.MethodGet, "/api/meta", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("meta статус = %d", resp.StatusCode)
	}
	body := decode(t, payload)
	if body["app"].(map[string]any)["stage"].(float64) != float64(Stage) {
		t.Error("этап в meta не совпадает")
	}
	if body["content"].(map[string]any)["lessons"].(float64) != 104 {
		t.Error("количество уроков в meta неверно")
	}

	resp, payload = env.do(t, http.MethodGet, "/api/backups", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("backups статус = %d", resp.StatusCode)
	}
	if _, ok := decode(t, payload)["backups"].([]any); !ok {
		t.Error("backups должен быть массивом")
	}

	resp, payload = env.do(t, http.MethodGet, "/api/backup", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("скачивание копии: статус = %d", resp.StatusCode)
	}
	if !strings.Contains(resp.Header.Get("Content-Disposition"), "attachment") {
		t.Errorf("Content-Disposition = %q", resp.Header.Get("Content-Disposition"))
	}
	if len(payload) < 100 {
		t.Errorf("файл копии слишком мал: %d байт", len(payload))
	}
}

func TestLessonProgressFlow(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodPost, "/api/lessons/m01-01/opened", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("открытие урока: статус = %d: %s", resp.StatusCode, payload)
	}
	lesson := decode(t, payload)["lesson"].(map[string]any)
	if lesson["status"] != "in_progress" {
		t.Errorf("статус урока = %v", lesson["status"])
	}
	if lesson["last_opened_at"] == nil {
		t.Error("не сохранено время открытия")
	}

	resp, payload = env.do(t, http.MethodGet, "/api/lessons/m01-01", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET урок: статус = %d", resp.StatusCode)
	}
	if decode(t, payload)["lesson"].(map[string]any)["title"] != "Что такое Go" {
		t.Error("название урока не сохранено")
	}

	resp, payload = env.do(t, http.MethodGet, "/api/lessons/m02-01", nil)
	if decode(t, payload)["lesson"].(map[string]any)["status"] != "not_started" {
		t.Errorf("неизвестный прогресс должен возвращать not_started: %s", payload)
	}

	resp, _ = env.do(t, http.MethodPost, "/api/lessons/nope/opened", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("несуществующий урок: статус = %d, ожидался 404", resp.StatusCode)
	}

	// Прогресс урока отражается в главной странице, плане и статистике.
	_, payload = env.do(t, http.MethodGet, "/api/dashboard", nil)
	body := decode(t, payload)
	card := body["continue_lesson"].(map[string]any)
	if card["lesson_id"] != "m01-01" || card["lesson_status"] != "in_progress" {
		t.Errorf("блок продолжения = %v", card)
	}
	recent := body["recent"].([]any)
	if len(recent) == 0 || recent[0].(map[string]any)["type"] != "lesson" {
		t.Errorf("в недавней активности нет урока: %v", recent)
	}
	plan := body["snapshot"].(map[string]any)["plan"].([]any)
	if plan[0].(map[string]any)["done"] != true {
		t.Error("пункт «Продолжить урок» должен стать выполненным")
	}

	_, payload = env.do(t, http.MethodGet, "/api/progress", nil)
	inProgress := decode(t, payload)["snapshot"].(map[string]any)["lessons"].(map[string]any)["in_progress"]
	if inProgress.(float64) != 1 {
		t.Errorf("уроков в процессе = %v, ожидался 1", inProgress)
	}

	_, payload = env.do(t, http.MethodGet, "/api/activity?days=7", nil)
	days := decode(t, payload)["days"].([]any)
	today := days[len(days)-1].(map[string]any)
	if today["lessons_opened"].(float64) != 1 {
		t.Errorf("открытий уроков за сегодня = %v", today["lessons_opened"])
	}
}

func TestLessonContentEndpoint(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/lessons/m01-01/content", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	lesson := body["lesson"].(map[string]any)
	if lesson["title"] != "Что такое Go" {
		t.Errorf("заголовок = %v", lesson["title"])
	}
	if lesson["module_title"] != "Введение в Go" || lesson["module_number"].(float64) != 1 {
		t.Errorf("контекст модуля = %v", lesson)
	}
	if len(lesson["objectives"].([]any)) < 2 {
		t.Errorf("целей = %d", len(lesson["objectives"].([]any)))
	}
	if lesson["status"] != "not_started" {
		t.Errorf("статус = %v, ожидался not_started", lesson["status"])
	}
	if body["prev"] != nil {
		t.Errorf("у первого урока не должно быть предыдущего: %v", body["prev"])
	}
	next := body["next"].(map[string]any)
	if next["id"] != "m01-02" {
		t.Errorf("следующий урок = %v", next["id"])
	}
	if starter, _ := body["starter_code"].(string); !strings.Contains(starter, "package main") {
		t.Errorf("нет стартового кода для редактора: %q", starter)
	}
	markdown := body["markdown"].(string)
	for _, marker := range []string{"## Практика", "## Резюме", "```go"} {
		if !strings.Contains(markdown, marker) {
			t.Errorf("в тексте урока нет %q", marker)
		}
	}

	// Урок без материала: программа знает о нём, но файла ещё нет.
	resp, payload = env.do(t, http.MethodGet, "/api/lessons/m03-01/content", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("статус для урока без материала = %d", resp.StatusCode)
	}
	if decode(t, payload)["error"].(map[string]any)["code"] != "content_not_ready" {
		t.Errorf("ожидался код content_not_ready: %s", payload)
	}

	resp, _ = env.do(t, http.MethodGet, "/api/lessons/nope/content", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("несуществующий урок: статус = %d", resp.StatusCode)
	}
}

func TestLessonCompletion(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodPost, "/api/lessons/m01-01/completed", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("завершение урока: статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	lesson := body["lesson"].(map[string]any)
	if lesson["status"] != "completed" || lesson["completed_at"] == nil {
		t.Errorf("урок не отмечен завершённым: %v", lesson)
	}
	if body["already_completed"] != false {
		t.Error("первое завершение не должно считаться повторным")
	}
	if body["today"].(map[string]any)["lessons_done"].(float64) != 1 {
		t.Errorf("счётчик завершённых уроков = %v", body["today"])
	}

	// Повторное завершение не удваивает счётчик.
	resp, payload = env.do(t, http.MethodPost, "/api/lessons/m01-01/completed", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("повтор: статус = %d", resp.StatusCode)
	}
	body = decode(t, payload)
	if body["already_completed"] != true {
		t.Error("повторное завершение должно помечаться already_completed")
	}
	if body["today"].(map[string]any)["lessons_done"].(float64) != 1 {
		t.Errorf("счётчик удвоился: %v", body["today"])
	}

	// Прогресс виден в курсе, дашборде и статистике.
	_, payload = env.do(t, http.MethodGet, "/api/course", nil)
	course := decode(t, payload)["course"].(map[string]any)
	modules := course["modules"].([]any)
	firstLesson := modules[0].(map[string]any)["lessons"].([]any)[0].(map[string]any)
	if firstLesson["status"] != "completed" {
		t.Errorf("статус урока в программе = %v", firstLesson["status"])
	}
	if modules[0].(map[string]any)["progress"].(float64) == 0 {
		t.Error("прогресс модуля не вырос")
	}

	_, payload = env.do(t, http.MethodGet, "/api/progress", nil)
	lessons := decode(t, payload)["snapshot"].(map[string]any)["lessons"].(map[string]any)
	if lessons["completed"].(float64) != 1 {
		t.Errorf("завершённых уроков = %v", lessons["completed"])
	}

	// Урок без материала завершить нельзя.
	resp, _ = env.do(t, http.MethodPost, "/api/lessons/m03-01/completed", nil)
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("статус для урока без материала = %d, ожидался 409", resp.StatusCode)
	}
}

func TestCourseHasFifteenReadyLessons(t *testing.T) {
	env := newTestEnv(t)
	_, payload := env.do(t, http.MethodGet, "/api/course", nil)
	body := decode(t, payload)
	course := body["course"].(map[string]any)
	ready := int(course["ready_count"].(float64))
	if ready < 15 {
		t.Errorf("готовых уроков = %d, ожидалось не меньше 15", ready)
	}
	extras := body["extras"].(map[string]any)
	if extras["exercises"] != float64(30) {
		t.Errorf("практических заданий = %v, ожидалось 30", extras["exercises"])
	}
}

func TestEditorStatusAndFormat(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/editor/status", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	status := decode(t, payload)["runner"].(map[string]any)
	warning, _ := status["warning"].(string)
	if !strings.Contains(warning, "не песочница") {
		t.Errorf("нет предупреждения об изоляции: %q", warning)
	}
	limits := status["limits"].(map[string]any)
	if limits["timeout_ms"].(float64) <= 0 || limits["max_output_bytes"].(float64) <= 0 {
		t.Errorf("лимиты не заполнены: %v", limits)
	}

	resp, payload = env.do(t, http.MethodPost, "/api/editor/format", map[string]any{
		"code": "package main\nimport \"fmt\"\nfunc main(){\nfmt.Println( 1 )\n}\n",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("форматирование: статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	if body["status"] != "ok" {
		t.Errorf("статус форматирования = %v", body["status"])
	}
	if !strings.Contains(body["code"].(string), "\tfmt.Println(1)") {
		t.Errorf("код не отформатирован:\n%s", body["code"])
	}

	_, payload = env.do(t, http.MethodPost, "/api/editor/format", map[string]any{
		"code": "package main\n\nfunc main() {\n",
	})
	body = decode(t, payload)
	diagnostics := body["diagnostics"].([]any)
	if len(diagnostics) == 0 {
		t.Fatal("ожидались диагностики")
	}
	if diagnostics[0].(map[string]any)["line"].(float64) != 3 {
		t.Errorf("строка = %v", diagnostics[0])
	}

	resp, _ = env.do(t, http.MethodPost, "/api/editor/format", map[string]any{"code": "  "})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("пустой код: статус = %d", resp.StatusCode)
	}
}

func TestRunCodeEndpoint(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/editor/status", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	status := decode(t, payload)["runner"].(map[string]any)
	if status["available"] != true {
		t.Skipf("Go SDK недоступен: %v", status["reason"])
	}

	resp, payload = env.do(t, http.MethodPost, "/api/editor/run", map[string]any{
		"code":   "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println(\"готово\") }\n",
		"source": "editor",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("запуск: статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	if body["status"] != "ok" {
		t.Fatalf("статус запуска = %v: %v", body["status"], body["stderr"])
	}
	if !strings.Contains(body["stdout"].(string), "готово") {
		t.Errorf("stdout = %q", body["stdout"])
	}

	// Ошибка компиляции приходит с номером строки.
	_, payload = env.do(t, http.MethodPost, "/api/editor/run", map[string]any{
		"code": "package main\n\nfunc main() { missing() }\n",
	})
	body = decode(t, payload)
	if body["status"] != "compile_error" {
		t.Fatalf("статус = %v", body["status"])
	}
	diagnostics := body["diagnostics"].([]any)
	if len(diagnostics) == 0 || diagnostics[0].(map[string]any)["line"].(float64) != 3 {
		t.Errorf("диагностики = %v", diagnostics)
	}

	// Запрещённый импорт не доходит до компиляции.
	_, payload = env.do(t, http.MethodPost, "/api/editor/run", map[string]any{
		"code": "package main\n\nimport \"os/exec\"\n\nfunc main() { _ = exec.Command(\"ls\") }\n",
	})
	if decode(t, payload)["status"] != "rejected" {
		t.Errorf("ожидался отказ: %s", payload)
	}

	// Пустой код — не ошибка протокола: сервер отвечает 200 и объясняет причину.
	resp, payload = env.do(t, http.MethodPost, "/api/editor/run", map[string]any{})
	if resp.StatusCode != http.StatusOK || decode(t, payload)["status"] != "rejected" {
		t.Errorf("пустой код: статус = %d, тело = %s", resp.StatusCode, payload)
	}
}

func TestDraftsCRUD(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/drafts/editor", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("пустой черновик: статус = %d", resp.StatusCode)
	}

	resp, payload = env.do(t, http.MethodPut, "/api/drafts/editor", map[string]any{
		"code":  "package main\n",
		"title": "Черновик",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("сохранение: статус = %d: %s", resp.StatusCode, payload)
	}
	draft := decode(t, payload)["draft"].(map[string]any)
	if draft["code"] != "package main\n" || draft["title"] != "Черновик" {
		t.Errorf("черновик = %v", draft)
	}
	if draft["size"].(float64) != float64(len("package main\n")) {
		t.Errorf("размер = %v", draft["size"])
	}

	// Повторное сохранение перезаписывает код, сохраняя время создания.
	createdAt := draft["created_at"]
	_, payload = env.do(t, http.MethodPut, "/api/drafts/editor", map[string]any{"code": "package main // v2"})
	draft = decode(t, payload)["draft"].(map[string]any)
	if draft["code"] != "package main // v2" {
		t.Errorf("код не обновился: %v", draft["code"])
	}
	if draft["created_at"] != createdAt {
		t.Errorf("время создания изменилось: %v → %v", createdAt, draft["created_at"])
	}

	// Черновик урока живёт отдельно от свободного редактора.
	env.do(t, http.MethodPut, "/api/drafts/lesson:m01-01", map[string]any{"code": "package main // lesson"})

	_, payload = env.do(t, http.MethodGet, "/api/drafts", nil)
	body := decode(t, payload)
	if len(body["drafts"].([]any)) != 2 {
		t.Errorf("черновиков = %d", len(body["drafts"].([]any)))
	}
	if _, ok := body["runs"].([]any); !ok {
		t.Error("нет истории запусков")
	}

	resp, _ = env.do(t, http.MethodGet, "/api/drafts/lesson:m01-01", nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("черновик урока: статус = %d", resp.StatusCode)
	}

	// Недопустимые ключи отклоняются до обращения к базе.
	for _, key := range []string{"ключ", "a%20b", "bad*key"} {
		resp, _ = env.do(t, http.MethodGet, "/api/drafts/"+key, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("ключ %q: статус = %d, ожидался 400", key, resp.StatusCode)
		}
	}
	// Попытка выйти из каталога через %2F не попадает в маршрут вовсе.
	resp, _ = env.do(t, http.MethodGet, "/api/drafts/..%2Fetc%2Fpasswd", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("обход пути: статус = %d", resp.StatusCode)
	}

	resp, _ = env.do(t, http.MethodDelete, "/api/drafts/editor", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("удаление: статус = %d", resp.StatusCode)
	}
	resp, _ = env.do(t, http.MethodDelete, "/api/drafts/editor", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("повторное удаление: статус = %d", resp.StatusCode)
	}
}

func TestCheckCodeEndpoint(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodPost, "/api/editor/check", map[string]any{
		"code": "package main\n\nfunc main() {}\n",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	if body["status"] == "internal" {
		t.Skipf("Go SDK недоступен: %v", body["message"])
	}
	if body["status"] != "ok" || !strings.Contains(body["message"].(string), "компилируется") {
		t.Errorf("проверка = %v (%v)", body["status"], body["message"])
	}

	_, payload = env.do(t, http.MethodPost, "/api/editor/check", map[string]any{
		"code": "package main\n\nfunc main() { broken( }\n",
	})
	body = decode(t, payload)
	if body["status"] != "compile_error" {
		t.Errorf("статус = %v", body["status"])
	}
	if len(body["diagnostics"].([]any)) == 0 {
		t.Error("нет диагностик")
	}
}

func TestExercisesCatalog(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/exercises", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	exercises := body["exercises"].([]any)
	if len(exercises) != 30 {
		t.Fatalf("заданий = %d, ожидалось 30", len(exercises))
	}
	first := exercises[0].(map[string]any)
	if first["module_title"] == "" || first["checks_count"].(float64) == 0 {
		t.Errorf("карточка задания неполная: %v", first)
	}
	// Тесты и решение не должны утекать в список.
	raw := string(payload)
	if strings.Contains(raw, "func TestAdd") || strings.Contains(raw, "\"solution\"") {
		t.Error("в ответ попали скрытые тесты или решение")
	}
	stats := body["stats"].(map[string]any)
	levels := stats["by_level"].(map[string]any)
	if levels["easy"].(float64) == 0 || levels["medium"].(float64) == 0 || levels["hard"].(float64) == 0 {
		t.Errorf("уровни сложности = %v", levels)
	}
	if len(body["modules"].([]any)) < 8 {
		t.Errorf("модулей в фильтре = %d", len(body["modules"].([]any)))
	}

	// Фильтры.
	_, payload = env.do(t, http.MethodGet, "/api/exercises?difficulty=hard", nil)
	if got := len(decode(t, payload)["exercises"].([]any)); got != 6 {
		t.Errorf("сложных заданий = %d, ожидалось 6", got)
	}
	_, payload = env.do(t, http.MethodGet, "/api/exercises?module=m04", nil)
	filtered := decode(t, payload)["exercises"].([]any)
	if len(filtered) == 0 {
		t.Fatal("фильтр по модулю ничего не вернул")
	}
	for _, item := range filtered {
		if item.(map[string]any)["module"] != "m04" {
			t.Errorf("в фильтре m04 оказался %v", item.(map[string]any)["module"])
		}
	}
	_, payload = env.do(t, http.MethodGet, "/api/exercises?q=палиндром", nil)
	if got := len(decode(t, payload)["exercises"].([]any)); got != 1 {
		t.Errorf("поиск по слову «палиндром» вернул %d заданий", got)
	}
}

func TestExerciseDetailHidesTests(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/exercises/hello-greet", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	exercise := decode(t, payload)["exercise"].(map[string]any)
	if exercise["title"] != "Приветствие по имени" {
		t.Errorf("заголовок = %v", exercise["title"])
	}
	if !strings.Contains(exercise["statement"].(string), "Greet") {
		t.Error("нет условия задания")
	}
	if !strings.Contains(exercise["starter_code"].(string), "package main") {
		t.Error("нет стартового кода")
	}
	checks := exercise["checks"].([]any)
	if len(checks) != 3 {
		t.Errorf("проверок = %d, ожидалось 3", len(checks))
	}
	if _, exists := exercise["tests"]; exists {
		t.Error("тесты не должны попадать в ответ")
	}
	if _, exists := exercise["solution"]; exists {
		t.Error("решение не должно попадать в ответ")
	}
	if hints := exercise["hints"].([]any); len(hints) != 2 {
		t.Errorf("подсказок = %d", len(hints))
	}
	if exercise["next"] == nil {
		t.Error("нет ссылки на следующее задание")
	}

	resp, _ = env.do(t, http.MethodGet, "/api/exercises/unknown-task", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("неизвестное задание: статус = %d", resp.StatusCode)
	}
}

func TestExerciseSubmitGradesAndStoresProgress(t *testing.T) {
	env := newTestEnv(t)

	_, payload := env.do(t, http.MethodGet, "/api/editor/status", nil)
	if decode(t, payload)["runner"].(map[string]any)["available"] != true {
		t.Skip("Go SDK недоступен")
	}

	// Неверное решение: тесты запускаются, часть проверок падает.
	resp, payload := env.do(t, http.MethodPost, "/api/exercises/sum-two/submit", map[string]any{
		"code": "package main\n\nfunc Sum(a, b int) int { return a - b }\n",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("отправка: статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	result := body["result"].(map[string]any)
	if result["status"] != "test_failed" {
		t.Fatalf("статус проверки = %v (%v)", result["status"], result["message"])
	}
	if result["passed"].(float64) != 0 || result["total"].(float64) != 3 {
		t.Errorf("пройдено %v из %v", result["passed"], result["total"])
	}
	if body["solved"] != false {
		t.Error("неверное решение не должно считаться решённым")
	}
	progress := body["progress"].(map[string]any)
	if progress["attempts"].(float64) != 1 || progress["last_status"] != "test_failed" {
		t.Errorf("прогресс = %v", progress)
	}

	// Верное решение: все проверки проходят, задание отмечается решённым.
	resp, payload = env.do(t, http.MethodPost, "/api/exercises/sum-two/submit", map[string]any{
		"code": "package main\n\nfunc Sum(a, b int) int { return a + b }\n",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("отправка: статус = %d: %s", resp.StatusCode, payload)
	}
	body = decode(t, payload)
	result = body["result"].(map[string]any)
	if result["status"] != "ok" || body["solved"] != true {
		t.Fatalf("статус = %v, solved = %v", result["status"], body["solved"])
	}
	tests := result["tests"].([]any)
	if len(tests) != 3 {
		t.Fatalf("проверок в ответе = %d", len(tests))
	}
	first := tests[0].(map[string]any)
	if first["title"] == "" || first["passed"] != true {
		t.Errorf("проверка = %v", first)
	}

	// Прогресс виден в списке и в деталях задания.
	_, payload = env.do(t, http.MethodGet, "/api/exercises?status=solved", nil)
	solved := decode(t, payload)["exercises"].([]any)
	if len(solved) != 1 || solved[0].(map[string]any)["id"] != "sum-two" {
		t.Errorf("решённые задания = %v", solved)
	}
	// Решённая задача попадает в дневную активность и общую статистику.
	_, payload = env.do(t, http.MethodGet, "/api/progress", nil)
	today := decode(t, payload)["snapshot"].(map[string]any)["today"].(map[string]any)
	if today["exercises_done"].(float64) != 1 {
		t.Errorf("exercises_done за сегодня = %v, ожидалось 1", today["exercises_done"])
	}
	exercisesStat := decode(t, payload)["snapshot"].(map[string]any)["exercises"].(map[string]any)
	if exercisesStat["solved"].(float64) != 1 {
		t.Errorf("решённых задач в статистике = %v", exercisesStat["solved"])
	}

	_, payload = env.do(t, http.MethodGet, "/api/exercises/sum-two", nil)
	detail := decode(t, payload)["exercise"].(map[string]any)
	if detail["progress"].(map[string]any)["solved"] != true {
		t.Error("детали не показывают решение")
	}
	if len(detail["attempts"].([]any)) != 2 {
		t.Errorf("история попыток = %v", detail["attempts"])
	}
}

func TestExerciseSubmitCompileError(t *testing.T) {
	env := newTestEnv(t)

	_, payload := env.do(t, http.MethodGet, "/api/editor/status", nil)
	if decode(t, payload)["runner"].(map[string]any)["available"] != true {
		t.Skip("Go SDK недоступен")
	}

	resp, payload := env.do(t, http.MethodPost, "/api/exercises/sum-two/submit", map[string]any{
		"code": "package main\n\nfunc Sum(a, b int) int { return a + }\n",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	result := decode(t, payload)["result"].(map[string]any)
	if result["status"] != "compile_error" {
		t.Fatalf("статус = %v", result["status"])
	}
	diagnostics := result["diagnostics"].([]any)
	if len(diagnostics) == 0 {
		t.Fatal("нет диагностик")
	}
	if diagnostics[0].(map[string]any)["line"].(float64) != 3 {
		t.Errorf("строка = %v", diagnostics[0])
	}
}

func TestExerciseSolutionEndpoint(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodGet, "/api/exercises/sum-two/solution", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d", resp.StatusCode)
	}
	body := decode(t, payload)
	if !strings.Contains(body["solution"].(string), "a + b") {
		t.Errorf("решение = %q", body["solution"])
	}
	if body["note"] == "" {
		t.Error("нет пояснения к решению")
	}

	// Метод не поддерживается — 405, а не 404.
	resp, _ = env.do(t, http.MethodPost, "/api/exercises/sum-two/solution", nil)
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("статус = %d, ожидался 405", resp.StatusCode)
	}
}

func TestReloadContentReportsExercises(t *testing.T) {
	env := newTestEnv(t)

	resp, payload := env.do(t, http.MethodPost, "/api/content/reload", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("статус = %d: %s", resp.StatusCode, payload)
	}
	body := decode(t, payload)
	if body["exercises"].(float64) != 30 {
		t.Errorf("заданий после перезагрузки = %v", body["exercises"])
	}
}

func TestSearchFindsExercises(t *testing.T) {
	env := newTestEnv(t)

	_, payload := env.do(t, http.MethodGet, "/api/search?q=палиндром", nil)
	results := decode(t, payload)["results"].([]any)
	var found bool
	for _, item := range results {
		result := item.(map[string]any)
		if result["type"] == "exercise" && result["id"] == "palindrome" {
			found = true
			if result["route"] != "/practice/palindrome" {
				t.Errorf("маршрут задания = %v", result["route"])
			}
		}
	}
	if !found {
		t.Fatalf("задание не найдено среди результатов: %v", results)
	}
}
