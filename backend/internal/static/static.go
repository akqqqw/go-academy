// Package static раздаёт собранный фронтенд и поддерживает SPA-маршрутизацию.
package static

import (
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Handler отдаёт файлы из каталога сборки, а неизвестные пути — index.html.
type Handler struct {
	dir   string
	index string
}

// New создаёт обработчик статики.
func New(dir string) *Handler {
	return &Handler{dir: dir, index: filepath.Join(dir, "index.html")}
}

// Available сообщает, найдена ли сборка фронтенда.
func (h *Handler) Available() bool {
	info, err := os.Stat(h.index)
	return err == nil && !info.IsDir()
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !h.Available() {
		h.serveDevPage(w)
		return
	}

	clean := filepath.Clean("/" + r.URL.Path)
	if strings.Contains(clean, "..") {
		http.NotFound(w, r)
		return
	}
	candidate := filepath.Join(h.dir, filepath.FromSlash(clean))
	if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
		// Файлы в assets/ содержат хеш в имени — их можно кэшировать надолго.
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		http.ServeFile(w, r, candidate)
		return
	}

	// SPA fallback: любой маршрут отдаёт index.html.
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, h.index)
}

var devPage = template.Must(template.New("dev").Parse(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Go Academy — сервер запущен</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0b0d10; color: #e6e8ee;
         font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { width: min(620px, 92vw); padding: 32px; border: 1px solid #1f232b; border-radius: 16px;
         background: #111318; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: -.02em; }
  p { margin: 0 0 16px; color: #9aa3b5; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #1a1e26;
         padding: 2px 6px; border-radius: 6px; color: #7fd8f0; }
  ol { margin: 0 0 20px; padding-left: 20px; color: #cbd2e0; }
  li { margin: 6px 0; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  a { color: #00add8; text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }
  .badge { display: inline-block; font-size: 12px; color: #7ee2b8; border: 1px solid #1f4d3c;
           background: #10231c; border-radius: 999px; padding: 2px 10px; margin-bottom: 14px; }
</style>
</head>
<body>
<main>
  <div class="badge">backend работает</div>
  <h1>Go Academy</h1>
  <p>Сервер API запущен, но сборка фронтенда не найдена в <code>{{.Dir}}</code>.</p>
  <ol>
    <li>Соберите интерфейс: <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>.</li>
    <li>Или запустите dev-режим: <code>npm run dev</code> (Vite на порту 5173).</li>
    <li>Перезапустите сервер и обновите страницу.</li>
  </ol>
  <div class="row">
    <a href="/api/health">/api/health</a>
    <a href="/api/course">/api/course</a>
    <a href="/api/progress">/api/progress</a>
  </div>
</main>
</body>
</html>`))

func (h *Handler) serveDevPage(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = devPage.Execute(w, map[string]string{"Dir": h.dir})
}
