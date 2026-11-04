package outbound

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	"neiroot/services/core/internal/modules/company/domain"
)

type Repository struct{ DB *storage.DB }

const columns = "id::text,tenant_id::text,full_name,last_name,first_name,middle_name,phone,email,coalesce(subject,''),access_state,idempotency_key,created_at"

func scan(row pgx.Row) (domain.Employee, error) {
	var e domain.Employee
	err := row.Scan(&e.ID, &e.TenantID, &e.FullName, &e.LastName, &e.FirstName, &e.MiddleName, &e.Phone, &e.Email, &e.Subject, &e.AccessState, &e.IdempotencyKey, &e.CreatedAt)
	return e, err
}
func (r *Repository) Lock(ctx context.Context, t, key string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", t+":"+key)
	return err
}
func (r *Repository) Create(ctx context.Context, e domain.Employee) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "INSERT INTO company.employees(id,tenant_id,full_name,phone,email,subject,access_state,idempotency_key,last_name,first_name,middle_name) VALUES($1,$2,$3,$4,$5,nullif($6,''),$7,$8,$9,$10,$11)", e.ID, e.TenantID, e.FullName, e.Phone, e.Email, e.Subject, e.AccessState, e.IdempotencyKey, e.LastName, e.FirstName, e.MiddleName)
	if storage.Conflict(err) {
		return platform.Fail(409, "employee_exists", "Сотрудник с таким email или телефоном уже существует.")
	}
	return err
}
func (r *Repository) Get(ctx context.Context, t, id string) (domain.Employee, error) {
	e, err := scan(r.DB.Q(ctx).QueryRow(ctx, "SELECT "+columns+" FROM company.employees WHERE tenant_id=$1 AND id=$2", t, id))
	if errors.Is(err, pgx.ErrNoRows) {
		err = platform.Fail(404, "employee_not_found", "Сотрудник не найден.")
	}
	return e, err
}
func (r *Repository) ByKey(ctx context.Context, t, key string) (domain.Employee, bool, error) {
	e, err := scan(r.DB.Q(ctx).QueryRow(ctx, "SELECT "+columns+" FROM company.employees WHERE tenant_id=$1 AND idempotency_key=$2", t, key))
	if errors.Is(err, pgx.ErrNoRows) {
		return e, false, nil
	}
	return e, err == nil, err
}
func (r *Repository) List(ctx context.Context, t, search string, limit, offset int) ([]domain.Employee, int, error) {
	var total int
	filter := "tenant_id=$1 AND ($2='' OR full_name ILIKE '%'||$2||'%' OR email ILIKE '%'||$2||'%' OR phone ILIKE '%'||$2||'%')"
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM company.employees WHERE "+filter, t, search).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.DB.Q(ctx).Query(ctx, "SELECT "+columns+" FROM company.employees WHERE "+filter+" ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4", t, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []domain.Employee{}
	for rows.Next() {
		e, err := scan(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, e)
	}
	return items, total, rows.Err()
}
func (r *Repository) Link(ctx context.Context, t, id, sub, state string) error {
	// A failed concurrent retry must not disconnect an account activated by another request.
	_, err := r.DB.Q(ctx).Exec(ctx, "UPDATE company.employees SET subject=nullif($3,''),access_state=$4 WHERE tenant_id=$1 AND id=$2 AND ($4<>'error' OR subject IS NULL)", t, id, sub, state)
	if storage.Conflict(err) {
		return platform.Fail(409, "account_already_linked", "Этот аккаунт уже связан с другим сотрудником экосистемы.")
	}
	return err
}
