//go:build !vercel

package contentfs

// materialize ничего не делает: в обычной сборке контент читается с диска.
func materialize(string) (bool, error) { return false, nil }
