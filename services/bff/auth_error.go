package main

import (
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"strings"

	"neiroot/internal/platform"
)

func flowCookieName(state string) string { return "__Host-neiroot-flow-" + state }

// Bind each pending OAuth flow independently so another tab cannot replace it.
func matchingFlowCookie(r *http.Request, state string) (string, bool) {
	if len(state) != 64 {
		return "", false
	}
	if _, err := hex.DecodeString(state); err != nil {
		return "", false
	}
	for _, name := range []string{flowCookieName(state), "__Host-neiroot-flow"} {
		c, err := r.Cookie(name)
		if err == nil && subtle.ConstantTimeCompare([]byte(c.Value), []byte(state)) == 1 {
			return name, true
		}
	}
	return "", false
}

var authErrorPage = template.Must(template.New("auth-error").Parse(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Повторный вход — Neiroot Ecosystem</title>
<style>
:root { color-scheme:light }
* { box-sizing:border-box }
body { margin:0; min-height:100dvh; display:grid; place-items:center; padding:24px; background:#f6f7f8; color:#171a1f; font:16px/1.5 Arial,sans-serif }
main { width:100%; max-width:460px; padding:32px; background:white; border:1px solid #e1e5e9; border-radius:12px; box-shadow:0 16px 40px #1a2c451a }
img { display:block; width:260px; max-width:100%; height:auto; margin:0 auto 28px }
h1 { font-size:24px; text-align:center }
p { color:#66706a }
a { display:block; text-align:center; background:#2f7d4a; color:white; padding:12px; border-radius:10px; text-decoration:none; font-weight:600 }
a:focus-visible { outline:2px solid #2f7d4a; outline-offset:3px }
small { display:block; margin-top:20px; color:#66706a; overflow-wrap:anywhere }
</style></head>
<body><main><img src="/neiroot-wordmark.png?v=20261005-2" alt="NEIROOT"><h1>Повторите вход</h1><p>{{.Message}}</p><a href="/api/auth/login">Войти снова</a>{{if .RequestID}}<small>Номер обращения: {{.RequestID}}</small>{{end}}</main></body></html>`))

func writeAuthError(w http.ResponseWriter, r *http.Request, err error) {
	if !strings.Contains(r.Header.Get("Accept"), "text/html") {
		platform.WriteError(w, r, err)
		return
	}
	e := &platform.Error{Status: 500, Code: "login_unavailable", Message: "Не удалось завершить вход. Попробуйте снова."}
	var known *platform.Error
	if errors.As(err, &known) {
		e = known
	} else {
		slog.Error("authentication callback failed", "requestId", r.Header.Get("X-Request-ID"))
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(e.Status)
	_ = authErrorPage.Execute(w, struct{ Message, RequestID string }{e.Message, r.Header.Get("X-Request-ID")})
}
