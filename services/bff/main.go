package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
	"io"
	"neiroot/internal/contracts"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed migrations/*.sql
var migrations embed.FS

type session struct {
	ID, Access, Refresh, CSRF, Tenant string
	AccessExpiry, Expiry              time.Time
}
type sessionKey struct{}
type server struct {
	DB                                 *storage.DB
	PublicURL, CoreURL, InternalIssuer string
	OAuth                              oauth2.Config
	Verifier                           *oidc.IDTokenVerifier
	Cipher                             cipher.AEAD
	HTTP                               *http.Client
	Proxy                              *httputil.ReverseProxy
	Locks                              [64]sync.Mutex
}

func hash(s string) string { v := sha256.Sum256([]byte(s)); return hex.EncodeToString(v[:]) }
func (s *server) encrypt(value string) []byte {
	nonce := make([]byte, s.Cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}
	return s.Cipher.Seal(nonce, nonce, []byte(value), nil)
}
func (s *server) decrypt(value []byte) (string, error) {
	n := s.Cipher.NonceSize()
	if len(value) < n {
		return "", errors.New("invalid ciphertext")
	}
	plain, err := s.Cipher.Open(nil, value[:n], value[n:], nil)
	return string(plain), err
}
func cookie(w http.ResponseWriter, name, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (s *server) load(ctx context.Context, id string) (*session, error) {
	var access, refresh []byte
	v := &session{ID: id}
	err := s.DB.Pool.QueryRow(ctx, "SELECT access_token,refresh_token,access_expires_at,expires_at,coalesce(tenant_id::text,''),csrf FROM sessions WHERE id_hash=$1 AND expires_at>now()", hash(id)).Scan(&access, &refresh, &v.AccessExpiry, &v.Expiry, &v.Tenant, &v.CSRF)
	if err != nil {
		return nil, err
	}
	v.Access, err = s.decrypt(access)
	if err != nil {
		return nil, err
	}
	v.Refresh, err = s.decrypt(refresh)
	return v, err
}
func (s *server) save(ctx context.Context, v *session) error {
	_, err := s.DB.Pool.Exec(ctx, "INSERT INTO sessions(id_hash,access_token,refresh_token,access_expires_at,expires_at,tenant_id,csrf) VALUES($1,$2,$3,$4,$5,nullif($6,'')::uuid,$7) ON CONFLICT(id_hash) DO UPDATE SET access_token=$2,refresh_token=$3,access_expires_at=$4,tenant_id=nullif($6,'')::uuid", hash(v.ID), s.encrypt(v.Access), s.encrypt(v.Refresh), v.AccessExpiry, v.Expiry, v.Tenant, v.CSRF)
	return err
}
func (s *server) getSession(w http.ResponseWriter, r *http.Request) (*session, error) {
	c, err := r.Cookie("__Host-neiroot")
	if err != nil || len(c.Value) != 64 {
		return nil, platform.Fail(401, "unauthenticated", "Войдите в аккаунт.")
	}
	lock := &s.Locks[int(c.Value[0])%len(s.Locks)]
	lock.Lock()
	defer lock.Unlock()
	v, err := s.load(r.Context(), c.Value)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, platform.Fail(503, "session_unavailable", "Сервис сессий временно недоступен. Повторите действие.")
		}
		cookie(w, "__Host-neiroot", "", -1)
		return nil, platform.Fail(401, "unauthenticated", "Войдите в аккаунт.")
	}
	if time.Until(v.AccessExpiry) < 30*time.Second {
		ctx := context.WithValue(r.Context(), oauth2.HTTPClient, s.HTTP)
		t, err := s.OAuth.TokenSource(ctx, &oauth2.Token{AccessToken: v.Access, RefreshToken: v.Refresh, Expiry: v.AccessExpiry}).Token()
		if err != nil {
			return nil, platform.Fail(401, "session_expired", "Сессия истекла. Войдите снова.")
		}
		v.Access = t.AccessToken
		if t.RefreshToken != "" {
			v.Refresh = t.RefreshToken
		}
		v.AccessExpiry = t.Expiry
		if err = s.save(ctx, v); err != nil {
			return nil, err
		}
	}
	return v, nil
}
func (s *server) safeOrigin(w http.ResponseWriter, r *http.Request, next http.Handler) {
	if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
		if r.Header.Get("Origin") != s.PublicURL {
			platform.WriteError(w, r, platform.Fail(403, "origin_forbidden", "Недопустимый источник запроса."))
			return
		}
	}
	next.ServeHTTP(w, r)
}
func (s *server) protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, err := s.getSession(w, r)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(v.CSRF)) != 1 {
				platform.WriteError(w, r, platform.Fail(403, "csrf_invalid", "Обновите страницу и повторите действие."))
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, v)))
	})
}
func (s *server) core(ctx context.Context, v *session, path string) ([]byte, int, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", s.CoreURL+path, nil)
	req.Header.Set("Authorization", "Bearer "+v.Access)
	res, err := s.HTTP.Do(req)
	if err != nil {
		return nil, 503, platform.Fail(503, "core_unavailable", "Сервис временно недоступен.")
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return raw, res.StatusCode, err
}
func (s *server) login(w http.ResponseWriter, r *http.Request) {
	state, nonce, verifier := platform.Random(), platform.Random(), oauth2.GenerateVerifier()
	returnTo := r.URL.Query().Get("returnTo")
	if returnTo != "/invite" {
		returnTo = "/"
	}
	_, err := s.DB.Pool.Exec(r.Context(), "INSERT INTO oauth_flows(id_hash,verifier,nonce,return_to,expires_at) VALUES($1,$2,$3,$4,$5)", hash(state), s.encrypt(verifier), nonce, returnTo, time.Now().Add(10*time.Minute))
	if err != nil {
		platform.WriteError(w, r, err)
		return
	}
	cookie(w, flowCookieName(state), state, 600)
	config := s.OAuth
	if r.URL.Query().Get("signup") == "1" {
		config.Endpoint.AuthURL = strings.TrimSuffix(config.Endpoint.AuthURL, "/auth") + "/registrations"
	}
	http.Redirect(w, r, config.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oauth2.SetAuthURLParam("nonce", nonce), oauth2.SetAuthURLParam("ui_locales", "ru")), 302)
}
func (s *server) callback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	flowName, valid := matchingFlowCookie(r, state)
	if !valid {
		writeAuthError(w, r, platform.Fail(400, "invalid_oauth_state", "Эта страница входа устарела. Начните вход заново."))
		return
	}
	var encrypted []byte
	var nonce, returnTo string
	err := s.DB.Pool.QueryRow(r.Context(), "DELETE FROM oauth_flows WHERE id_hash=$1 AND expires_at>now() RETURNING verifier,nonce,return_to", hash(state)).Scan(&encrypted, &nonce, &returnTo)
	cookie(w, flowName, "", -1)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeAuthError(w, r, platform.Fail(400, "oauth_flow_expired", "Ссылка входа истекла или уже использована. Начните вход заново."))
		} else {
			writeAuthError(w, r, platform.Fail(503, "session_unavailable", "Сервис входа временно недоступен. Попробуйте снова."))
		}
		return
	}
	verifier, err := s.decrypt(encrypted)
	if err != nil {
		writeAuthError(w, r, err)
		return
	}
	ctx := context.WithValue(r.Context(), oauth2.HTTPClient, s.HTTP)
	token, err := s.OAuth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(verifier))
	if err != nil {
		writeAuthError(w, r, platform.Fail(401, "login_failed", "Не удалось выполнить вход. Начните вход заново."))
		return
	}
	idRaw, _ := token.Extra("id_token").(string)
	id, err := s.Verifier.Verify(ctx, idRaw)
	if err != nil || id.Nonce != nonce {
		writeAuthError(w, r, platform.Fail(401, "login_failed", "Не удалось подтвердить аккаунт. Начните вход заново."))
		return
	}
	v := &session{ID: platform.Random(), Access: token.AccessToken, Refresh: token.RefreshToken, AccessExpiry: token.Expiry, Expiry: time.Now().Add(8 * time.Hour), CSRF: platform.Random()}
	if err = s.save(ctx, v); err != nil {
		writeAuthError(w, r, err)
		return
	}
	cookie(w, "__Host-neiroot", v.ID, 8*3600)
	http.Redirect(w, r, s.PublicURL+returnTo, 302)
}
func (s *server) info(w http.ResponseWriter, r *http.Request) {
	v, err := s.getSession(w, r)
	if err != nil {
		var e *platform.Error
		if errors.As(err, &e) && e.Status == 401 {
			platform.JSON(w, 200, contracts.GuestSession{Authenticated: contracts.False})
			return
		}
		platform.WriteError(w, r, err)
		return
	}
	raw, status, err := s.core(r.Context(), v, "/api/v1/me")
	if err != nil {
		platform.WriteError(w, r, err)
		return
	}
	if status != 200 {
		if status == 401 {
			_, _ = s.DB.Pool.Exec(r.Context(), "DELETE FROM sessions WHERE id_hash=$1", hash(v.ID))
			cookie(w, "__Host-neiroot", "", -1)
			platform.JSON(w, 200, contracts.GuestSession{Authenticated: contracts.False})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(raw)
		return
	}
	var info contracts.Me
	if json.Unmarshal(raw, &info) != nil {
		platform.WriteError(w, r, errors.New("invalid upstream"))
		return
	}
	valid := false
	for _, item := range info.Tenants {
		if item.ID == v.Tenant {
			valid = true
		}
	}
	if !valid {
		v.Tenant = ""
		if len(info.Tenants) > 0 {
			v.Tenant = info.Tenants[0].ID
		}
		if err = s.save(r.Context(), v); err != nil {
			platform.WriteError(w, r, err)
			return
		}
	}
	platform.JSON(w, 200, contracts.AuthenticatedSession{Authenticated: contracts.True, CSRFToken: v.CSRF, ActiveTenantID: v.Tenant, Subject: info.Subject, FullName: info.FullName, Phone: info.Phone, Email: info.Email, Tenants: info.Tenants})
}
func (s *server) selectTenant(w http.ResponseWriter, r *http.Request) {
	var input contracts.TenantSelection
	if err := platform.Decode(w, r, &input); err != nil {
		platform.WriteError(w, r, err)
		return
	}
	v := r.Context().Value(sessionKey{}).(*session)
	raw, status, err := s.core(r.Context(), v, "/api/v1/tenants")
	if err != nil {
		platform.WriteError(w, r, err)
		return
	}
	if status != 200 {
		platform.WriteError(w, r, platform.Fail(403, "tenant_forbidden", "Нет доступа к пространству."))
		return
	}
	var items []contracts.Tenant
	if json.Unmarshal(raw, &items) != nil {
		platform.WriteError(w, r, errors.New("invalid upstream"))
		return
	}
	for _, item := range items {
		if item.ID == input.TenantID {
			v.Tenant = item.ID
			if err = s.save(r.Context(), v); err != nil {
				platform.WriteError(w, r, err)
				return
			}
			w.WriteHeader(204)
			return
		}
	}
	platform.WriteError(w, r, platform.Fail(403, "tenant_forbidden", "Нет доступа к пространству."))
}
func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	v := r.Context().Value(sessionKey{}).(*session)
	form := url.Values{"client_id": {s.OAuth.ClientID}, "client_secret": {s.OAuth.ClientSecret}, "refresh_token": {v.Refresh}}
	req, _ := http.NewRequestWithContext(r.Context(), "POST", s.InternalIssuer+"/protocol/openid-connect/logout", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, logoutErr := s.HTTP.Do(req)
	if res != nil {
		res.Body.Close()
		if res.StatusCode != 204 && res.StatusCode != 200 {
			logoutErr = errors.New("logout rejected")
		}
	}
	_, err := s.DB.Pool.Exec(r.Context(), "DELETE FROM sessions WHERE id_hash=$1", hash(v.ID))
	cookie(w, "__Host-neiroot", "", -1)
	if err != nil {
		platform.WriteError(w, r, err)
		return
	}
	if logoutErr != nil {
		platform.WriteError(w, r, platform.Fail(503, "sso_logout_failed", "Локальная сессия закрыта. Сервис входа временно недоступен."))
		return
	}
	w.WriteHeader(204)
}
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if platform.EnvDefault("MIGRATE_ONLY", "") == "true" {
		if err := storage.Migrate(platform.Env("MIGRATION_DATABASE_URL"), migrations); err != nil {
			panic(err)
		}
		return
	}
	db, err := storage.Open(ctx, platform.Env("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer db.Pool.Close()
	key, err := hex.DecodeString(platform.Env("SESSION_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		panic("SESSION_ENCRYPTION_KEY must be 32 bytes in hex")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		panic(err)
	}
	aead, _ := cipher.NewGCM(block)
	public, issuer, internal := platform.Env("PUBLIC_URL"), platform.Env("OIDC_ISSUER"), platform.Env("OIDC_INTERNAL_ISSUER")
	s := &server{DB: db, PublicURL: public, CoreURL: platform.Env("CORE_URL"), InternalIssuer: internal, Cipher: aead, HTTP: &http.Client{Timeout: 20 * time.Second}, OAuth: oauth2.Config{ClientID: "neiroot-web", ClientSecret: platform.Env("KEYCLOAK_WEB_SECRET"), RedirectURL: public + "/api/auth/callback", Scopes: []string{"openid", "profile", "email"}, Endpoint: oauth2.Endpoint{AuthURL: issuer + "/protocol/openid-connect/auth", TokenURL: internal + "/protocol/openid-connect/token", AuthStyle: oauth2.AuthStyleInParams}}, Verifier: oidc.NewVerifier(issuer, oidc.NewRemoteKeySet(ctx, internal+"/protocol/openid-connect/certs"), &oidc.Config{ClientID: "neiroot-web"})}
	target, _ := url.Parse(s.CoreURL)
	s.Proxy = &httputil.ReverseProxy{Rewrite: func(p *httputil.ProxyRequest) {
		p.SetURL(target)
		p.Out.Header.Del("Cookie")
		p.Out.Header.Del("Authorization")
		p.Out.Header.Del("X-CSRF-Token")
		if v, ok := p.In.Context().Value(sessionKey{}).(*session); ok {
			p.Out.Header.Set("Authorization", "Bearer "+v.Access)
		}
	}, ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
		platform.WriteError(w, r, platform.Fail(503, "core_unavailable", "Сервис временно недоступен."))
	}}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, 32768)
			s.safeOrigin(w, r, next)
		})
	})
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		if db.Pool.Ping(r.Context()) != nil {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(204)
	})
	r.Get("/metrics", platform.Metrics)
	r.Get("/api/auth/login", s.login)
	r.Get("/api/auth/callback", s.callback)
	r.Get("/api/v1/session", s.info)
	r.Post("/api/v1/invitations/resolve", func(w http.ResponseWriter, r *http.Request) { s.Proxy.ServeHTTP(w, r) })
	r.Group(func(r chi.Router) {
		r.Use(s.protect)
		r.Post("/api/auth/logout", s.logout)
		r.Post("/api/v1/session/tenant", s.selectTenant)
		r.Handle("/api/v1/*", s.Proxy)
	})
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, _ = db.Pool.Exec(ctx, "DELETE FROM sessions WHERE expires_at<now(); DELETE FROM oauth_flows WHERE expires_at<now()")
			}
		}
	}()
	platform.Run(ctx, platform.EnvDefault("LISTEN_ADDR", ":8080"), r)
}
