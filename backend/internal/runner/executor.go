package runner

import "context"

// Executor — всё, что HTTP-слою нужно от исполнителя кода.
//
// Интерфейс позволяет заменить локальный запуск (Runner) на удалённый
// изолированный сервис (RemoteRunner) без изменений в API, web и мобильном
// приложении: контракт `/api/editor/*` и `/api/exercises/*` не меняется.
type Executor interface {
	// Run компилирует и запускает программу.
	Run(ctx context.Context, code string) (Result, error)
	// Build только компилирует код — без запуска.
	Build(ctx context.Context, code string) (Result, error)
	// Format форматирует исходник через gofmt.
	Format(code string) (string, []Diagnostic, error)
	// Test прогоняет тесты задания через go test.
	Test(ctx context.Context, code, tests string) (TestResult, error)
	// Status сообщает, доступен ли Go и какие действуют лимиты.
	Status(ctx context.Context) Status
}

var (
	_ Executor = (*Runner)(nil)
	_ Executor = (*RemoteRunner)(nil)
)
