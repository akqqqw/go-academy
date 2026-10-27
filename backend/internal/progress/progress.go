// Package progress считает статистику обучения, серию дней и дневной план.
// Все значения выводятся из данных в SQLite — никаких выдуманных цифр.
package progress

import (
	"context"
	"time"

	"goacademy/internal/database"
	"goacademy/internal/storage"
)

// Totals — сколько сущностей есть в учебном контенте.
type Totals struct {
	Lessons    int `json:"lessons"`
	Exercises  int `json:"exercises"`
	Flashcards int `json:"flashcards"`
	Quizzes    int `json:"quizzes"`
}

// LessonsStat — прогресс по урокам.
type LessonsStat struct {
	Completed  int `json:"completed"`
	InProgress int `json:"in_progress"`
	Total      int `json:"total"`
	Percent    int `json:"percent"`
}

// ExercisesStat — прогресс по практическим задачам.
type ExercisesStat struct {
	Solved  int `json:"solved"`
	Total   int `json:"total"`
	Percent int `json:"percent"`
}

// CardsStat — прогресс по карточкам.
type CardsStat struct {
	Reviewed int `json:"reviewed"`
	Due      int `json:"due"`
	Total    int `json:"total"`
	Percent  int `json:"percent"`
}

// QuizStat — статистика тестов.
type QuizStat struct {
	Passed         int `json:"passed"`
	Total          int `json:"total"`
	AnswersCorrect int `json:"answers_correct"`
	AnswersTotal   int `json:"answers_total"`
	Accuracy       int `json:"accuracy"`
}

// StudyStat — время обучения.
type StudyStat struct {
	TotalSeconds int `json:"total_seconds"`
	TodaySeconds int `json:"today_seconds"`
	TotalMinutes int `json:"total_minutes"`
	TodayMinutes int `json:"today_minutes"`
}

// Streak — серия дней подряд.
type Streak struct {
	Current     int  `json:"current"`
	Longest     int  `json:"longest"`
	TodayActive bool `json:"today_active"`
}

// PlanItem — пункт плана на сегодня.
type PlanItem struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Current int    `json:"current"`
	Target  int    `json:"target"`
	Unit    string `json:"unit"`
	Done    bool   `json:"done"`
	Route   string `json:"route"`
}

// Snapshot — полный срез прогресса для главной страницы и раздела «Прогресс».
type Snapshot struct {
	Lessons    LessonsStat   `json:"lessons"`
	Exercises  ExercisesStat `json:"exercises"`
	Cards      CardsStat     `json:"cards"`
	Quizzes    QuizStat      `json:"quizzes"`
	Study      StudyStat     `json:"study"`
	Streak     Streak        `json:"streak"`
	Today      storage.Day   `json:"today"`
	Plan       []PlanItem    `json:"plan"`
	Goals      Goals         `json:"goals"`
	CourseDone int           `json:"course_percent"`
}

// Goals — дневные цели из настроек.
type Goals struct {
	Minutes   int `json:"minutes"`
	Exercises int `json:"exercises"`
	Cards     int `json:"cards"`
}

// Service — расчёт прогресса.
type Service struct {
	db       *database.DB
	activity *storage.Activity
	settings *storage.Settings
}

// New создаёт сервис прогресса.
func New(db *database.DB, activity *storage.Activity, settings *storage.Settings) *Service {
	return &Service{db: db, activity: activity, settings: settings}
}

// Snapshot собирает статистику из базы данных.
func (s *Service) Snapshot(ctx context.Context, totals Totals) (Snapshot, error) {
	counts, err := s.db.QueryContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM lessons WHERE status = 'completed'),
			(SELECT COUNT(*) FROM lessons WHERE status = 'in_progress'),
			(SELECT COUNT(DISTINCT exercise_id) FROM exercise_attempts
			 WHERE total > 0 AND passed = total),
			(SELECT COUNT(DISTINCT card_id) FROM card_reviews),
			(SELECT COUNT(*) FROM flashcards WHERE due_at IS NOT NULL AND due_at <= ?),
			(SELECT COUNT(*) FROM quiz_attempts WHERE total > 0),
			(SELECT COALESCE(SUM(score), 0) FROM quiz_attempts),
			(SELECT COALESCE(SUM(total), 0) FROM quiz_attempts)`,
		database.Now())
	if err != nil {
		return Snapshot{}, err
	}
	var completed, inProgress, solved, cardsReviewed, cardsDue, quizzesPassed, correct, answers int
	if counts.Next() {
		if err := counts.Scan(&completed, &inProgress, &solved, &cardsReviewed, &cardsDue,
			&quizzesPassed, &correct, &answers); err != nil {
			counts.Close()
			return Snapshot{}, err
		}
	}
	counts.Close()
	if err := counts.Err(); err != nil {
		return Snapshot{}, err
	}

	totalSeconds, err := s.activity.TotalStudySeconds(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	today, err := s.activity.Today(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	activeDays, err := s.activity.ActiveDays(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	current, longest, todayActive := CalcStreak(activeDays, time.Now())

	settings, err := s.settings.All(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	goals := Goals{
		Minutes:   intValue(settings["daily_goal_minutes"], 15),
		Exercises: intValue(settings["daily_goal_exercises"], 3),
		Cards:     intValue(settings["daily_goal_cards"], 10),
	}

	snap := Snapshot{
		Lessons: LessonsStat{
			Completed:  completed,
			InProgress: inProgress,
			Total:      totals.Lessons,
			Percent:    percent(completed, totals.Lessons),
		},
		Exercises: ExercisesStat{
			Solved:  solved,
			Total:   totals.Exercises,
			Percent: percent(solved, totals.Exercises),
		},
		Cards: CardsStat{
			Reviewed: cardsReviewed,
			Due:      cardsDue,
			Total:    totals.Flashcards,
			Percent:  percent(cardsReviewed, totals.Flashcards),
		},
		Quizzes: QuizStat{
			Passed:         quizzesPassed,
			Total:          totals.Quizzes,
			AnswersCorrect: correct,
			AnswersTotal:   answers,
			Accuracy:       percent(correct, answers),
		},
		Study: StudyStat{
			TotalSeconds: totalSeconds,
			TodaySeconds: today.StudySeconds,
			TotalMinutes: totalSeconds / 60,
			TodayMinutes: today.StudySeconds / 60,
		},
		Streak: Streak{Current: current, Longest: longest, TodayActive: todayActive},
		Today:  today,
		Goals:  goals,
	}
	snap.Plan = BuildPlan(today, goals)
	snap.CourseDone = percent(completed, totals.Lessons)
	return snap, nil
}

// BuildPlan формирует план на сегодня из фактической активности.
func BuildPlan(today storage.Day, goals Goals) []PlanItem {
	return []PlanItem{
		{
			ID:      "lesson",
			Label:   "Продолжить урок",
			Current: min(today.LessonsOpened, 1),
			Target:  1,
			Unit:    "урок",
			Done:    today.LessonsOpened > 0,
			Route:   "/learning",
		},
		{
			ID:      "exercises",
			Label:   "Решить задачи",
			Current: today.ExercisesDone,
			Target:  goals.Exercises,
			Unit:    "задачи",
			Done:    today.ExercisesDone >= goals.Exercises,
			Route:   "/practice",
		},
		{
			ID:      "cards",
			Label:   "Повторить карточки",
			Current: today.CardsReviewed,
			Target:  goals.Cards,
			Unit:    "карточек",
			Done:    today.CardsReviewed >= goals.Cards,
			Route:   "/flashcards",
		},
		{
			ID:      "quiz",
			Label:   "Пройти мини-тест",
			Current: min(today.QuizzesDone, 1),
			Target:  1,
			Unit:    "тест",
			Done:    today.QuizzesDone > 0,
			Route:   "/quizzes",
		},
	}
}

// CalcStreak считает текущую и рекордную серию дней подряд.
//
// Серия «жива», если сегодня или вчера была активность: иначе она прервана.
func CalcStreak(days []time.Time, now time.Time) (current, longest int, todayActive bool) {
	unique := map[string]time.Time{}
	for _, day := range days {
		local := day.In(now.Location())
		unique[local.Format("2006-01-02")] = truncate(local)
	}
	if len(unique) == 0 {
		return 0, 0, false
	}

	// Рекордная серия: проходим по всем дням по возрастанию.
	ordered := make([]time.Time, 0, len(unique))
	for _, day := range unique {
		ordered = append(ordered, day)
	}
	sortDays(ordered)
	run := 1
	longest = 1
	for i := 1; i < len(ordered); i++ {
		if ordered[i].Sub(ordered[i-1]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	today := truncate(now)
	_, hasToday := unique[today.Format("2006-01-02")]
	yesterday := today.AddDate(0, 0, -1)
	_, hasYesterday := unique[yesterday.Format("2006-01-02")]
	todayActive = hasToday

	cursor := today
	if !hasToday {
		if !hasYesterday {
			return 0, longest, false
		}
		cursor = yesterday
	}
	for {
		if _, ok := unique[cursor.Format("2006-01-02")]; !ok {
			break
		}
		current++
		cursor = cursor.AddDate(0, 0, -1)
	}
	return current, longest, todayActive
}

func truncate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

func sortDays(days []time.Time) {
	for i := 1; i < len(days); i++ {
		for j := i; j > 0 && days[j].Before(days[j-1]); j-- {
			days[j], days[j-1] = days[j-1], days[j]
		}
	}
}

func percent(part, total int) int {
	if total <= 0 {
		return 0
	}
	value := part * 100 / total
	if value > 100 {
		return 100
	}
	return value
}

func intValue(value any, fallback int) int {
	if v, ok := value.(int); ok {
		return v
	}
	return fallback
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
