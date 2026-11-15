package main

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"neiroot/internal/platform"
)

func TestUnreadableSessionRequiresLogin(t *testing.T) {
	block, err := aes.NewCipher(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	s := &server{Cipher: aead}
	valid := s.encrypt("synthetic-token")
	if got, err := s.decrypt(valid); err != nil || got != "synthetic-token" {
		t.Fatal("valid session token must remain readable")
	}
	otherKey := make([]byte, 32)
	otherKey[0] = 1
	otherBlock, _ := aes.NewCipher(otherKey)
	otherCipher, _ := cipher.NewGCM(otherBlock)
	old := (&server{Cipher: otherCipher}).encrypt("synthetic-token")
	corrupt := append([]byte(nil), valid...)
	corrupt[len(corrupt)-1] ^= 1
	for name, token := range map[string][]byte{"old key": old, "corrupt": corrupt, "truncated": {1, 2}} {
		t.Run(name, func(t *testing.T) {
			_, err := s.decrypt(token)
			if !errors.Is(err, errInvalidCiphertext) {
				t.Fatal("expected unreadable session")
			}
			assertSessionLoadError(t, err, 401, true)
		})
	}
	assertSessionLoadError(t, pgx.ErrNoRows, 401, true)
	assertSessionLoadError(t, errors.New("database unavailable"), 503, false)
}

func assertSessionLoadError(t *testing.T, cause error, status int, clear bool) {
	t.Helper()
	w := httptest.NewRecorder()
	err := sessionLoadError(w, cause)
	var apiErr *platform.Error
	if !errors.As(err, &apiErr) || apiErr.Status != status {
		t.Fatalf("unexpected error: %v", err)
	}
	cookies := w.Result().Cookies()
	if !clear {
		if len(cookies) != 0 {
			t.Fatal("database failure must preserve cookie")
		}
		return
	}
	if len(cookies) != 1 || cookies[0].Name != "__Host-neiroot" || cookies[0].MaxAge != -1 || !cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatal("unreadable session must clear its secure cookie")
	}
}
