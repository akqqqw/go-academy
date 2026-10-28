package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"goacademy/internal/database"
)

// Day — агрегированная активность за один календарный день.
type Day struct {
	Date          string `json:"date"`
	StudySeconds  int    `json:"study_seconds"`
	LessonsOpened int    `json:"lessons_opened"`
	LessonsDone   int    `json:"lessons_done"`
	ExercisesDone int    `json:"exercises_done"`
	CardsReviewed int    `json:"cards_reviewed"`
	QuizzesDone   int    `json:"quizzes_done"`
}

// Active сообщает, была ли в этот день хоть какая-то учебная активность.
func (d Day) Active() bool {
	return d.StudySeconds > 0 || d.LessonsOpened > 0 || d.LessonsDone > 0 ||
		d.ExercisesDone > 0 || d.CardsReviewed > 0 || d.QuizzesDone > 0
}

// Activity — сервис учёта учебной активности по дням.
type Activity struct{ db *database.DB }

// NewActivity создаёт сервис активности.
func NewActivity(db *database.DB) *Activity { return &Activity{db: db} }

// counterColumns — белый список полей-счётчиков. Передавать произвольный SQL из
// HTTP-слоя нельзя, поэтому допустимые колонки перечислены явно.
var counterColumns = map[string]string{
	"lessons_opened": "lessons_opened",
	"lessons_done":   "lessons_done",
	"exercises_done": "exercises_done",
	"cards_reviewed": "cards_reviewed",
	"quizzes_done":   "quizzes_done",
}

// MaxStudySecondsPerPing — верхняя граница учёта времени за один запрос.
const MaxStudySecondsPerPing = 900

// AddStudy добавляет учебные секунды к сегодняшнему дню.
func (a *Activity) AddStudy(ctx context.Context, seconds int) (Day, error) {
	if seconds < 0 {
		seconds = 0
	}
	if seconds > MaxStudySecondsPerPing {
		seconds = MaxStudySecondsPerPing
	}
	return a.increment(ctx, "study_seconds", seconds)
}

// AddCounter увеличивает счётчик сегодняшнего дня.
func (a *Activity) AddCounter(ctx context.Context, field string, delta int) (Day, error) {
	column, ok := counterColumns[field]
	if !ok {
		return Day{}, fmt.Errorf("неизвестный счётчик активности: %q", field)
	}
	if delta < 0 {
		delta = 0
	}
	if delta > 1000 {
		delta = 1000
	}
	return a.increment(ctx, column, delta)
}

func (a *Activity) increment(ctx context.Context, column string, delta int) (Day, error) {
	day := database.Today()
	now := database.Now()
	// column берётся из белого списка, поэтому подстановка безопасна.
	stmt := fmt.Sprintf(`
		INSERT INTO activity_days (day, %[1]s, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(day) DO UPDATE SET %[1]s = %[1]s + excluded.%[1]s, updated_at = excluded.updated_at`,
		column)
	if _, err := a.db.ExecContext(ctx, stmt, day, delta, now); err != nil {
		return Day{}, fmt.Errorf("обновить активность: %w", err)
	}
	return a.get(ctx, day)
}

// Today возвращает сегодняшнюю активность (нули, если активности не было).
func (a *Activity) Today(ctx context.Context) (Day, error) {
	return a.get(ctx, database.Today())
}

func (a *Activity) get(ctx context.Context, day string) (Day, error) {
	row := a.db.QueryRowContext(ctx, `
		SELECT day, study_seconds, lessons_opened, lessons_done, exercises_done, cards_reviewed, quizzes_done
		FROM activity_days WHERE day = ?`, day)

	var d Day
	err := row.Scan(&d.Date, &d.StudySeconds, &d.LessonsOpened, &d.LessonsDone,
		&d.ExercisesDone, &d.CardsReviewed, &d.QuizzesDone)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Day{Date: day}, nil
		}
		return Day{}, err
	}
	return d, nil
}

// Range возвращает активность за последние days дней (включая сегодня),
// включая пустые дни — это нужно для календаря.
func (a *Activity) Range(ctx context.Context, days int) ([]Day, error) {
	if days < 1 {
		days = 1
	}
	if days > 366 {
		days = 366
	}
	today := time.Now()
	start := today.AddDate(0, 0, -(days - 1))
	startDay := start.Format("2006-01-02")

	rows, err := a.db.QueryContext(ctx, `
		SELECT day, study_seconds, lessons_opened, lessons_done, exercises_done, cards_reviewed, quizzes_done
		FROM activity_days WHERE day >= ? ORDER BY day`, startDay)
	if err != nil {
		return nil, fmt.Errorf("прочитать активность: %w", err)
	}
	defer rows.Close()

	stored := map[string]Day{}
	for rows.Next() {
		var d Day
		if err := rows.Scan(&d.Date, &d.StudySeconds, &d.LessonsOpened, &d.LessonsDone,
			&d.ExercisesDone, &d.CardsReviewed, &d.QuizzesDone); err != nil {
			return nil, err
		}
		stored[d.Date] = d
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]Day, 0, days)
	for i := 0; i < days; i++ {
		date := start.AddDate(0, 0, i).Format("2006-01-02")
		if d, ok := stored[date]; ok {
			out = append(out, d)
		} else {
			out = append(out, Day{Date: date})
		}
	}
	return out, nil
}

// TotalStudySeconds возвращает суммарное время обучения.
func (a *Activity) TotalStudySeconds(ctx context.Context) (int, error) {
	var total int
	err := a.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(study_seconds), 0) FROM activity_days").Scan(&total)
	return total, err
}

// ActiveDays возвращает список дат (по убыванию), в которые была активность.
func (a *Activity) ActiveDays(ctx context.Context) ([]time.Time, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT day FROM activity_days
		WHERE study_seconds > 0 OR lessons_opened > 0 OR lessons_done > 0
		   OR exercises_done > 0 OR cards_reviewed > 0 OR quizzes_done > 0
		ORDER BY day DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var days []time.Time
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		parsed, err := time.ParseInLocation("2006-01-02", raw, time.Local)
		if err != nil {
			continue
		}
		days = append(days, parsed)
	}
	return days, rows.Err()
}
