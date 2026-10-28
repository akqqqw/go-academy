package quizzes

import (
	"os"
	"path/filepath"
	"testing"
)

const contentDir = "../../../content"

func TestRepositoryQuizzesLoad(t *testing.T) {
	store := NewStore(contentDir)
	if err := store.Reload(); err != nil {
		t.Fatalf("загрузить викторины: %v", err)
	}
	all := store.All()
	if len(all) != 6 {
		t.Errorf("викторин = %d, ожидалось 6", len(all))
	}
	if total := store.TotalQuestions(); total != 38 {
		t.Errorf("вопросов = %d, ожидалось 38", total)
	}

	types := map[string]int{}
	for _, quiz := range all {
		if quiz.Title == "" || quiz.Description == "" || quiz.Level == "" {
			t.Errorf("викторина %q: пустые метаданные", quiz.ID)
		}
		for _, question := range quiz.Questions {
			types[question.Type]++
			if question.Explanation == "" || question.Prompt == "" {
				t.Errorf("вопрос %q: нет текста или объяснения", question.ID)
			}
		}
	}
	for _, kind := range []string{TypeSingle, TypeMultiple, TypeTrueFalse, TypeInput, TypeCode} {
		if types[kind] < 3 {
			t.Errorf("тип %q встречается %d раз, ожидалось минимум 3", kind, types[kind])
		}
	}
	if _, ok := store.Get("final-core"); !ok {
		t.Error("нет итоговой викторины final-core")
	}
}

func TestCheckGradesQuestions(t *testing.T) {
	single := Question{Type: TypeSingle, Correct: []string{"b"}, Options: []Option{{ID: "a"}, {ID: "b"}}}
	multiple := Question{Type: TypeMultiple, Correct: []string{"a", "c"}}
	boolean := Question{Type: TypeTrueFalse, Correct: []string{"false"}}
	input := Question{Type: TypeInput, Accepted: []string{"errors.Join", "Join"}}
	code := Question{Type: TypeCode, Correct: []string{"d"}}

	cases := []struct {
		name     string
		question Question
		given    []string
		want     bool
	}{
		{"single верно", single, []string{"b"}, true},
		{"single неверно", single, []string{"a"}, false},
		{"single пусто", single, nil, false},
		{"single два ответа", single, []string{"a", "b"}, false},
		{"multiple полный набор", multiple, []string{"c", "a"}, true},
		{"multiple пропуск", multiple, []string{"a"}, false},
		{"multiple лишний", multiple, []string{"a", "b", "c"}, false},
		{"multiple повтор", multiple, []string{"a", "c", "c"}, false},
		{"true/false верно", boolean, []string{"false"}, true},
		{"true/false неверно", boolean, []string{"true"}, false},
		{"input точное совпадение", input, []string{"Errors.Join"}, true},
		{"input с пробелами и точкой", input, []string{"  errors.join. "}, true},
		{"input синоним", input, []string{"Join"}, true},
		{"input пусто", input, []string{"   "}, false},
		{"code верно", code, []string{"d"}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Check(tc.question, tc.given); got != tc.want {
				t.Errorf("Check = %v, ожидалось %v", got, tc.want)
			}
		})
	}
}

func TestLoadRejectsBrokenQuizzes(t *testing.T) {
	cases := map[string]string{
		"без викторин":      `{"quizzes":[]}`,
		"без id":            `{"quizzes":[{"id":"","title":"T","questions":[]}]}`,
		"пустая викторина":  `{"quizzes":[{"id":"a","title":"A","questions":[]}]}`,
		"неизвестный тип":   `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"essay","prompt":"p","explanation":"e","accepted":["x"]}]}]}`,
		"single без ответа": `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"single","prompt":"p","explanation":"e","options":[{"id":"a","text":"A"},{"id":"b","text":"B"}]}]}]}`,
		"single два ответа": `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"single","prompt":"p","explanation":"e","options":[{"id":"a","text":"A"},{"id":"b","text":"B"}],"correct":["a","b"]}]}]}`,
		"нет объяснения":    `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"true_false","prompt":"p","correct":["true"]}]}]}`,
		"дубли вопросов": `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"true_false","prompt":"p","explanation":"e","correct":["true"]}]},` +
			`{"id":"b","title":"B","questions":[{"id":"q","type":"true_false","prompt":"p","explanation":"e","correct":["false"]}]}]}`,
		"multiple все верные": `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"multiple","prompt":"p","explanation":"e","options":[{"id":"a","text":"A"},{"id":"b","text":"B"}],"correct":["a","b"]}]}]}`,
		"input без ответов":   `{"quizzes":[{"id":"a","title":"A","questions":[{"id":"q","type":"input","prompt":"p","explanation":"e"}]}]}`,
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.MkdirAll(filepath.Join(dir, "quizzes"), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "quizzes", "quizzes.json"), []byte(payload), 0o644); err != nil {
				t.Fatal(err)
			}
			store := NewStore(dir)
			if err := store.Reload(); err == nil {
				t.Fatal("ожидалась ошибка загрузки")
			}
			if store.Err() == nil {
				t.Fatal("ошибка должна сохраниться в store")
			}
		})
	}
}
