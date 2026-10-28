module goacademy

go 1.23.0

require (
	github.com/jackc/pgx/v5 v5.7.6
	github.com/ncruces/go-sqlite3 v0.26.0
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/ncruces/julianday v1.0.0 // indirect
	github.com/tetratelabs/wazero v1.9.0 // indirect
	golang.org/x/crypto v0.38.0 // indirect
	golang.org/x/sync v0.14.0 // indirect
	golang.org/x/sys v0.33.0 // indirect
	golang.org/x/text v0.25.0 // indirect
)

// В песочнице, где собирался проект, домен golang.org/x недоступен, поэтому
// модуль x/sys берётся из его зеркала на GitHub. Если у вас есть доступ к
// proxy.golang.org, эти строки можно удалить и выполнить `go mod tidy`.
replace golang.org/x/sys => github.com/golang/sys v0.33.0
