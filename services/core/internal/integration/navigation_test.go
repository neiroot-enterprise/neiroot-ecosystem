package integration

import (
	"context"
	"fmt"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	"neiroot/internal/security"
	companyPG "neiroot/services/core/internal/modules/company/adapters/outbound"
	company "neiroot/services/core/internal/modules/company/application"
	settingsPG "neiroot/services/core/internal/modules/settings/adapters/outbound"
	settings "neiroot/services/core/internal/modules/settings/application"
	"neiroot/services/core/internal/modules/settings/domain"
	"os"
	"reflect"
	"sync"
	"testing"
)

func TestNavigationRealPostgres(t *testing.T) {
	connection := os.Getenv("NEIROOT_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("requires isolated PostgreSQL")
	}
	ctx := context.Background()
	db, err := storage.Open(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Pool.Close()
	var privileged bool
	if err = db.Pool.QueryRow(ctx, "SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user").Scan(&privileged); err != nil || privileged {
		t.Fatal("requires restricted application role", err)
	}
	access := &settings.Service{Repo: &settingsPG.Repository{DB: db}, Tx: db}
	access.Employees = &company.Service{Repo: &companyPG.Repository{DB: db}, Tx: db, Access: access}
	service := &settings.NavigationService{Repo: &settingsPG.NavigationRepository{DB: db}, Tx: db, Access: access}
	actor := func(label string) security.Principal {
		id := platform.UUID()
		return security.Principal{Subject: "nav-" + id, FullName: "Navigation " + label, LastName: "Navigation", FirstName: label, Phone: "+7900" + digits(id[:10]), Email: id + "@example.test"}
	}
	a, b, outsider := actor("A"), actor("B"), actor("Outside")
	ta, err := access.Onboard(ctx, a, "Navigation A")
	if err != nil {
		t.Fatal(err)
	}
	tb, err := access.Onboard(ctx, b, "Navigation B")
	if err != nil {
		t.Fatal(err)
	}
	// The same account participates in both ecosystems, with a regular user role in A.
	if err = db.Within(ctx, ta.ID, func(ctx context.Context) error {
		_, err := db.Q(ctx).Exec(ctx, "INSERT INTO settings.memberships(tenant_id,employee_id,subject,email,role) VALUES($1,$2,$3,$4,'user')", ta.ID, platform.UUID(), b.Subject, b.Email)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	read := func(p security.Principal, tenant string) domain.Navigation {
		t.Helper()
		v, e := service.Read(ctx, p, tenant)
		if e != nil {
			t.Fatal(e)
		}
		return v
	}
	save := func(p security.Principal, tenant, module string, items []string) {
		t.Helper()
		if _, e := service.Save(ctx, p, tenant, module, items); e != nil {
			t.Fatal(e)
		}
	}
	initial := read(a, ta.ID)
	if !reflect.DeepEqual(initial, domain.NavigationDefaults()) {
		t.Fatal("wrong initial navigation", initial)
	}
	modules := []string{"settings", "sales", "money", "company"}
	sections := []string{"partners", "counterparties", "contracts", "organizations", "employees", "businesses", "structure"}
	var wg sync.WaitGroup
	errors := make(chan error, 2)
	for _, q := range []struct {
		module string
		items  []string
	}{{"", modules}, {"company", sections}} {
		wg.Add(1)
		go func(module string, items []string) {
			defer wg.Done()
			_, e := service.Save(ctx, a, ta.ID, module, items)
			errors <- e
		}(q.module, q.items)
	}
	wg.Wait()
	close(errors)
	for e := range errors {
		if e != nil {
			t.Fatal(e)
		}
	}
	got := read(a, ta.ID)
	if !reflect.DeepEqual(got.Modules, modules) || !reflect.DeepEqual(got.Sections["company"], sections) {
		t.Fatal("independent concurrent saves lost data", got)
	}
	if !reflect.DeepEqual(read(b, ta.ID), initial) || !reflect.DeepEqual(read(b, tb.ID), initial) {
		t.Fatal("preferences leaked to another user or ecosystem")
	}
	save(b, ta.ID, "money", []string{"payroll", "loans", "banks", "cash"})
	if read(b, ta.ID).Sections["money"][0] != "payroll" || read(b, tb.ID).Sections["money"][0] != "cash" {
		t.Fatal("regular user or tenant scope failed")
	}
	save(a, ta.ID, "", initial.Modules)
	if !reflect.DeepEqual(read(a, ta.ID).Modules, initial.Modules) || !reflect.DeepEqual(read(a, ta.ID).Sections["company"], sections) {
		t.Fatal("last write or independent lists failed")
	}
	for _, module := range []string{"company", "sales"} {
		if _, e := service.Save(ctx, a, ta.ID, module, []string{"cash"}); e == nil {
			t.Fatal("cross-module section accepted")
		}
	}
	if _, e := service.Save(ctx, a, ta.ID, "", []string{"company", "company"}); e == nil {
		t.Fatal("duplicate accepted")
	}
	if _, e := service.Read(ctx, outsider, ta.ID); e == nil {
		t.Fatal("outsider read allowed")
	}
	if _, e := service.Save(ctx, outsider, ta.ID, "", modules); e == nil {
		t.Fatal("outsider write allowed")
	}
	// Enforce both RLS dimensions even if a repository caller supplies another subject.
	if err = db.Within(db.ForSubject(ctx, b.Subject), ta.ID, func(ctx context.Context) error {
		var n int
		if e := db.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM settings.navigation_orders WHERE subject=$1", a.Subject).Scan(&n); e != nil {
			return e
		}
		if n != 0 {
			return fmt.Errorf("RLS exposed another account")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err = db.Within(db.ForSubject(ctx, a.Subject), tb.ID, func(ctx context.Context) error {
		var n int
		if e := db.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM settings.navigation_orders WHERE tenant_id=$1", ta.ID).Scan(&n); e != nil {
			return e
		}
		if n != 0 {
			return fmt.Errorf("RLS exposed another ecosystem")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err = db.Within(db.ForSubject(ctx, b.Subject), ta.ID, func(ctx context.Context) error {
		return (&settingsPG.NavigationRepository{DB: db}).Save(ctx, ta.ID, a.Subject, "modules", modules)
	}); err == nil {
		t.Fatal("RLS allowed writing another user's order")
	}
	// Read-time normalization also handles removed sections and newly added ones.
	if err = db.Within(db.ForSubject(ctx, a.Subject), ta.ID, func(ctx context.Context) error {
		return (&settingsPG.NavigationRepository{DB: db}).Save(ctx, ta.ID, a.Subject, "sections:company", []string{"removed", "employees"})
	}); err != nil {
		t.Fatal(err)
	}
	got = read(a, ta.ID)
	if got.Sections["company"][0] != "employees" || len(got.Sections["company"]) != 7 {
		t.Fatal("catalog evolution failed", got)
	}
	t.Log("personal preferences, users, tenants, regular role, concurrent independent writes, last write, validation and RLS passed")
}
