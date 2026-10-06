package platform

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-chi/chi/v5/middleware"
	"io"
	"log/slog"
	"neiroot/internal/contracts"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

type Error struct {
	Status        int
	Code, Message string
}

func (e *Error) Error() string                    { return e.Code }
func Fail(status int, code, message string) error { return &Error{status, code, message} }
func JSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var e *Error
	if !errors.As(err, &e) {
		slog.Error("request failed", "requestId", r.Header.Get("X-Request-ID"))
		e = &Error{500, "internal_error", "Не удалось выполнить операцию. Попробуйте ещё раз."}
	}
	JSON(w, e.Status, contracts.APIError{Code: e.Code, Message: e.Message, RequestID: r.Header.Get("X-Request-ID")})
}
func Decode(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return Fail(400, "invalid_request", "Проверьте введённые данные.")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return Fail(400, "invalid_request", "Некорректный JSON.")
	}
	return nil
}
func Env(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic("missing configuration: " + key)
	}
	return value
}
func EnvDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func Random() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func UUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

var Requests, Failures atomic.Int64
var DurationNanoseconds atomic.Int64
var requestIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func Observe(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if !requestIDPattern.MatchString(id) {
			id = UUID()
		}
		r.Header.Set("X-Request-ID", id)
		w.Header().Set("X-Request-ID", id)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		Requests.Add(1)
		start := time.Now()
		response := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(response, r)
		duration := time.Since(start)
		DurationNanoseconds.Add(duration.Nanoseconds())
		if response.Status() >= 400 {
			Failures.Add(1)
		}
		// URLs, bodies and identity details are deliberately absent from diagnostics.
		slog.Info("http", "method", r.Method, "requestId", id, "status", response.Status(), "durationMs", duration.Milliseconds())
	})
}
func Metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "neiroot_http_requests_total %d\nneiroot_http_errors_total %d\nneiroot_http_duration_seconds_sum %f\nneiroot_http_duration_seconds_count %d\n", Requests.Load(), Failures.Load(), float64(DurationNanoseconds.Load())/float64(time.Second), Requests.Load())
}
func Pagination(r *http.Request) (int, int, error) {
	limit, offset := 25, 0
	var err error
	if r.URL.Query().Get("limit") != "" {
		limit, err = strconv.Atoi(r.URL.Query().Get("limit"))
		if err != nil {
			return 0, 0, Fail(400, "invalid_pagination", "Некорректный размер страницы.")
		}
	}
	if r.URL.Query().Get("offset") != "" {
		offset, err = strconv.Atoi(r.URL.Query().Get("offset"))
		if err != nil {
			return 0, 0, Fail(400, "invalid_pagination", "Некорректная страница.")
		}
	}
	if limit < 1 || limit > 100 || offset < 0 || offset > 1000000 {
		return 0, 0, Fail(400, "invalid_pagination", "Размер страницы должен быть от 1 до 100.")
	}
	return limit, offset, nil
}
func Run(ctx context.Context, address string, handler http.Handler) {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))
	s := &http.Server{Addr: address, Handler: Observe(handler), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 45 * time.Second, IdleTimeout: 90 * time.Second}
	go func() {
		<-ctx.Done()
		stop, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.Shutdown(stop)
	}()
	slog.Info("listening", "address", address)
	if err := s.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
func Phone(value string) (string, error) {
	var b strings.Builder
	for _, r := range strings.TrimSpace(value) {
		if r == '+' || r >= '0' && r <= '9' {
			b.WriteRune(r)
		} else if r != ' ' && r != '-' && r != '(' && r != ')' {
			return "", Fail(422, "invalid_phone", "Укажите телефон в международном формате, например +79990000000.")
		}
	}
	s := b.String()
	if len(s) < 9 || len(s) > 16 || s[0] != '+' || s[1] == '0' || strings.Contains(s[1:], "+") {
		return "", Fail(422, "invalid_phone", "Укажите телефон в международном формате, например +79990000000.")
	}
	return s, nil
}
