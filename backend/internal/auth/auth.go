// Package auth проверяет access-токены Supabase и хранит пользователя в контексте.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

var (
	// ErrInvalidToken — токен отсутствует, истёк или отозван.
	ErrInvalidToken = errors.New("invalid token")
	// ErrUnavailable — Supabase Auth временно недоступен.
	ErrUnavailable = errors.New("auth service unavailable")
)

// User — минимальные данные пользователя Supabase.
type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

type cacheEntry struct {
	user    User
	expires time.Time
}

// Verifier проверяет токены через Supabase Auth API и кэширует результат.
// Подпись JWT локально не проверяется: ответ Supabase считается доверенным,
// зато схема работает и с legacy JWT secret, и с новыми signing keys.
type Verifier struct {
	baseURL string
	apiKey  string
	client  *http.Client

	mu    sync.Mutex
	cache map[string]cacheEntry
}

// NewVerifier создаёт клиент проверки токенов.
func NewVerifier(baseURL, apiKey string) *Verifier {
	return &Verifier{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		client: &http.Client{
			Timeout: 8 * time.Second,
		},
		cache: make(map[string]cacheEntry),
	}
}

// Verify возвращает пользователя для access-токена Supabase.
func (v *Verifier) Verify(ctx context.Context, token string) (User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return User{}, ErrInvalidToken
	}

	cacheKey := tokenKey(token)
	now := time.Now()
	v.mu.Lock()
	if entry, ok := v.cache[cacheKey]; ok && now.Before(entry.expires) {
		v.mu.Unlock()
		return entry.user, nil
	}
	v.mu.Unlock()

	user, err := v.fetchUser(ctx, token)
	if err != nil {
		return User{}, err
	}

	ttl := time.Minute
	if exp, ok := tokenExpiry(token); ok {
		untilExpiry := time.Until(exp)
		if untilExpiry <= 0 {
			return User{}, ErrInvalidToken
		}
		if untilExpiry < ttl {
			ttl = untilExpiry
		}
	}
	if ttl < 5*time.Second {
		ttl = 5 * time.Second
	}

	v.mu.Lock()
	if len(v.cache) > 512 {
		for key, entry := range v.cache {
			if now.After(entry.expires) {
				delete(v.cache, key)
			}
		}
	}
	v.cache[cacheKey] = cacheEntry{user: user, expires: now.Add(ttl)}
	v.mu.Unlock()

	return user, nil
}

func (v *Verifier) fetchUser(ctx context.Context, token string) (User, error) {
	endpoint := v.baseURL + "/auth/v1/user"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return User{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	req.Header.Set("apikey", v.apiKey)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := v.client.Do(req)
	if err != nil {
		return User{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized, http.StatusForbidden:
		return User{}, ErrInvalidToken
	default:
		return User{}, fmt.Errorf("%w: статус %d", ErrUnavailable, resp.StatusCode)
	}

	var payload struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return User{}, fmt.Errorf("%w: некорректный ответ", ErrUnavailable)
	}
	if payload.ID == "" {
		return User{}, ErrInvalidToken
	}
	return User{ID: payload.ID, Email: payload.Email}, nil
}

// tokenKey хеширует токен, чтобы не держать его в памяти в открытом виде.
func tokenKey(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// tokenExpiry читает exp из payload JWT без проверки подписи. Подпись уже
// проверена Supabase в fetchUser; здесь значение нужно только для TTL кэша.
func tokenExpiry(token string) (time.Time, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return time.Time{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, false
	}
	var payload struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil || payload.Exp == 0 {
		return time.Time{}, false
	}
	return time.Unix(payload.Exp, 0), true
}

// UserFromContext достаёт пользователя, установленного middleware.
func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey{}).(User)
	return user, ok
}

// WithUser сохраняет пользователя в контексте запроса.
func WithUser(ctx context.Context, user User) context.Context {
	return context.WithValue(ctx, userContextKey{}, user)
}

type userContextKey struct{}

// BearerToken извлекает токен из заголовка Authorization.
func BearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// ValidURL проверяет, что baseURL выглядит как http(s)-адрес.
func ValidURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}
