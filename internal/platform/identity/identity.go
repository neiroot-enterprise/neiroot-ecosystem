package identity

import (
	"context"
	"github.com/coreos/go-oidc/v3/oidc"
	"neiroot/internal/platform"
	"neiroot/internal/security"
	"net/http"
	"strings"
	"time"
)

type Principal = security.Principal
type principalKey struct{}

func Current(ctx context.Context) Principal { p, _ := ctx.Value(principalKey{}).(Principal); return p }
func Auth(issuer, internalURL, audience string) func(http.Handler) http.Handler {
	keys := oidc.NewRemoteKeySet(oidc.ClientContext(context.Background(), &http.Client{Timeout: 10 * time.Second}), internalURL+"/protocol/openid-connect/certs")
	verifier := oidc.NewVerifier(issuer, keys, &oidc.Config{ClientID: audience})
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			token, err := verifier.Verify(r.Context(), raw)
			if err != nil {
				platform.WriteError(w, r, platform.Fail(401, "unauthenticated", "Войдите в аккаунт."))
				return
			}
			var claims struct {
				LastName   string `json:"family_name"`
				FirstName  string `json:"given_name"`
				MiddleName string `json:"middle_name"`
				Subject    string `json:"sub"`
				FullName   string `json:"full_name"`
				Phone      string `json:"preferred_username"`
				Email      string `json:"email"`
			}
			if token.Claims(&claims) != nil || claims.Subject == "" {
				platform.WriteError(w, r, platform.Fail(401, "unauthenticated", "Войдите в аккаунт."))
				return
			}
			p := Principal{LastName: claims.LastName, FirstName: claims.FirstName, MiddleName: claims.MiddleName, Subject: claims.Subject, FullName: claims.FullName, Phone: claims.Phone, Email: strings.ToLower(claims.Email)}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, p)))
		})
	}
}
