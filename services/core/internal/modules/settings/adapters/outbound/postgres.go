package outbound

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"neiroot/internal/platform"
	"neiroot/internal/platform/storage"
	app "neiroot/services/core/internal/modules/settings/application"
	"neiroot/services/core/internal/modules/settings/domain"
)

type Repository struct {
	DB               *storage.DB
	InvitationCipher *InvitationCipher
}

func (r *Repository) ListTenants(ctx context.Context, sub string) ([]domain.Tenant, error) {
	rows, err := r.DB.Q(ctx).Query(ctx, "SELECT t.id::text,t.name,m.role FROM settings.tenants t JOIN settings.memberships m ON m.tenant_id=t.id WHERE m.subject=$1 ORDER BY t.created_at,t.id", sub)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Tenant{}
	for rows.Next() {
		var t domain.Tenant
		if err = rows.Scan(&t.ID, &t.Name, &t.Role); err != nil {
			return nil, err
		}
		items = append(items, t)
	}
	return items, rows.Err()
}
func (r *Repository) OwnerTenant(ctx context.Context, sub string) (domain.Tenant, bool, error) {
	var t domain.Tenant
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT id::text,name,'owner' FROM settings.tenants WHERE owner_sub=$1", sub).Scan(&t.ID, &t.Name, &t.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, false, nil
	}
	return t, err == nil, err
}
func (r *Repository) LockOwner(ctx context.Context, sub string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "onboard:"+sub)
	return err
}
func (r *Repository) CreateTenant(ctx context.Context, t domain.Tenant, sub string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "INSERT INTO settings.tenants(id,name,owner_sub) VALUES($1,$2,$3)", t.ID, t.Name, sub)
	return err
}
func (r *Repository) TenantName(ctx context.Context, id string) (string, error) {
	var name string
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT name FROM settings.tenants WHERE id=$1", id).Scan(&name)
	return name, err
}
func (r *Repository) Role(ctx context.Context, t, sub string) (domain.Role, error) {
	var role domain.Role
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT role FROM settings.memberships WHERE tenant_id=$1 AND subject=$2", t, sub).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return role, platform.Fail(403, "tenant_forbidden", "Нет доступа к этой экосистеме.")
	}
	return role, err
}
func (r *Repository) EnsureGrant(ctx context.Context, t, e, email string, role domain.Role, sub string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "INSERT INTO settings.memberships(tenant_id,employee_id,email,role,subject) VALUES($1,$2,$3,$4,nullif($5,''))", t, e, email, role, sub)
	return err
}
func (r *Repository) Grants(ctx context.Context, t string, ids []string) (map[string]domain.Grant, error) {
	result := map[string]domain.Grant{}
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := r.DB.Q(ctx).Query(ctx, `SELECT m.employee_id::text,coalesce(m.subject,''),m.email,m.role,coalesce((SELECT CASE WHEN i.accepted_by IS NOT NULL THEN 'accepted' WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at<=now() THEN 'expired' ELSE 'pending' END FROM settings.invitations i WHERE i.tenant_id=m.tenant_id AND i.employee_id=m.employee_id ORDER BY i.created_at DESC,i.id DESC LIMIT 1),'') FROM settings.memberships m WHERE m.tenant_id=$1 AND m.employee_id=ANY($2::uuid[])`, t, ids)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var g domain.Grant
		if err = rows.Scan(&g.EmployeeID, &g.Subject, &g.Email, &g.Role, &g.InvitationState); err != nil {
			return result, err
		}
		result[g.EmployeeID] = g
	}
	return result, rows.Err()
}
func (r *Repository) Activate(ctx context.Context, t, e, sub string) error {
	tag, err := r.DB.Q(ctx).Exec(ctx, "UPDATE settings.memberships SET subject=$3 WHERE tenant_id=$1 AND employee_id=$2 AND (subject IS NULL OR subject=$3)", t, e, sub)
	if storage.Conflict(err) {
		return platform.Fail(409, "account_already_linked", "Аккаунт уже подключён к этой экосистеме.")
	}
	if err == nil && tag.RowsAffected() != 1 {
		return platform.Fail(409, "already_active", "Карточка уже связана с другим аккаунтом.")
	}
	return err
}
func (r *Repository) ChangeRole(ctx context.Context, t, e string, role domain.Role) error {
	var current domain.Role
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT role FROM settings.memberships WHERE tenant_id=$1 AND employee_id=$2 FOR UPDATE", t, e).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return platform.Fail(404, "employee_not_found", "Сотрудник не найден.")
	}
	if err != nil {
		return err
	}
	if current == domain.Owner {
		return platform.Fail(403, "owner_protected", "Роль владельца нельзя изменить.")
	}
	_, err = r.DB.Q(ctx).Exec(ctx, "UPDATE settings.memberships SET role=$3 WHERE tenant_id=$1 AND employee_id=$2", t, e, role)
	return err
}
func (r *Repository) Issue(ctx context.Context, i app.Invitation) error {
	encrypted, err := r.InvitationCipher.Encrypt(i)
	if err != nil {
		return err
	}
	if err := r.Revoke(ctx, i.TenantID, i.EmployeeID); err != nil {
		return err
	}
	_, err = r.DB.Q(ctx).Exec(ctx, "INSERT INTO settings.invitations(id,tenant_id,employee_id,token_hash,email,expires_at,token_ciphertext,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())", i.ID, i.TenantID, i.EmployeeID, i.Hash, i.Email, i.ExpiresAt, encrypted)
	return err
}

func (r *Repository) CurrentInvitation(ctx context.Context, tenant, employee string) (app.Invitation, error) {
	var i app.Invitation
	var encrypted []byte
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT id::text,tenant_id::text,employee_id::text,email,token_hash,expires_at,coalesce(accepted_by,''),revoked_at IS NOT NULL,token_ciphertext FROM settings.invitations WHERE tenant_id=$1 AND employee_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1", tenant, employee).Scan(&i.ID, &i.TenantID, &i.EmployeeID, &i.Email, &i.Hash, &i.ExpiresAt, &i.AcceptedBy, &i.Revoked, &encrypted)
	if errors.Is(err, pgx.ErrNoRows) {
		return i, platform.Fail(404, "invitation_not_found", "Приглашение не найдено.")
	}
	if err != nil {
		return i, err
	}
	// Missing ciphertext is handled after the application checks invitation state.
	if len(encrypted) == 0 {
		return i, nil
	}
	i.Token, err = r.InvitationCipher.Decrypt(i, encrypted)
	if err != nil {
		return i, platform.Fail(503, "invitation_unavailable", "Не удалось загрузить ссылку приглашения.")
	}
	return i, nil
}
func (r *Repository) LockGrant(ctx context.Context, tenant, employee string) error {
	var id string
	err := r.DB.Q(ctx).QueryRow(ctx, "SELECT employee_id::text FROM settings.memberships WHERE tenant_id=$1 AND employee_id=$2 FOR UPDATE", tenant, employee).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return platform.Fail(404, "employee_not_found", "Сотрудник не найден.")
	}
	return err
}
func (r *Repository) Lookup(ctx context.Context, hash string, lock bool) (app.Invitation, error) {
	var i app.Invitation
	query := "SELECT id::text,tenant_id::text,employee_id::text,email,token_hash,expires_at,coalesce(accepted_by,''),revoked_at IS NOT NULL FROM settings.invitations WHERE token_hash=$1"
	if lock {
		query += " FOR UPDATE"
	}
	err := r.DB.Q(ctx).QueryRow(ctx, query, hash).Scan(&i.ID, &i.TenantID, &i.EmployeeID, &i.Email, &i.Hash, &i.ExpiresAt, &i.AcceptedBy, &i.Revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		err = platform.Fail(404, "invitation_not_found", "Приглашение не найдено.")
	}
	return i, err
}
func (r *Repository) Accept(ctx context.Context, id, sub string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "UPDATE settings.invitations SET accepted_by=$2,token_ciphertext=NULL WHERE id=$1", id, sub)
	return err
}
func (r *Repository) Revoke(ctx context.Context, t, e string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, "UPDATE settings.invitations SET revoked_at=now(),token_ciphertext=NULL WHERE tenant_id=$1 AND employee_id=$2 AND accepted_by IS NULL AND revoked_at IS NULL", t, e)
	return err
}
