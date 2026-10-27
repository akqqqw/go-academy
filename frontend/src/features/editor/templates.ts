// Стартовые примеры для свободного редактора. Все они компилируются и
// запускаются: пользователь может нажать «Запустить» сразу после выбора.

export interface EditorTemplate {
  id: string
  label: string
  description: string
  code: string
}

export const EDITOR_TEMPLATES: EditorTemplate[] = [
  {
    id: 'hello',
    label: 'Привет, мир',
    description: 'Минимальная программа: пакет main и fmt.Println.',
    code: `package main

import "fmt"

func main() {
	fmt.Println("Привет, Go!")
}
`,
  },
  {
    id: 'loop',
    label: 'Циклы и срезы',
    description: 'Сумма, среднее и обход среза через range.',
    code: `package main

import "fmt"

func main() {
	prices := []int{120, 89, 45, 310}
	sum := 0
	for _, price := range prices {
		sum += price
	}

	average := float64(sum) / float64(len(prices))
	fmt.Println("Сумма:", sum)
	fmt.Printf("Среднее: %.2f\\n", average)
}
`,
  },
  {
    id: 'structs',
    label: 'Структуры и методы',
    description: 'Тип, метод с указателем и печать через String().',
    code: `package main

import "fmt"

type Account struct {
	Name    string
	Balance float64
}

func (a *Account) Deposit(amount float64) {
	a.Balance += amount
}

func (a Account) String() string {
	return fmt.Sprintf("%s: %.2f руб.", a.Name, a.Balance)
}

func main() {
	account := &Account{Name: "Анна"}
	account.Deposit(1500)
	account.Deposit(250.5)

	fmt.Println(account)
}
`,
  },
  {
    id: 'errors',
    label: 'Ошибки и map',
    description: 'Словарь, возврат ошибки и обработка на месте вызова.',
    code: `package main

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("запись не найдена")

func lookup(store map[string]int, key string) (int, error) {
	value, ok := store[key]
	if !ok {
		return 0, fmt.Errorf("ключ %q: %w", key, ErrNotFound)
	}
	return value, nil
}

func main() {
	store := map[string]int{"яблоки": 12, "груши": 7}

	if value, err := lookup(store, "яблоки"); err == nil {
		fmt.Println("яблоки:", value)
	}

	if _, err := lookup(store, "сливы"); errors.Is(err, ErrNotFound) {
		fmt.Println("слив нет:", err)
	}
}
`,
  },
  {
    id: 'empty',
    label: 'Пустой файл',
    description: 'Только объявление пакета и функции main.',
    code: `package main

func main() {
	// код здесь
}
`,
  },
]

export const DEFAULT_TEMPLATE_ID = 'hello'

export function templateById(id: string): EditorTemplate {
  return EDITOR_TEMPLATES.find((template) => template.id === id) ?? EDITOR_TEMPLATES[0]
}
