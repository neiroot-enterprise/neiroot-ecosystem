package main

import (
	"context"
	"embed"
	"github.com/go-chi/chi/v5"
	"neiroot/internal/platform"
	"neiroot/internal/platform/identity"
	"neiroot/internal/platform/storage"
	companyHTTP "neiroot/services/core/internal/modules/company/adapters/inbound"
	companyPG "neiroot/services/core/internal/modules/company/adapters/outbound"
	companyApp "neiroot/services/core/internal/modules/company/application"
	settingsHTTP "neiroot/services/core/internal/modules/settings/adapters/inbound"
	settingsPG "neiroot/services/core/internal/modules/settings/adapters/outbound"
	settingsApp "neiroot/services/core/internal/modules/settings/application"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

//go:embed migrations/*.sql
var migrations embed.FS

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
	invitationCipher, err := settingsPG.NewInvitationCipher(platform.Env("INVITATION_ENCRYPTION_KEY"))
	if err != nil {
		panic(err)
	}
	settings := &settingsApp.Service{Repo: &settingsPG.Repository{DB: db, InvitationCipher: invitationCipher}, Tx: db, PublicURL: platform.Env("PUBLIC_URL")}
	company := &companyApp.Service{Repo: &companyPG.Repository{DB: db}, Access: settings, Tx: db, PublicURL: platform.Env("PUBLIC_URL"), Identity: &settingsPG.Keycloak{BaseURL: platform.Env("KEYCLOAK_INTERNAL_URL"), Realm: "neiroot", ClientID: "neiroot-provisioner", Secret: platform.Env("KEYCLOAK_PROVISIONER_SECRET"), HTTP: &http.Client{Timeout: 15 * time.Second}}}
	settings.Employees = company
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) { platform.JSON(w, 200, map[string]bool{"ok": true}) })
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		if db.Pool.Ping(r.Context()) != nil {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(204)
	})
	r.Get("/metrics", platform.Metrics)
	sh := settingsHTTP.HTTP{Service: settings, Navigation: &settingsApp.NavigationService{Repo: &settingsPG.NavigationRepository{DB: db}, Tx: db, Access: settings}}
	ch := companyHTTP.HTTP{Service: company, Catalog: &companyApp.CatalogService{Repo: &companyPG.Repository{DB: db}, Tx: db, Access: settings}}
	sh.Public(r)
	r.Group(func(r chi.Router) {
		r.Use(identity.Auth(platform.Env("OIDC_ISSUER"), platform.Env("OIDC_INTERNAL_ISSUER"), "core-api"))
		sh.Protected(r)
		r.Route("/api/v1/tenants/{tenantId:[0-9a-f-]{36}}", func(r chi.Router) { ch.Routes(r); sh.Tenant(r) })
	})
	platform.Run(ctx, platform.EnvDefault("LISTEN_ADDR", ":8080"), r)
}
