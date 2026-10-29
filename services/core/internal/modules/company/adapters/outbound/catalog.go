package outbound

import (
	"context"
	"encoding/json"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	"neiroot/services/core/internal/modules/company/domain"
)

// Catalog writes take a tenant advisory lock before reading the graph. Shared read
// locks provide a consistent multi-query snapshot; business rows are also locked
// for writes. All queries still pass through the tenant-scoped RLS transaction.
func (r *Repository) CatalogLock(ctx context.Context, t, b string, write bool) error {
	fn := "pg_advisory_xact_lock_shared"
	if write {
		fn = "pg_advisory_xact_lock"
	}
	if _, err := r.DB.Q(ctx).Exec(ctx, "SELECT "+fn+"(hashtextextended($1,73))", t); err != nil {
		return err
	}
	if write && b != "" {
		_, err := r.DB.Q(ctx).Exec(ctx, "SELECT id FROM company.businesses WHERE tenant_id=$1 AND id=$2 FOR UPDATE", t, b)
		return err
	}
	return nil
}
func (r *Repository) CatalogLoad(ctx context.Context, t string) (domain.Catalog, error) {
	c := domain.Catalog{Businesses: map[string]domain.CatalogItem{}, Departments: map[string]domain.CatalogItem{}, Organizations: map[string]domain.CatalogItem{}, Assignments: []domain.Assignment{}, OrganizationLinks: []domain.OrganizationLink{}}
	for _, kind := range []string{"businesses", "departments", "organizations"} {
		columns := "'id',id,'name',name,'archived',archived,'createdAt',created_at"
		if kind == "departments" {
			columns += ",'businessId',business_id,'parentId',parent_id,'position',position"
		}
		if kind == "organizations" {
			columns += ",'inn',inn"
		}
		var raw []byte
		if err := r.DB.Q(ctx).QueryRow(ctx, "SELECT coalesce(jsonb_object_agg(id,jsonb_build_object("+columns+")), '{}'::jsonb) FROM company."+kind+" WHERE tenant_id=$1", t).Scan(&raw); err != nil {
			return c, err
		}
		dest := c.Businesses
		if kind == "departments" {
			dest = c.Departments
		}
		if kind == "organizations" {
			dest = c.Organizations
		}
		if err := json.Unmarshal(raw, &dest); err != nil {
			return c, err
		}
	}
	var raw []byte
	err := r.DB.Q(ctx).QueryRow(ctx, `SELECT coalesce(jsonb_agg(jsonb_build_object('businessId',a.business_id,'departmentId',a.department_id,'employeeId',a.employee_id,'employeeName',e.full_name)), '[]'::jsonb)
 FROM (SELECT tenant_id,business_id,NULL::uuid department_id,employee_id FROM company.business_employees WHERE tenant_id=$1
 UNION ALL SELECT tenant_id,business_id,department_id,employee_id FROM company.department_employees WHERE tenant_id=$1) a
 JOIN company.employees e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id`, t).Scan(&raw)
	if err != nil {
		return c, err
	}
	if err = json.Unmarshal(raw, &c.Assignments); err != nil {
		return c, err
	}
	err = r.DB.Q(ctx).QueryRow(ctx, `SELECT coalesce(jsonb_agg(jsonb_build_object('businessId',business_id,'organizationId',organization_id)), '[]'::jsonb) FROM company.business_organizations WHERE tenant_id=$1`, t).Scan(&raw)
	if err != nil {
		return c, err
	}
	err = json.Unmarshal(raw, &c.OrganizationLinks)
	return c, err
}
func (r *Repository) CatalogPut(ctx context.Context, t, kind string, e domain.CatalogItem) error {
	var err error
	switch kind {
	case "businesses":
		_, err = r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.businesses(id,tenant_id,name,archived,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,archived=excluded.archived WHERE company.businesses.tenant_id=$2`, e.ID, t, e.Name, e.Archived, e.CreatedAt)
	case "organizations":
		_, err = r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.organizations(id,tenant_id,name,inn,archived,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,inn=excluded.inn,archived=excluded.archived WHERE company.organizations.tenant_id=$2`, e.ID, t, e.Name, e.INN, e.Archived, e.CreatedAt)
	case "departments":
		_, err = r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.departments(id,tenant_id,business_id,parent_id,name,position,archived,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,position=excluded.position,archived=excluded.archived WHERE company.departments.tenant_id=$2 AND company.departments.business_id=$3`, e.ID, t, e.BusinessID, e.ParentID, e.Name, e.Position, e.Archived, e.CreatedAt)
	default:
		return platform.Fail(422, "invalid_kind", "Неизвестный справочник.")
	}
	if err != nil && isUnique(err) {
		return platform.Fail(409, "catalog_conflict", "Наименование уже занято на этом уровне или ИНН уже существует, в том числе в архиве.")
	}
	return err
}
func isUnique(err error) bool { return storage.Conflict(err) }
func (r *Repository) CatalogEmployee(ctx context.Context, t, id string) error {
	_, err := r.Get(ctx, t, id)
	return err
}
func (r *Repository) CatalogAssign(ctx context.Context, t, b, d, e string, add bool) error {
	if add {
		if _, err := r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.business_employees VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, t, b, e); err != nil {
			return err
		}
		if d != "" {
			_, err := r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.department_employees VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, t, b, d, e)
			return err
		}
		return nil
	}
	if d == "" {
		if _, err := r.DB.Q(ctx).Exec(ctx, `DELETE FROM company.department_employees WHERE tenant_id=$1 AND business_id=$2 AND employee_id=$3`, t, b, e); err != nil {
			return err
		}
		_, err := r.DB.Q(ctx).Exec(ctx, `DELETE FROM company.business_employees WHERE tenant_id=$1 AND business_id=$2 AND employee_id=$3`, t, b, e)
		return err
	}
	_, err := r.DB.Q(ctx).Exec(ctx, `DELETE FROM company.department_employees WHERE tenant_id=$1 AND business_id=$2 AND department_id=$3 AND employee_id=$4`, t, b, d, e)
	return err
}
func (r *Repository) CatalogLink(ctx context.Context, t, b, o string, add bool) error {
	if add {
		_, err := r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.business_organizations VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, t, b, o)
		return err
	}
	_, err := r.DB.Q(ctx).Exec(ctx, `DELETE FROM company.business_organizations WHERE tenant_id=$1 AND business_id=$2 AND organization_id=$3`, t, b, o)
	return err
}
func (r *Repository) CatalogRequest(ctx context.Context, t, kind, key string) (string, string, error) {
	var id, fp string
	err := r.DB.Q(ctx).QueryRow(ctx, `SELECT coalesce(max(item_id::text),''),coalesce(max(fingerprint),'') FROM company.catalog_requests WHERE tenant_id=$1 AND kind=$2 AND request_key=$3`, t, kind, key).Scan(&id, &fp)
	return id, fp, err
}
func (r *Repository) CatalogRemember(ctx context.Context, t, kind, key, id, fp string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, `INSERT INTO company.catalog_requests VALUES($1,$2,$3,$4,$5)`, t, kind, key, fp, id)
	return err
}
