package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIndependentFlowCookies(t *testing.T) {
	a, b := strings.Repeat("a", 64), strings.Repeat("b", 64)
	r := httptest.NewRequest("GET", "/", nil)
	r.AddCookie(&http.Cookie{Name: flowCookieName(a), Value: a})
	r.AddCookie(&http.Cookie{Name: flowCookieName(b), Value: b})
	for _, state := range []string{a, b} {
		if name, ok := matchingFlowCookie(r, state); !ok || name != flowCookieName(state) {
			t.Fatal("pending flows must both remain bound")
		}
	}
	if _, ok := matchingFlowCookie(r, strings.Repeat("c", 64)); ok {
		t.Fatal("unbound state accepted")
	}
	for _, invalid := range []string{"", strings.Repeat("z", 64), a + "x"} {
		if _, ok := matchingFlowCookie(r, invalid); ok {
			t.Fatal("invalid state accepted")
		}
	}
}

func TestCallbackRejectsInvalidStateWithoutClearingOtherFlows(t *testing.T) {
	for _, accept := range []string{"application/json", "text/html"} {
		r := httptest.NewRequest("GET", "/api/auth/callback?state=invalid", nil)
		r.Header.Set("Accept", accept)
		r.AddCookie(&http.Cookie{Name: flowCookieName(strings.Repeat("a", 64)), Value: strings.Repeat("a", 64)})
		w := httptest.NewRecorder()
		(&server{}).callback(w, r)
		if w.Code != 400 || w.Header().Get("Set-Cookie") != "" {
			t.Fatal("invalid callback must reject without clearing another flow")
		}
		if accept == "text/html" {
			if !strings.Contains(w.Body.String(), "Войти снова") || w.Header().Get("Referrer-Policy") != "no-referrer" {
				t.Fatal("browser recovery page missing")
			}
		} else if !strings.Contains(w.Body.String(), "invalid_oauth_state") {
			t.Fatal("JSON error contract changed")
		}
	}
}
