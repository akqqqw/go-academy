// Package contentfs поставляет учебный контент в сборке для Vercel.
//
// Обычная сборка читает content/ с диска. На Vercel сервис backend собирается
// из каталога backend/, поэтому корневой content/ в него не попадает: команда
// сборки копирует его в internal/contentfs/assets, а файл с тегом `vercel`
// встраивает каталог в бинарник. При старте Materialize распаковывает контент
// в /tmp — единственное место, доступное на запись в serverless-окружении.
package contentfs

// Materialize готовит каталог с учебным контентом.
//
// Возвращает true, если контент был встроен в бинарник и распакован в dir.
// В обычной сборке (без тега vercel) ничего не делает и возвращает false:
// контент читается с диска как раньше.
func Materialize(dir string) (bool, error) {
	return materialize(dir)
}
