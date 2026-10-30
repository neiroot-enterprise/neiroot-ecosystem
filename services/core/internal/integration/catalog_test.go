package integration

import (
	"context"
	"fmt"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	"neiroot/internal/security"
	pg "neiroot/services/core/internal/modules/company/adapters/outbound"
	app "neiroot/services/core/internal/modules/company/application"
	"neiroot/services/core/internal/modules/company/domain"
	settingsPG "neiroot/services/core/internal/modules/settings/adapters/outbound"
	settings "neiroot/services/core/internal/modules/settings/application"
	"os"
	"sync"
	"testing"
)

func TestCatalogRealPostgres(t *testing.T) {
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
	var bypass, super bool
	if err = db.Pool.QueryRow(ctx, "SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user").Scan(&bypass, &super); err != nil || bypass || super {
		t.Fatal("must use RLS application role", err)
	}
	settingsService := &settings.Service{Repo: &settingsPG.Repository{DB: db}, Tx: db}
	employees := &app.Service{Repo: &pg.Repository{DB: db}, Tx: db, Access: settingsService}
	settingsService.Employees = employees
	service := &app.CatalogService{Repo: &pg.Repository{DB: db}, Tx: db, Access: settingsService}
	suffix := platform.UUID()
	owner := security.Principal{Subject: "catalog-" + suffix, LastName: "Тест", FirstName: "Структура", FullName: "Тест Структура", Phone: "+7900" + digits(suffix[:10]), Email: suffix + "@example.test"}
	tenant, err := settingsService.Onboard(ctx, owner, "Catalog integration")
	if err != nil {
		t.Fatal(err)
	}
	run := func(q app.CatalogCommand) (any, error) {
		q.Tenant = tenant.ID
		if q.Subject == "" {
			q.Subject = owner.Subject
		}
		return service.Execute(ctx, q)
	}
	name := func(s string) *string { return &s }
	must := func(q app.CatalogCommand) any {
		t.Helper()
		v, e := run(q)
		if e != nil {
			t.Fatalf("%s %s: %v", q.Kind, q.Action, e)
		}
		return v
	}
	fail := func(q app.CatalogCommand) {
		t.Helper()
		if _, e := run(q); e == nil {
			t.Fatalf("expected rejection: %+v", q)
		}
	}
	create := func(kind, n, b string, parent *string) domain.CatalogItem {
		t.Helper()
		return must(app.CatalogCommand{Action: "create", Kind: kind, BusinessID: b, Key: platform.Random(), Input: app.CatalogInput{Name: name(n), ParentID: parent}}).(domain.CatalogItem)
	}
	b := create("businesses", "Основное", "", nil)
	b2 := create("businesses", "Второе", "", nil)
	fail(app.CatalogCommand{Action: "create", Kind: "businesses", Key: platform.Random(), Input: app.CatalogInput{Name: name(" основное ")}})
	key := platform.Random()
	repeat := app.CatalogCommand{Action: "create", Kind: "businesses", Key: key, Input: app.CatalogInput{Name: name("Повтор")}}
	r1 := must(repeat).(domain.CatalogItem)
	r2 := must(repeat).(domain.CatalogItem)
	if r1.ID != r2.ID {
		t.Fatal("idempotency duplicated entity")
	}
	repeat.Input.Name = name("Другое")
	fail(repeat)
	parent := create("departments", "Головной", b.ID, nil)
	child := create("departments", "Дочерний", b.ID, &parent.ID)
	leaf := create("departments", "Лист", b.ID, &child.ID)
	neighbor := create("departments", "Соседний", b.ID, nil)
	fail(app.CatalogCommand{Action: "move", Kind: "departments", BusinessID: b.ID, ID: parent.ID, Input: app.CatalogInput{ParentID: &leaf.ID}})
	foreign := create("departments", "Чужой", b2.ID, nil)
	fail(app.CatalogCommand{Action: "move", Kind: "departments", BusinessID: b.ID, ID: child.ID, Input: app.CatalogInput{ParentID: &foreign.ID}})
	moved := must(app.CatalogCommand{Action: "move", Kind: "departments", BusinessID: b.ID, ID: child.ID, Input: app.CatalogInput{BeforeID: &parent.ID}}).(domain.CatalogItem)
	if moved.ParentID != nil || moved.Position != 0 {
		t.Fatal("root move failed")
	}
	must(app.CatalogCommand{Action: "update", Kind: "departments", BusinessID: b.ID, ID: neighbor.ID, Input: app.CatalogInput{Name: name("Новое имя")}})
	fail(app.CatalogCommand{Action: "update", Kind: "departments", BusinessID: b.ID, ID: neighbor.ID, Input: app.CatalogInput{Name: name("Дочерний")}})
	var employeeID string
	if err = db.Within(ctx, tenant.ID, func(ctx context.Context) error {
		return db.Q(ctx).QueryRow(ctx, "SELECT id::text FROM company.employees WHERE tenant_id=$1", tenant.ID).Scan(&employeeID)
	}); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{child.ID, leaf.ID} {
		must(app.CatalogCommand{Action: "assign", Kind: "departments", BusinessID: b.ID, ID: d, EmployeeID: employeeID})
	}
	must(app.CatalogCommand{Action: "assign", Kind: "businesses", BusinessID: b2.ID, ID: b2.ID, EmployeeID: employeeID})
	must(app.CatalogCommand{Action: "assign", Kind: "departments", BusinessID: b.ID, ID: child.ID, EmployeeID: employeeID})
	assignments := must(app.CatalogCommand{Action: "employeeAssignments", Kind: "businesses", EmployeeID: employeeID, Status: "all"}).(app.AssignmentList)
	if len(assignments.Items) != 4 {
		t.Fatalf("expected 2 enterprises and 2 departments, got %d", len(assignments.Items))
	}
	// Employee-card batches preserve unrelated membership and are repeatable.
	batchBusiness := create("businesses", "Пакетное назначение", "", nil)
	target := func(b, d string) app.AssignmentTarget { return app.AssignmentTarget{BusinessID: b, DepartmentID: d} }
	batch := func(add, remove []app.AssignmentTarget) app.CatalogCommand {
		return app.CatalogCommand{Action: "updateAssignments", Kind: "businesses", EmployeeID: employeeID, Assignments: app.AssignmentChanges{Add: add, Remove: remove}}
	}
	countAssignments := func(want int) {
		t.Helper()
		got := must(app.CatalogCommand{Action: "employeeAssignments", Kind: "businesses", EmployeeID: employeeID, Status: "all"}).(app.AssignmentList)
		if len(got.Items) != want {
			t.Fatalf("batch assignments: got %d, want %d", len(got.Items), want)
		}
	}
	change := batch([]app.AssignmentTarget{target(b.ID, neighbor.ID), target(batchBusiness.ID, "")}, []app.AssignmentTarget{target(b.ID, leaf.ID)})
	must(change)
	must(change)
	countAssignments(5)
	must(batch([]app.AssignmentTarget{target(b.ID, leaf.ID)}, []app.AssignmentTarget{target(b.ID, neighbor.ID), target(batchBusiness.ID, "")}))
	countAssignments(4)
	fail(batch([]app.AssignmentTarget{target(b.ID, neighbor.ID), target(b.ID, foreign.ID)}, nil))
	fail(batch([]app.AssignmentTarget{target(b.ID, neighbor.ID)}, []app.AssignmentTarget{target(b.ID, neighbor.ID)}))
	fail(batch([]app.AssignmentTarget{target(b.ID, neighbor.ID)}, []app.AssignmentTarget{target(b.ID, "")}))
	countAssignments(4)
	// Fail on the second real SQL write to prove rollback after a partial batch.
	failingService := &app.CatalogService{Repo: &failingAssignmentRepository{CatalogRepository: service.Repo}, Tx: db, Access: settingsService}
	rollback := batch(nil, []app.AssignmentTarget{target(b.ID, child.ID), target(b.ID, leaf.ID)})
	rollback.Tenant, rollback.Subject = tenant.ID, owner.Subject
	if _, err = failingService.Execute(ctx, rollback); err == nil {
		t.Fatal("expected injected storage failure")
	}
	countAssignments(4)
	// An ordinary member can read but cannot create, rename or archive.
	ordinary := "ordinary-" + suffix
	if err = db.Within(ctx, tenant.ID, func(ctx context.Context) error {
		_, err := db.Q(ctx).Exec(ctx, "INSERT INTO settings.memberships(tenant_id,employee_id,subject,email,role) VALUES($1,$2,$3,$4,'user')", tenant.ID, platform.UUID(), ordinary, ordinary+"@example.test")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	must(app.CatalogCommand{Action: "list", Kind: "businesses", Subject: ordinary})
	forbiddenBatch := batch([]app.AssignmentTarget{target(b.ID, neighbor.ID)}, nil)
	forbiddenBatch.Subject = ordinary
	fail(forbiddenBatch)
	for _, action := range []string{"update", "archive", "restore"} {
		fail(app.CatalogCommand{Action: action, Kind: "businesses", ID: b.ID, Subject: ordinary, Input: app.CatalogInput{Name: name("Forbidden")}})
	}
	fail(app.CatalogCommand{Action: "create", Kind: "businesses", Subject: ordinary, Key: platform.Random(), Input: app.CatalogInput{Name: name("Forbidden")}})
	// INN uniqueness survives archive; organization links are many-to-many.
	organization := must(app.CatalogCommand{Action: "create", Kind: "organizations", Key: platform.Random(), Input: app.CatalogInput{Name: name("Организация"), INN: name("7707083893")}}).(domain.CatalogItem)
	org2 := must(app.CatalogCommand{Action: "create", Kind: "organizations", Key: platform.Random(), Input: app.CatalogInput{Name: name("Организация"), INN: name("500100732259")}}).(domain.CatalogItem)
	fail(app.CatalogCommand{Action: "create", Kind: "organizations", Key: platform.Random(), Input: app.CatalogInput{Name: name("Неверный ИНН"), INN: name("7707083894")}})
	for _, pair := range [][2]string{{b.ID, organization.ID}, {b.ID, org2.ID}, {b2.ID, organization.ID}} {
		must(app.CatalogCommand{Action: "link", Kind: "businesses", BusinessID: pair[0], ID: pair[0], OrganizationID: pair[1]})
	}
	if list := must(app.CatalogCommand{Action: "organizations", Kind: "businesses", BusinessID: b.ID, ID: b.ID}).(app.CatalogList); list.Total != 2 {
		t.Fatal("many-to-many missing")
	}
	must(app.CatalogCommand{Action: "archive", Kind: "organizations", ID: organization.ID})
	fail(app.CatalogCommand{Action: "create", Kind: "organizations", Key: platform.Random(), Input: app.CatalogInput{Name: name("Дубль"), INN: name(organization.INN)}})
	if list := must(app.CatalogCommand{Action: "organizations", Kind: "businesses", BusinessID: b.ID, ID: b.ID}).(app.CatalogList); list.Total != 1 {
		t.Fatal("archived organization visible")
	}
	must(app.CatalogCommand{Action: "restore", Kind: "organizations", ID: organization.ID})
	// Independently archived children stay archived after parent/business restoration.
	must(app.CatalogCommand{Action: "archive", Kind: "departments", BusinessID: b.ID, ID: leaf.ID})
	fail(batch(nil, []app.AssignmentTarget{target(b.ID, leaf.ID)}))
	fail(batch([]app.AssignmentTarget{target(b.ID, leaf.ID)}, nil))
	must(app.CatalogCommand{Action: "archive", Kind: "departments", BusinessID: b.ID, ID: child.ID})
	fail(app.CatalogCommand{Action: "restore", Kind: "departments", BusinessID: b.ID, ID: leaf.ID})
	duplicate := create("departments", child.Name, b.ID, nil)
	fail(app.CatalogCommand{Action: "restore", Kind: "departments", BusinessID: b.ID, ID: child.ID})
	must(app.CatalogCommand{Action: "restore", Kind: "departments", BusinessID: b.ID, ID: child.ID, Input: app.CatalogInput{Name: name("Восстановленный")}})
	if e := must(app.CatalogCommand{Action: "get", Kind: "departments", BusinessID: b.ID, ID: leaf.ID}).(domain.CatalogItem); !e.Archived || !e.EffectiveArchived {
		t.Fatal("independent archive lost")
	}
	must(app.CatalogCommand{Action: "archive", Kind: "businesses", ID: b.ID, BusinessID: b.ID})
	fail(batch(nil, []app.AssignmentTarget{target(b.ID, "")}))
	fail(app.CatalogCommand{Action: "assign", Kind: "departments", BusinessID: b.ID, ID: duplicate.ID, EmployeeID: employeeID})
	create("businesses", b.Name, "", nil)
	fail(app.CatalogCommand{Action: "restore", Kind: "businesses", ID: b.ID, BusinessID: b.ID})
	must(app.CatalogCommand{Action: "restore", Kind: "businesses", ID: b.ID, BusinessID: b.ID, Input: app.CatalogInput{Name: name("Восстановленное предприятие")}})
	// Removing enterprise membership also removes assignments in archived departments.
	removeBusiness := batch(nil, []app.AssignmentTarget{target(b.ID, ""), target(b.ID, leaf.ID)})
	must(removeBusiness)
	must(removeBusiness)
	countAssignments(1)
	if err = db.Within(ctx, tenant.ID, func(ctx context.Context) error {
		var count int
		err := db.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM company.department_employees WHERE business_id=$1", b.ID).Scan(&count)
		if count != 0 {
			t.Fatal("archived assignment left behind")
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
	// Tenant and object substitution, including an actual other tenant and employee.
	other := owner
	other.Subject = "other-" + suffix
	other.Email = "other-" + owner.Email
	other.Phone = "+7901" + digits(suffix[:10])
	tenant2, err := settingsService.Onboard(ctx, other, "Other tenant")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Execute(ctx, app.CatalogCommand{Tenant: tenant2.ID, Subject: owner.Subject, Kind: "businesses", Action: "list"}); err == nil {
		t.Fatal("tenant access leaked")
	}
	foreignBusiness, err := service.Execute(ctx, app.CatalogCommand{Tenant: tenant2.ID, Subject: other.Subject, Kind: "businesses", Action: "create", Key: platform.Random(), Input: app.CatalogInput{Name: name("Other")}})
	if err != nil {
		t.Fatal(err)
	}
	fail(app.CatalogCommand{Kind: "businesses", Action: "get", ID: foreignBusiness.(domain.CatalogItem).ID})
	var otherEmployee string
	if err = db.Within(ctx, tenant2.ID, func(ctx context.Context) error {
		return db.Q(ctx).QueryRow(ctx, "SELECT id::text FROM company.employees WHERE tenant_id=$1", tenant2.ID).Scan(&otherEmployee)
	}); err != nil {
		t.Fatal(err)
	}
	fail(app.CatalogCommand{Action: "assign", Kind: "businesses", BusinessID: b.ID, ID: b.ID, EmployeeID: otherEmployee})
	foreignEmployeeBatch := batch([]app.AssignmentTarget{target(b.ID, "")}, nil)
	foreignEmployeeBatch.EmployeeID = otherEmployee
	fail(foreignEmployeeBatch)
	fail(batch([]app.AssignmentTarget{target(foreignBusiness.(domain.CatalogItem).ID, "")}, nil))
	if _, err = service.Execute(ctx, app.CatalogCommand{Tenant: tenant2.ID, Subject: owner.Subject, Kind: "businesses", Action: "updateAssignments", EmployeeID: otherEmployee}); err == nil {
		t.Fatal("batch tenant access leaked")
	}
	// Concurrent opposing moves cannot form a cycle.
	a := create("departments", "Concurrent A", b.ID, nil)
	z := create("departments", "Concurrent B", b.ID, nil)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, pair := range [][2]string{{a.ID, z.ID}, {z.ID, a.ID}} {
		wg.Add(1)
		go func(pair [2]string) {
			defer wg.Done()
			_, err := run(app.CatalogCommand{Action: "move", Kind: "departments", BusinessID: b.ID, ID: pair[0], Input: app.CatalogInput{ParentID: &pair[1]}})
			errs <- err
		}(pair)
	}
	wg.Wait()
	close(errs)
	failures := 0
	for err := range errs {
		if err != nil {
			failures++
		}
	}
	if failures != 1 {
		t.Fatalf("expected one cycle rejection, got %d", failures)
	}
	var leaked int
	if err = db.Pool.QueryRow(ctx, "SELECT count(*) FROM company.businesses").Scan(&leaked); err != nil || leaked != 0 {
		t.Fatal("RLS leaked without tenant", err)
	}
	t.Log(fmt.Sprintf("catalog, archives, links, assignments, concurrency and tenant isolation passed (%s)", tenant.ID))
}

type failingAssignmentRepository struct {
	app.CatalogRepository
	writes int
}

func (r *failingAssignmentRepository) CatalogAssign(ctx context.Context, tenant, business, department, employee string, add bool) error {
	r.writes++
	if r.writes == 2 {
		return fmt.Errorf("injected assignment storage failure")
	}
	return r.CatalogRepository.CatalogAssign(ctx, tenant, business, department, employee, add)
}
