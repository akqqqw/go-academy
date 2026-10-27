package storage

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"goacademy/internal/database"
)

// Метрики достижений: значение считается из базы, а не хранится вручную.
const (
	MetricLessons    = "lessons_completed"
	MetricExercises  = "exercises_solved"
	MetricCards      = "cards_reviewed"
	MetricQuizzes    = "quizzes_passed"
	MetricPerfect    = "quiz_perfect"
	MetricStreak     = "streak_days"
	MetricStudyHours = "study_minutes"
	MetricNotes      = "notes_created"
	MetricRuns       = "code_runs"
	MetricReviews    = "card_reviews"
	MetricModules    = "modules_done"
	MetricActiveDays = "active_days"
)

// AchievementDefinition — описание достижения из общего каталога.
type AchievementDefinition struct {
	Code        string `json:"code"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Metric      string `json:"metric"`
	Target      int    `json:"target"`
	Unit        string `json:"unit"`
	Tier        string `json:"tier"`     // bronze | silver | gold
	Category    string `json:"category"` // lessons | practice | memory | study
	Icon        string `json:"icon"`
}

// Achievement — достижение с текущим прогрессом.
type Achievement struct {
	AchievementDefinition
	Current    int    `json:"current"`
	Percent    int    `json:"percent"`
	Unlocked   bool   `json:"unlocked"`
	UnlockedAt string `json:"unlocked_at,omitempty"`
	Remaining  int    `json:"remaining"`
}

// AchievementStats — сводка по достижениям.
type AchievementStats struct {
	Unlocked int `json:"unlocked"`
	Total    int `json:"total"`
	Bronze   int `json:"bronze"`
	Silver   int `json:"silver"`
	Gold     int `json:"gold"`
	Percent  int `json:"percent"`
	// New — сколько достижений открылось при последней проверке.
	New int `json:"new"`
}

// AchievementDefinitions — каталог достижений. Порядок задаёт отображение в интерфейсе.
var AchievementDefinitions = []AchievementDefinition{
	{
		Code: "first-step", Title: "Первый шаг", Description: "Завершите первый урок курса",
		Metric: MetricLessons, Target: 1, Unit: "урок", Tier: "bronze", Category: "lessons", Icon: "footprints",
	},
	{
		Code: "five-lessons", Title: "Разогрев", Description: "Завершите 5 уроков",
		Metric: MetricLessons, Target: 5, Unit: "уроков", Tier: "bronze", Category: "lessons", Icon: "book-open",
	},
	{
		Code: "fifteen-lessons", Title: "Половина старта", Description: "Завершите 15 уроков",
		Metric: MetricLessons, Target: 15, Unit: "уроков", Tier: "silver", Category: "lessons", Icon: "graduation-cap",
	},
	{
		Code: "module-master", Title: "Модуль закрыт", Description: "Пройдите все готовые уроки одного модуля",
		Metric: MetricModules, Target: 1, Unit: "модуль", Tier: "silver", Category: "lessons", Icon: "layers",
	},
	{
		Code: "first-exercise", Title: "Первая задача", Description: "Решите практическую задачу с проверкой тестами",
		Metric: MetricExercises, Target: 1, Unit: "задача", Tier: "bronze", Category: "practice", Icon: "check-circle",
	},
	{
		Code: "ten-exercises", Title: "Практик", Description: "Решите 10 задач",
		Metric: MetricExercises, Target: 10, Unit: "задач", Tier: "silver", Category: "practice", Icon: "list-checks",
	},
	{
		Code: "all-exercises", Title: "Все задачи решены", Description: "Решите все 30 задач курса",
		Metric: MetricExercises, Target: 30, Unit: "задач", Tier: "gold", Category: "practice", Icon: "trophy",
	},
	{
		Code: "first-run", Title: "Код запущен", Description: "Запустите Go-код в редакторе",
		Metric: MetricRuns, Target: 1, Unit: "запуск", Tier: "bronze", Category: "practice", Icon: "terminal",
	},
	{
		Code: "hundred-runs", Title: "Экспериментатор", Description: "Запустите код 100 раз",
		Metric: MetricRuns, Target: 100, Unit: "запусков", Tier: "silver", Category: "practice", Icon: "flask-conical",
	},
	{
		Code: "first-review", Title: "Память включилась", Description: "Повторите первую карточку",
		Metric: MetricReviews, Target: 1, Unit: "повторение", Tier: "bronze", Category: "memory", Icon: "repeat",
	},
	{
		Code: "hundred-reviews", Title: "Сто повторений", Description: "Сделайте 100 повторений карточек",
		Metric: MetricReviews, Target: 100, Unit: "повторений", Tier: "silver", Category: "memory", Icon: "brain",
	},
	{
		Code: "all-decks", Title: "Все колоды", Description: "Повторите хотя бы по одной карточке из каждой колоды",
		Metric: MetricCards, Target: 100, Unit: "карточек", Tier: "gold", Category: "memory", Icon: "layers-3",
	},
	{
		Code: "first-quiz", Title: "Тест пройден", Description: "Сдайте первую викторину",
		Metric: MetricQuizzes, Target: 1, Unit: "тест", Tier: "bronze", Category: "study", Icon: "clipboard-check",
	},
	{
		Code: "five-quizzes", Title: "Экзаменатор", Description: "Сдайте 5 викторин",
		Metric: MetricQuizzes, Target: 5, Unit: "тестов", Tier: "silver", Category: "study", Icon: "graduation-cap",
	},
	{
		Code: "perfect-quiz", Title: "Без ошибок", Description: "Сдайте викторину на 100%",
		Metric: MetricPerfect, Target: 1, Unit: "тест", Tier: "gold", Category: "study", Icon: "sparkles",
	},
	{
		Code: "streak-3", Title: "Три дня подряд", Description: "Занимайтесь 3 дня без перерыва",
		Metric: MetricStreak, Target: 3, Unit: "дня", Tier: "bronze", Category: "study", Icon: "flame",
	},
	{
		Code: "streak-7", Title: "Неделя привычки", Description: "Серия из 7 дней подряд",
		Metric: MetricStreak, Target: 7, Unit: "дней", Tier: "silver", Category: "study", Icon: "flame",
	},
	{
		Code: "streak-30", Title: "Месяц дисциплины", Description: "Серия из 30 дней подряд",
		Metric: MetricStreak, Target: 30, Unit: "дней", Tier: "gold", Category: "study", Icon: "calendar-check",
	},
	{
		Code: "hour-study", Title: "Первый час", Description: "Проведите за курсом 60 минут",
		Metric: MetricStudyHours, Target: 60, Unit: "минут", Tier: "bronze", Category: "study", Icon: "clock",
	},
	{
		Code: "ten-hours", Title: "Десять часов", Description: "Проведите за курсом 600 минут",
		Metric: MetricStudyHours, Target: 600, Unit: "минут", Tier: "silver", Category: "study", Icon: "clock",
	},
	{
		Code: "first-note", Title: "Свои заметки", Description: "Создайте первую заметку",
		Metric: MetricNotes, Target: 1, Unit: "заметка", Tier: "bronze", Category: "memory", Icon: "notebook",
	},
	{
		Code: "ten-notes", Title: "Конспект", Description: "Создайте 10 заметок",
		Metric: MetricNotes, Target: 10, Unit: "заметок", Tier: "silver", Category: "memory", Icon: "notebook-pen",
	},
	{
		Code: "active-30", Title: "Тридцать дней занятий", Description: "Занимайтесь в сумме 30 разных дней",
		Metric: MetricActiveDays, Target: 30, Unit: "дней", Tier: "gold", Category: "study", Icon: "calendar-days",
	},
}

// Achievements — сервис расчёта и сохранения достижений.
type Achievements struct {
	db       *database.DB
	activity *Activity
	notes    *Notes
}

// NewAchievements создаёт сервис достижений.
func NewAchievements(db *database.DB, activity *Activity, notes *Notes) *Achievements {
	return &Achievements{db: db, activity: activity, notes: notes}
}

// List считает прогресс по всем достижениям и сохраняет новые открытия.
// extras позволяет подставить метрики, которые считаются вне storage
// (например, число полностью пройденных модулей курса).
func (a *Achievements) List(ctx context.Context, extras map[string]int) ([]Achievement, AchievementStats, error) {
	metrics, err := a.metrics(ctx)
	if err != nil {
		return nil, AchievementStats{}, err
	}
	for metric, value := range extras {
		metrics[metric] = value
	}
	unlocked, err := a.unlocked(ctx)
	if err != nil {
		return nil, AchievementStats{}, err
	}

	stats := AchievementStats{Total: len(AchievementDefinitions)}
	list := make([]Achievement, 0, len(AchievementDefinitions))
	for _, definition := range AchievementDefinitions {
		current := metrics[definition.Metric]
		percent := 100
		if definition.Target > 0 {
			percent = int(math.Round(float64(current) / float64(definition.Target) * 100))
			if percent > 100 {
				percent = 100
			}
		}
		item := Achievement{
			AchievementDefinition: definition,
			Current:               current,
			Percent:               percent,
			Unlocked:              current >= definition.Target,
			Remaining:             maxInt(0, definition.Target-current),
		}
		if at, ok := unlocked[definition.Code]; ok {
			item.Unlocked = true
			item.UnlockedAt = at
		}
		if item.Unlocked {
			stats.Unlocked++
			switch definition.Tier {
			case "bronze":
				stats.Bronze++
			case "silver":
				stats.Silver++
			case "gold":
				stats.Gold++
			}
			if item.UnlockedAt == "" {
				// Достижение только что открылось — фиксируем время.
				at := database.Now()
				if err := a.unlock(ctx, definition.Code, at); err != nil {
					return nil, AchievementStats{}, err
				}
				item.UnlockedAt = at
				stats.New++
			}
		}
		list = append(list, item)
	}
	if stats.Total > 0 {
		stats.Percent = int(math.Round(float64(stats.Unlocked) / float64(stats.Total) * 100))
	}
	// Открытые — первыми, затем по прогрессу.
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].Unlocked != list[j].Unlocked {
			return list[i].Unlocked
		}
		return list[i].Percent > list[j].Percent
	})
	return list, stats, nil
}

// Recent возвращает последние открытые достижения для главной страницы.
func (a *Achievements) Recent(ctx context.Context, limit int) ([]Achievement, error) {
	if limit <= 0 || limit > 20 {
		limit = 4
	}
	rows, err := a.db.QueryContext(ctx,
		"SELECT code, unlocked_at FROM achievements ORDER BY unlocked_at DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byCode := make(map[string]string, len(AchievementDefinitions))
	for _, definition := range AchievementDefinitions {
		byCode[definition.Code] = ""
	}
	order := make([]string, 0, limit)
	for rows.Next() {
		var code, at string
		if err := rows.Scan(&code, &at); err != nil {
			return nil, err
		}
		if _, ok := byCode[code]; ok {
			order = append(order, code)
			byCode[code] = at
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]Achievement, 0, len(order))
	for _, code := range order {
		for _, definition := range AchievementDefinitions {
			if definition.Code != code {
				continue
			}
			out = append(out, Achievement{
				AchievementDefinition: definition,
				Current:               definition.Target,
				Percent:               100,
				Unlocked:              true,
				UnlockedAt:            byCode[code],
			})
			break
		}
	}
	return out, nil
}

func (a *Achievements) unlocked(ctx context.Context) (map[string]string, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT code, unlocked_at FROM achievements")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]string, len(AchievementDefinitions))
	for rows.Next() {
		var code, at string
		if err := rows.Scan(&code, &at); err != nil {
			return nil, err
		}
		out[code] = at
	}
	return out, rows.Err()
}

func (a *Achievements) unlock(ctx context.Context, code, at string) error {
	_, err := a.db.ExecContext(ctx,
		"INSERT OR IGNORE INTO achievements (code, unlocked_at) VALUES (?, ?)", code, at)
	if err != nil {
		return fmt.Errorf("сохранить достижение %q: %w", code, err)
	}
	return nil
}

// metrics собирает все значения одним проходом по базе.
func (a *Achievements) metrics(ctx context.Context) (map[string]int, error) {
	out := make(map[string]int, len(MetricActiveDays)+2)

	var lessons, exercises, cards, reviews, quizzesPassed, perfect, notes, runs int
	err := a.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM lessons WHERE status = 'completed'),
			(SELECT COUNT(DISTINCT exercise_id) FROM exercise_attempts
			 WHERE total > 0 AND passed = total),
			(SELECT COUNT(DISTINCT card_id) FROM card_reviews),
			(SELECT COUNT(*) FROM card_reviews),
			(SELECT COUNT(DISTINCT quiz_id) FROM quiz_attempts
			 WHERE total > 0 AND CAST(score AS REAL) / total >= 0.7),
			(SELECT COUNT(*) FROM quiz_attempts WHERE total > 0 AND score = total),
			(SELECT COUNT(*) FROM notes),
			(SELECT COUNT(*) FROM code_runs)`).Scan(
		&lessons, &exercises, &cards, &reviews, &quizzesPassed, &perfect, &notes, &runs)
	if err != nil {
		return nil, fmt.Errorf("считать метрики достижений: %w", err)
	}
	out[MetricLessons] = lessons
	out[MetricExercises] = exercises
	out[MetricCards] = cards
	out[MetricReviews] = reviews
	out[MetricQuizzes] = quizzesPassed
	out[MetricPerfect] = perfect
	out[MetricNotes] = notes
	out[MetricRuns] = runs

	// Серия дней — из активности; длительность обучения — суммарно в минутах.
	days, err := a.activity.ActiveDays(ctx)
	if err != nil {
		return nil, err
	}
	current, longest, _ := CalcStreak(days, time.Now())
	if current > longest {
		out[MetricStreak] = current
	} else {
		out[MetricStreak] = longest
	}
	out[MetricActiveDays] = len(days)

	seconds, err := a.activity.TotalStudySeconds(ctx)
	if err != nil {
		return nil, err
	}
	out[MetricStudyHours] = seconds / 60
	return out, nil
}
