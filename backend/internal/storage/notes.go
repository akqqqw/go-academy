package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode"

	"goacademy/internal/database"
)

// Ошибки заметок.
var (
	// ErrNoteNotFound — заметки с таким идентификатором нет.
	ErrNoteNotFound = errors.New("заметка не найдена")
	// ErrNoteInvalid — заметка не прошла валидацию.
	ErrNoteInvalid = errors.New("заметка заполнена неверно")
	// ErrFolderNotFound — папки нет.
	ErrFolderNotFound = errors.New("папка не найдена")
	// ErrFolderExists — папка с таким названием уже есть.
	ErrFolderExists = errors.New("папка уже существует")
)

// Ограничения заметок.
const (
	MaxNoteBody     = 200 << 10 // 200 КиБ Markdown-текста
	MaxNoteTitle    = 160
	MaxNoteTags     = 12
	MaxTagLength    = 32
	DefaultFolder   = "Общее"
	LessonsFolder   = "Уроки"
	defaultNoteList = 100
	maxNoteList     = 500
)

// Note — заметка пользователя.
type Note struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	Folder    string   `json:"folder"`
	LessonID  string   `json:"lesson_id,omitempty"`
	Pinned    bool     `json:"pinned"`
	Tags      []string `json:"tags"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
	// Words и Excerpt считаются при чтении: интерфейсу нужен реальный размер
	// записи, а не длина в байтах.
	Words   int    `json:"words"`
	Excerpt string `json:"excerpt"`
}

// NoteInput — данные для создания или обновления заметки.
type NoteInput struct {
	Title    string
	Body     string
	Folder   string
	LessonID string
	Pinned   bool
	Tags     []string
}

// NoteFilter — условия выборки заметок.
type NoteFilter struct {
	Query    string
	Folder   string
	Tag      string
	LessonID string
	Pinned   bool
	Limit    int
}

// Folder — папка заметок.
type Folder struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
	Count    int    `json:"count"`
}

// TagCount — тег и количество заметок с ним.
type TagCount struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

// NotesStats — сводка по заметкам для заголовка страницы.
type NotesStats struct {
	Total      int `json:"total"`
	Words      int `json:"words"`
	Tags       int `json:"tags"`
	Folders    int `json:"folders"`
	Linked     int `json:"linked"`
	Pinned     int `json:"pinned"`
	ThisWeek   int `json:"this_week"`
	WithLesson int `json:"with_lesson"`
}

// Notes хранит заметки и папки в SQLite.
type Notes struct{ db *database.DB }

// NewNotes создаёт сервис заметок.
func NewNotes(db *database.DB) *Notes { return &Notes{db: db} }

// List возвращает заметки по фильтру: сначала закреплённые, затем свежие.
func (n *Notes) List(ctx context.Context, filter NoteFilter) ([]Note, error) {
	limit := filter.Limit
	if limit <= 0 || limit > maxNoteList {
		limit = defaultNoteList
	}

	conditions := []string{"1 = 1"}
	args := []any{}
	if query := strings.TrimSpace(filter.Query); query != "" {
		// Ищем по нормализованной колонке: SQLite не умеет нижний регистр для
		// кириллицы, а search_text уже приведён в Go.
		conditions = append(conditions, "search_text LIKE ?")
		args = append(args, "%"+strings.ToLower(query)+"%")
	}
	if folder := strings.TrimSpace(filter.Folder); folder != "" {
		conditions = append(conditions, "folder = ?")
		args = append(args, folder)
	}
	if tag := strings.TrimSpace(filter.Tag); tag != "" {
		conditions = append(conditions, "EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = notes.id AND t.tag = ?)")
		args = append(args, tag)
	}
	if lesson := strings.TrimSpace(filter.LessonID); lesson != "" {
		conditions = append(conditions, "lesson_id = ?")
		args = append(args, lesson)
	}
	if filter.Pinned {
		conditions = append(conditions, "pinned = 1")
	}
	args = append(args, limit)

	rows, err := n.db.QueryContext(ctx, `
		SELECT id, title, body, folder, COALESCE(lesson_id, ''), pinned, created_at, updated_at
		FROM notes
		WHERE `+strings.Join(conditions, " AND ")+`
		ORDER BY pinned DESC, updated_at DESC
		LIMIT ?`, args...)
	if err != nil {
		return nil, fmt.Errorf("прочитать заметки: %w", err)
	}
	defer rows.Close()

	notes := make([]Note, 0, 16)
	ids := make([]string, 0, 16)
	for rows.Next() {
		note, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		notes = append(notes, note)
		ids = append(ids, note.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	tags, err := n.tagsByNote(ctx, ids)
	if err != nil {
		return nil, err
	}
	for index := range notes {
		notes[index].Tags = tags[notes[index].ID]
		if notes[index].Tags == nil {
			notes[index].Tags = []string{}
		}
	}
	return notes, nil
}

// Get читает одну заметку вместе с тегами.
func (n *Notes) Get(ctx context.Context, id string) (Note, error) {
	row := n.db.QueryRowContext(ctx, `
		SELECT id, title, body, folder, COALESCE(lesson_id, ''), pinned, created_at, updated_at
		FROM notes WHERE id = ?`, id)
	note, err := scanNote(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Note{}, ErrNoteNotFound
		}
		return Note{}, err
	}
	tags, err := n.tagsByNote(ctx, []string{note.ID})
	if err != nil {
		return Note{}, err
	}
	note.Tags = tags[note.ID]
	if note.Tags == nil {
		note.Tags = []string{}
	}
	return note, nil
}

// Create создаёт заметку и возвращает её.
func (n *Notes) Create(ctx context.Context, input NoteInput) (Note, error) {
	clean, err := normalizeNoteInput(input)
	if err != nil {
		return Note{}, err
	}
	if err := n.ensureFolder(ctx, clean.Folder); err != nil {
		return Note{}, err
	}

	id, err := newNoteID()
	if err != nil {
		return Note{}, err
	}
	now := database.Now()
	_, err = n.db.ExecContext(ctx, `
		INSERT INTO notes (id, title, body, folder, lesson_id, pinned, created_at, updated_at, search_text)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, clean.Title, clean.Body, clean.Folder, nullable(clean.LessonID), boolToInt(clean.Pinned), now, now,
		searchText(clean.Title, clean.Body))
	if err != nil {
		return Note{}, fmt.Errorf("создать заметку: %w", err)
	}
	if err := n.replaceTags(ctx, id, clean.Tags); err != nil {
		return Note{}, err
	}
	return n.Get(ctx, id)
}

// Update перезаписывает заметку.
func (n *Notes) Update(ctx context.Context, id string, input NoteInput) (Note, error) {
	clean, err := normalizeNoteInput(input)
	if err != nil {
		return Note{}, err
	}
	if err := n.ensureFolder(ctx, clean.Folder); err != nil {
		return Note{}, err
	}
	result, err := n.db.ExecContext(ctx, `
		UPDATE notes SET title = ?, body = ?, folder = ?, lesson_id = ?, pinned = ?, updated_at = ?, search_text = ?
		WHERE id = ?`,
		clean.Title, clean.Body, clean.Folder, nullable(clean.LessonID), boolToInt(clean.Pinned),
		database.Now(), searchText(clean.Title, clean.Body), id)
	if err != nil {
		return Note{}, fmt.Errorf("обновить заметку: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Note{}, err
	}
	if affected == 0 {
		return Note{}, ErrNoteNotFound
	}
	if err := n.replaceTags(ctx, id, clean.Tags); err != nil {
		return Note{}, err
	}
	return n.Get(ctx, id)
}

// Delete удаляет заметку вместе с тегами.
func (n *Notes) Delete(ctx context.Context, id string) error {
	if _, err := n.db.ExecContext(ctx, "DELETE FROM note_tags WHERE note_id = ?", id); err != nil {
		return fmt.Errorf("удалить теги заметки: %w", err)
	}
	result, err := n.db.ExecContext(ctx, "DELETE FROM notes WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("удалить заметку: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNoteNotFound
	}
	return nil
}

// Folders возвращает папки с количеством заметок в каждой.
func (n *Notes) Folders(ctx context.Context) ([]Folder, error) {
	rows, err := n.db.QueryContext(ctx, `
		SELECT f.id, f.name, f.position, (SELECT COUNT(*) FROM notes WHERE notes.folder = f.name)
		FROM note_folders f ORDER BY f.position, f.name`)
	if err != nil {
		return nil, fmt.Errorf("прочитать папки: %w", err)
	}
	defer rows.Close()

	folders := make([]Folder, 0, 8)
	for rows.Next() {
		var folder Folder
		if err := rows.Scan(&folder.ID, &folder.Name, &folder.Position, &folder.Count); err != nil {
			return nil, err
		}
		folders = append(folders, folder)
	}
	return folders, rows.Err()
}

// Tags возвращает теги с количеством заметок.
func (n *Notes) Tags(ctx context.Context) ([]TagCount, error) {
	rows, err := n.db.QueryContext(ctx, `
		SELECT tag, COUNT(*) FROM note_tags GROUP BY tag ORDER BY COUNT(*) DESC, tag`)
	if err != nil {
		return nil, fmt.Errorf("прочитать теги: %w", err)
	}
	defer rows.Close()

	tags := make([]TagCount, 0, 16)
	for rows.Next() {
		var tag TagCount
		if err := rows.Scan(&tag.Tag, &tag.Count); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

// Stats собирает сводку по заметкам.
func (n *Notes) Stats(ctx context.Context) (NotesStats, error) {
	var stats NotesStats
	err := n.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM notes),
			(SELECT COUNT(*) FROM notes WHERE pinned = 1),
			(SELECT COUNT(*) FROM notes WHERE lesson_id IS NOT NULL AND lesson_id <> ''),
			(SELECT COUNT(DISTINCT tag) FROM note_tags),
			(SELECT COUNT(*) FROM note_folders)`).Scan(
		&stats.Total, &stats.Pinned, &stats.Linked, &stats.Tags, &stats.Folders)
	if err != nil {
		return NotesStats{}, fmt.Errorf("считать статистику заметок: %w", err)
	}
	stats.WithLesson = stats.Linked
	// «На этой неделе» — заметки, изменённые за последние семь дней. В базе
	// updated_at лежит в RFC3339 UTC, поэтому сравнение строк корректно.
	cutoff := time.Now().UTC().AddDate(0, 0, -7).Format(time.RFC3339)
	if err := n.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM notes WHERE updated_at >= ?", cutoff,
	).Scan(&stats.ThisWeek); err != nil {
		return NotesStats{}, fmt.Errorf("считать заметки за неделю: %w", err)
	}
	// Слова считаем в Go: SQLite не умеет аккуратно разбивать текст на слова.
	rows, err := n.db.QueryContext(ctx, "SELECT body FROM notes")
	if err != nil {
		return NotesStats{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var body string
		if err := rows.Scan(&body); err != nil {
			return NotesStats{}, err
		}
		stats.Words += len(strings.Fields(body))
	}
	return stats, rows.Err()
}

// CreateFolder добавляет папку.
func (n *Notes) CreateFolder(ctx context.Context, name string) (Folder, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Folder{}, fmt.Errorf("%w: название папки пустое", ErrNoteInvalid)
	}
	if len([]rune(name)) > 60 {
		return Folder{}, fmt.Errorf("%w: название папки длиннее 60 символов", ErrNoteInvalid)
	}
	var position int
	if err := n.db.QueryRowContext(ctx, "SELECT COALESCE(MAX(position), 0) + 1 FROM note_folders").Scan(&position); err != nil {
		return Folder{}, err
	}
	id, err := newNoteID()
	if err != nil {
		return Folder{}, err
	}
	_, err = n.db.ExecContext(ctx, `
		INSERT INTO note_folders (id, name, position, created_at) VALUES (?, ?, ?, ?)`,
		id, name, position, database.Now())
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return Folder{}, ErrFolderExists
		}
		return Folder{}, fmt.Errorf("создать папку: %w", err)
	}
	return Folder{ID: id, Name: name, Position: position}, nil
}

// RenameFolder переименовывает папку и переносит в неё все заметки.
func (n *Notes) RenameFolder(ctx context.Context, id, name string) (Folder, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Folder{}, fmt.Errorf("%w: название папки пустое", ErrNoteInvalid)
	}
	if len([]rune(name)) > 60 {
		return Folder{}, fmt.Errorf("%w: название папки длиннее 60 символов", ErrNoteInvalid)
	}

	var old string
	if err := n.db.QueryRowContext(ctx, "SELECT name FROM note_folders WHERE id = ?", id).Scan(&old); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Folder{}, ErrFolderNotFound
		}
		return Folder{}, err
	}
	if old == name {
		return Folder{ID: id, Name: name}, nil
	}

	tx, err := n.db.BeginTx(ctx, nil)
	if err != nil {
		return Folder{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, "UPDATE note_folders SET name = ? WHERE id = ?", name, id); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return Folder{}, ErrFolderExists
		}
		return Folder{}, fmt.Errorf("переименовать папку: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "UPDATE notes SET folder = ? WHERE folder = ?", name, old); err != nil {
		return Folder{}, fmt.Errorf("перенести заметки: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Folder{}, err
	}
	return Folder{ID: id, Name: name}, nil
}

// DeleteFolder удаляет папку, перенося её заметки в «Общее».
func (n *Notes) DeleteFolder(ctx context.Context, id string) error {
	var name string
	if err := n.db.QueryRowContext(ctx, "SELECT name FROM note_folders WHERE id = ?", id).Scan(&name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrFolderNotFound
		}
		return err
	}
	if name == DefaultFolder {
		return fmt.Errorf("%w: папку «%s» удалить нельзя", ErrNoteInvalid, DefaultFolder)
	}

	tx, err := n.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, "UPDATE notes SET folder = ? WHERE folder = ?", DefaultFolder, name); err != nil {
		return fmt.Errorf("перенести заметки: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM note_folders WHERE id = ?", id); err != nil {
		return fmt.Errorf("удалить папку: %w", err)
	}
	return tx.Commit()
}

// ensureFolder создаёт папку, если заметка ссылается на новую.
func (n *Notes) ensureFolder(ctx context.Context, name string) error {
	if name == "" {
		return nil
	}
	var exists int
	if err := n.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM note_folders WHERE name = ?", name).Scan(&exists); err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	_, err := n.CreateFolder(ctx, name)
	if errors.Is(err, ErrFolderExists) {
		return nil
	}
	return err
}

// replaceTags перезаписывает теги заметки.
func (n *Notes) replaceTags(ctx context.Context, noteID string, tags []string) error {
	tx, err := n.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, "DELETE FROM note_tags WHERE note_id = ?", noteID); err != nil {
		return fmt.Errorf("очистить теги: %w", err)
	}
	for _, tag := range tags {
		if _, err := tx.ExecContext(ctx, "INSERT INTO note_tags (note_id, tag) VALUES (?, ?)", noteID, tag); err != nil {
			return fmt.Errorf("сохранить тег: %w", err)
		}
	}
	return tx.Commit()
}

// tagsByNote читает теги для набора заметок одним запросом.
func (n *Notes) tagsByNote(ctx context.Context, ids []string) (map[string][]string, error) {
	out := make(map[string][]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for index, id := range ids {
		placeholders[index] = "?"
		args[index] = id
	}
	rows, err := n.db.QueryContext(ctx, `
		SELECT note_id, tag FROM note_tags
		WHERE note_id IN (`+strings.Join(placeholders, ", ")+`)
		ORDER BY tag`, args...)
	if err != nil {
		return nil, fmt.Errorf("прочитать теги заметок: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var noteID, tag string
		if err := rows.Scan(&noteID, &tag); err != nil {
			return nil, err
		}
		out[noteID] = append(out[noteID], tag)
	}
	return out, rows.Err()
}

// rowScanner объединяет *sql.Row и *sql.Rows: у обоих есть Scan.
type rowScanner interface{ Scan(dest ...any) error }

// scanNote читает строку заметки и считает производные поля.
func scanNote(row rowScanner) (Note, error) {
	var note Note
	var pinned int
	if err := row.Scan(&note.ID, &note.Title, &note.Body, &note.Folder, &note.LessonID,
		&pinned, &note.CreatedAt, &note.UpdatedAt); err != nil {
		return Note{}, err
	}
	note.Pinned = pinned == 1
	note.Words = len(strings.Fields(note.Body))
	note.Excerpt = excerpt(note.Body, 180)
	return note, nil
}

// normalizeNoteInput проверяет и приводит к единому виду данные заметки.
func normalizeNoteInput(input NoteInput) (NoteInput, error) {
	body := strings.ReplaceAll(input.Body, "\r\n", "\n")
	if len(body) > MaxNoteBody {
		return NoteInput{}, fmt.Errorf("%w: текст больше %d КиБ", ErrNoteInvalid, MaxNoteBody>>10)
	}
	if strings.TrimSpace(body) == "" && strings.TrimSpace(input.Title) == "" {
		return NoteInput{}, fmt.Errorf("%w: заметка пустая", ErrNoteInvalid)
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		// Заголовок берём из первой непустой строки: так заметка из выделенного
		// фрагмента сразу получает осмысленное название.
		title = firstMeaningfulLine(body)
	}
	if len([]rune(title)) > MaxNoteTitle {
		title = string([]rune(title)[:MaxNoteTitle])
	}

	folder := strings.TrimSpace(input.Folder)
	if folder == "" {
		folder = DefaultFolder
	}
	if len([]rune(folder)) > 60 {
		return NoteInput{}, fmt.Errorf("%w: название папки длиннее 60 символов", ErrNoteInvalid)
	}

	tags := normalizeTags(input.Tags)
	return NoteInput{
		Title:    title,
		Body:     body,
		Folder:   folder,
		LessonID: strings.TrimSpace(input.LessonID),
		Pinned:   input.Pinned,
		Tags:     tags,
	}, nil
}

// normalizeTags приводит теги к нижнему регистру, убирает повторы и мусор.
func normalizeTags(tags []string) []string {
	seen := make(map[string]bool, len(tags))
	out := make([]string, 0, len(tags))
	for _, raw := range tags {
		tag := strings.ToLower(strings.TrimSpace(raw))
		tag = strings.TrimPrefix(tag, "#")
		if tag == "" || seen[tag] {
			continue
		}
		if len([]rune(tag)) > MaxTagLength {
			tag = string([]rune(tag)[:MaxTagLength])
		}
		valid := true
		for _, char := range tag {
			if !unicode.IsLetter(char) && !unicode.IsDigit(char) && char != '-' && char != '_' && char != '.' {
				valid = false
				break
			}
		}
		if !valid {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
		if len(out) >= MaxNoteTags {
			break
		}
	}
	sort.Strings(out)
	return out
}

// firstMeaningfulLine берёт первую строку без Markdown-разметки.
func firstMeaningfulLine(body string) string {
	for _, line := range strings.Split(body, "\n") {
		clean := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#>-*+ "))
		if clean == "" {
			continue
		}
		runes := []rune(clean)
		if len(runes) > 80 {
			return strings.TrimSpace(string(runes[:80])) + "…"
		}
		return clean
	}
	return "Без названия"
}

// excerpt превращает Markdown в короткий текст для списка.
func excerpt(body string, limit int) string {
	var builder strings.Builder
	var clean []string
	for _, line := range strings.Split(body, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "```") {
			continue
		}
		trimmed = strings.TrimLeft(trimmed, "#>-*+ ")
		trimmed = strings.ReplaceAll(trimmed, "`", "")
		trimmed = strings.ReplaceAll(trimmed, "**", "")
		trimmed = strings.ReplaceAll(trimmed, "|", " ")
		clean = append(clean, trimmed)
	}
	for _, part := range clean {
		if builder.Len() > 0 {
			builder.WriteString(" ")
		}
		builder.WriteString(part)
		if builder.Len() >= limit*2 {
			break
		}
	}
	text := []rune(strings.TrimSpace(builder.String()))
	if len(text) > limit {
		return strings.TrimSpace(string(text[:limit])) + "…"
	}
	return string(text)
}

// searchText нормализует текст заметки для поиска без учёта регистра.
func searchText(title, body string) string {
	return strings.ToLower(title) + "\n" + strings.ToLower(body)
}

// newNoteID генерирует короткий случайный идентификатор.
func newNoteID() (string, error) {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("сгенерировать идентификатор: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}

// nullable превращает пустую строку в NULL: так проще искать заметки без урока.
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
