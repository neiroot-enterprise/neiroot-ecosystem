package integration

import (
	"context"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	"neiroot/internal/security"
	companyPG "neiroot/services/core/internal/modules/company/adapters/outbound"
	company "neiroot/services/core/internal/modules/company/application"
	settingsPG "neiroot/services/core/internal/modules/settings/adapters/outbound"
	settings "neiroot/services/core/internal/modules/settings/application"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestRealPostgresIsolationPermissionsInvitationsAndRetries(t *testing.T) {
	connection := os.Getenv("NEIROOT_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("requires isolated PostgreSQL test database")
	}
	ctx := context.Background()
	db, err := storage.Open(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Pool.Close()
	var bypass, super bool
	if err = db.Pool.QueryRow(ctx, "SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user").Scan(&bypass, &super); err != nil || bypass || super {
		t.Fatal("test must use the restricted application role")
	}
	s := &settings.Service{Repo: &settingsPG.Repository{DB: db}, Tx: db, PublicURL: "https://localhost:8443"}
	c := &company.Service{Repo: &companyPG.Repository{DB: db}, Access: s, Tx: db, PublicURL: "https://localhost:8443"}
	s.Employees = c
	makePrincipal := func(label string) security.Principal {
		suffix := platform.Random()[:10]
		return security.Principal{Subject: "sql-test-" + suffix, LastName: "Тест", FirstName: label, FullName: "Тест " + label, Phone: "+7999" + digits(suffix), Email: label + suffix + "@example.test"}
	}
	a, b, user := makePrincipal("a"), makePrincipal("b"), makePrincipal("user")
	ta, err := s.Onboard(ctx, a, "SQL Test A")
	if err != nil {
		t.Fatal(err)
	}
	tb, err := s.Onboard(ctx, b, "SQL Test B")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.Onboard(ctx, a, "Repeated name")
	if err != nil || again.ID != ta.ID {
		t.Fatal("onboarding was not idempotent", err)
	}
	input := company.Input{LastName: user.LastName, FirstName: user.FirstName, Phone: user.Phone, Email: user.Email, Role: "user", Mode: "invite"}
	key := platform.Random()
	created, err := c.Create(ctx, a.Subject, ta.ID, key, input)
	if err != nil {
		t.Fatal(err)
	}
	repeat, err := c.Create(ctx, a.Subject, ta.ID, key, input)
	if err != nil || repeat.Employee.ID != created.Employee.ID {
		t.Fatal("creation duplicated employee", err)
	}
	parsed, _ := url.Parse(created.InvitationURL)
	token := strings.TrimPrefix(parsed.Fragment, "token=")
	if _, err = s.Accept(ctx, b, token); err == nil {
		t.Fatal("wrong email accepted invitation")
	}
	if _, err = s.Accept(ctx, user, token); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Accept(ctx, user, token); err != nil {
		t.Fatal("same-account acceptance should be idempotent", err)
	}
	if err = db.Within(ctx, ta.ID, func(ctx context.Context) error { return c.Repo.Link(ctx, ta.ID, created.Employee.ID, "", "error") }); err != nil {
		t.Fatal(err)
	}
	active, err := c.Get(ctx, a.Subject, ta.ID, created.Employee.ID)
	if err != nil || active.AccessState != "active" {
		t.Fatal("a late failed retry disconnected the active employee", err)
	}
	if _, err = c.List(ctx, user.Subject, ta.ID, "", 25, 0); err != nil {
		t.Fatal(err)
	}
	if _, err = c.List(ctx, a.Subject, tb.ID, "", 25, 0); err == nil {
		t.Fatal("foreign tenant was readable")
	}
	if _, err = c.Get(ctx, b.Subject, tb.ID, created.Employee.ID); err == nil {
		t.Fatal("foreign employee was readable")
	}
	next := makePrincipal("next")
	nextInput := company.Input{LastName: next.LastName, FirstName: next.FirstName, Phone: next.Phone, Email: next.Email, Role: "user", Mode: "invite"}
	if _, err = c.Create(ctx, user.Subject, ta.ID, platform.Random(), nextInput); err == nil {
		t.Fatal("user created employee")
	}
	if err = s.ChangeRole(ctx, user, ta.ID, created.Employee.ID, "admin"); err == nil {
		t.Fatal("user assigned role")
	}
	if err = s.ChangeRole(ctx, a, ta.ID, created.Employee.ID, "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err = c.Create(ctx, user.Subject, ta.ID, platform.Random(), nextInput); err != nil {
		t.Fatal("updated role not effective on next request", err)
	}
	spaces, err := s.ListTenants(ctx, a)
	if err != nil {
		t.Fatal(err)
	}
	if len(spaces) != 1 {
		t.Fatal("unexpected tenant membership")
	}
	var ownerID string
	err = db.Within(ctx, ta.ID, func(ctx context.Context) error {
		return db.Q(ctx).QueryRow(ctx, "SELECT employee_id::text FROM settings.memberships WHERE role='owner'").Scan(&ownerID)
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.ChangeRole(ctx, a, ta.ID, ownerID, "user"); err == nil {
		t.Fatal("owner role was changed")
	}
	err = db.Within(ctx, ta.ID, func(ctx context.Context) error {
		var count int
		if err := db.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM company.employees WHERE tenant_id=$1", tb.ID).Scan(&count); err != nil {
			return err
		}
		if count != 0 {
			t.Fatal("RLS exposed another tenant")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	// Pool reuse must not retain the previous transaction's tenant context.
	var leaked int
	if err = db.Pool.QueryRow(ctx, "SELECT count(*) FROM company.employees").Scan(&leaked); err != nil || leaked != 0 {
		t.Fatal("RLS context leaked from the transaction", err)
	}
	pending := makePrincipal("pending")
	pendingInput := company.Input{LastName: pending.LastName, FirstName: pending.FirstName, Phone: pending.Phone, Email: pending.Email, Role: "admin", Mode: "invite"}
	invited, err := c.Create(ctx, a.Subject, ta.ID, platform.Random(), pendingInput)
	if err != nil {
		t.Fatal(err)
	}
	oldURL, _ := url.Parse(invited.InvitationURL)
	oldToken := strings.TrimPrefix(oldURL.Fragment, "token=")
	newURL, err := s.Reissue(ctx, a, ta.ID, invited.Employee.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Resolve(ctx, oldToken); err == nil {
		t.Fatal("reissued invitation left old link active")
	}
	newParsed, _ := url.Parse(newURL)
	newToken := strings.TrimPrefix(newParsed.Fragment, "token=")
	if _, err = s.Resolve(ctx, newToken); err != nil {
		t.Fatal(err)
	}
	if err = s.Revoke(ctx, a, ta.ID, invited.Employee.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Accept(ctx, pending, newToken); err == nil {
		t.Fatal("revoked invitation accepted")
	}
	// Expiry is checked against persisted state, not a client timestamp.
	expiredUser := makePrincipal("expired")
	expired, err := c.Create(ctx, a.Subject, ta.ID, platform.Random(), company.Input{LastName: expiredUser.LastName, FirstName: expiredUser.FirstName, Phone: expiredUser.Phone, Email: expiredUser.Email, Role: "user", Mode: "invite"})
	if err != nil {
		t.Fatal(err)
	}
	expiredURL, _ := url.Parse(expired.InvitationURL)
	expiredToken := strings.TrimPrefix(expiredURL.Fragment, "token=")
	err = db.Within(ctx, ta.ID, func(ctx context.Context) error {
		_, err := db.Q(ctx).Exec(ctx, "UPDATE settings.invitations SET expires_at=now()-interval '1 second' WHERE employee_id=$1", expired.Employee.ID)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Resolve(ctx, expiredToken); err == nil {
		t.Fatal("expired invitation resolved")
	}
	if _, err = s.Accept(ctx, expiredUser, expiredToken); err == nil {
		t.Fatal("expired invitation accepted")
	}
}
func digits(value string) string {
	var b strings.Builder
	for _, v := range value {
		b.WriteByte(byte(v%10) + '0')
	}
	return b.String()
}
