package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"neiroot/internal/platform"
	"neiroot/internal/security"
	company "neiroot/services/core/internal/modules/company/application"
	"neiroot/services/core/internal/modules/settings/domain"
	"strings"
	"time"
)

type Invitation struct {
	ID, TenantID, EmployeeID, Email, Hash, AcceptedBy string
	ExpiresAt                                         time.Time
	Revoked                                           bool
}
type Repository interface {
	ListTenants(context.Context, string) ([]domain.Tenant, error)
	OwnerTenant(context.Context, string) (domain.Tenant, bool, error)
	CreateTenant(context.Context, domain.Tenant, string) error
	TenantName(context.Context, string) (string, error)
	Role(context.Context, string, string) (domain.Role, error)
	EnsureGrant(context.Context, string, string, string, domain.Role, string) error
	Grants(context.Context, string, []string) (map[string]domain.Grant, error)
	Activate(context.Context, string, string, string) error
	ChangeRole(context.Context, string, string, domain.Role) error
	Issue(context.Context, Invitation) error
	Lookup(context.Context, string, bool) (Invitation, error)
	Accept(context.Context, string, string) error
	Revoke(context.Context, string, string) error
	LockOwner(context.Context, string) error
	LockGrant(context.Context, string, string) error
}
type Transactions interface {
	Within(context.Context, string, func(context.Context) error) error
	ForSubject(context.Context, string) context.Context
	ForInvitation(context.Context, string) context.Context
}
type Employees interface {
	AddOwner(context.Context, string, security.Principal) (string, error)
	Link(context.Context, string, string, string) error
	Pending(context.Context, string, string) error
}
type Service struct {
	Repo      Repository
	Tx        Transactions
	Employees Employees
	PublicURL string
	Now       func() time.Time
}

func (s *Service) clock() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}
func hash(token string) string { v := sha256.Sum256([]byte(token)); return hex.EncodeToString(v[:]) }
func (s *Service) Authorize(ctx context.Context, tenant, subject string, manage bool) error {
	role, err := s.Repo.Role(ctx, tenant, subject)
	if err != nil {
		return err
	}
	if manage && !role.CanManage() {
		return platform.Fail(403, "forbidden", "Изменения доступны владельцу и администратору экосистемы.")
	}
	return nil
}
func (s *Service) EnsureGrant(ctx context.Context, tenant, employee, email, role string) error {
	return s.Repo.EnsureGrant(ctx, tenant, employee, email, domain.Role(role), "")
}
func (s *Service) Grants(ctx context.Context, tenant string, ids []string) (map[string]company.Grant, error) {
	items, err := s.Repo.Grants(ctx, tenant, ids)
	result := map[string]company.Grant{}
	for id, g := range items {
		result[id] = company.Grant{Role: string(g.Role), InvitationState: g.InvitationState}
	}
	return result, err
}
func (s *Service) Activate(ctx context.Context, tenant, employee, subject string) error {
	return s.Repo.Activate(ctx, tenant, employee, subject)
}
func (s *Service) ListTenants(ctx context.Context, p security.Principal) ([]domain.Tenant, error) {
	var items []domain.Tenant
	err := s.Tx.Within(s.Tx.ForSubject(ctx, p.Subject), "", func(ctx context.Context) error {
		var err error
		items, err = s.Repo.ListTenants(ctx, p.Subject)
		return err
	})
	return items, err
}
func (s *Service) Onboard(ctx context.Context, p security.Principal, name string) (domain.Tenant, error) {
	name = strings.TrimSpace(name)
	var tenant domain.Tenant
	if name == "" || len([]rune(name)) > 120 {
		return tenant, platform.Fail(422, "invalid_tenant_name", "Название экосистемы должно содержать от 1 до 120 символов.")
	}
	id := platform.UUID()
	ctx = s.Tx.ForSubject(ctx, p.Subject)
	err := s.Tx.Within(ctx, id, func(ctx context.Context) error {
		if err := s.Repo.LockOwner(ctx, p.Subject); err != nil {
			return err
		}
		existing, found, err := s.Repo.OwnerTenant(ctx, p.Subject)
		if err != nil {
			return err
		}
		if found {
			tenant = existing
			return nil
		}
		tenant = domain.Tenant{ID: id, Name: name, Role: domain.Owner}
		if err = s.Repo.CreateTenant(ctx, tenant, p.Subject); err != nil {
			return err
		}
		employee, err := s.Employees.AddOwner(ctx, id, p)
		if err != nil {
			return err
		}
		return s.Repo.EnsureGrant(ctx, id, employee, p.Email, domain.Owner, p.Subject)
	})
	return tenant, err
}
func (s *Service) ChangeRole(ctx context.Context, p security.Principal, tenant, employee, role string) error {
	if !domain.Role(role).Assignable() {
		return platform.Fail(422, "invalid_role", "Можно назначить только администратора или пользователя.")
	}
	return s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
		if err := s.Authorize(ctx, tenant, p.Subject, true); err != nil {
			return err
		}
		return s.Repo.ChangeRole(ctx, tenant, employee, domain.Role(role))
	})
}
func (s *Service) Issue(ctx context.Context, tenant, employee string) (string, error) {
	if err := s.Repo.LockGrant(ctx, tenant, employee); err != nil {
		return "", err
	}
	grants, err := s.Repo.Grants(ctx, tenant, []string{employee})
	if err != nil {
		return "", err
	}
	grant, ok := grants[employee]
	if !ok {
		return "", platform.Fail(404, "employee_not_found", "Сотрудник не найден.")
	}
	if grant.Subject != "" {
		return "", platform.Fail(409, "already_active", "Сотрудник уже подключён к экосистеме.")
	}
	token := platform.Random()
	inv := Invitation{ID: platform.UUID(), TenantID: tenant, EmployeeID: employee, Email: grant.Email, Hash: hash(token), ExpiresAt: s.clock().Add(7 * 24 * time.Hour)}
	return token, s.Repo.Issue(ctx, inv)
}
func (s *Service) Reissue(ctx context.Context, p security.Principal, tenant, employee string) (string, error) {
	var token string
	err := s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
		if err := s.Authorize(ctx, tenant, p.Subject, true); err != nil {
			return err
		}
		var err error
		token, err = s.Issue(ctx, tenant, employee)
		if err != nil {
			return err
		}
		return s.Employees.Pending(ctx, tenant, employee)
	})
	if err != nil {
		return "", err
	}
	return s.PublicURL + "/invite#token=" + token, nil
}
func (s *Service) Revoke(ctx context.Context, p security.Principal, tenant, employee string) error {
	return s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
		if err := s.Authorize(ctx, tenant, p.Subject, true); err != nil {
			return err
		}
		if err := s.Repo.LockGrant(ctx, tenant, employee); err != nil {
			return err
		}
		grants, err := s.Repo.Grants(ctx, tenant, []string{employee})
		if err != nil {
			return err
		}
		if _, ok := grants[employee]; !ok {
			return platform.Fail(404, "employee_not_found", "Сотрудник не найден.")
		}
		return s.Repo.Revoke(ctx, tenant, employee)
	})
}
func (s *Service) lookup(ctx context.Context, token string) (Invitation, error) {
	var inv Invitation
	if len(token) != 64 {
		return inv, platform.Fail(404, "invitation_not_found", "Приглашение не найдено.")
	}
	err := s.Tx.Within(s.Tx.ForInvitation(ctx, hash(token)), "", func(ctx context.Context) error {
		var err error
		inv, err = s.Repo.Lookup(ctx, hash(token), false)
		return err
	})
	return inv, err
}
func (s *Service) valid(inv Invitation) error {
	if inv.Revoked {
		return platform.Fail(410, "invitation_revoked", "Приглашение отменено. Попросите новую ссылку.")
	}
	if inv.AcceptedBy != "" {
		return platform.Fail(409, "invitation_accepted", "Приглашение уже принято.")
	}
	if !s.clock().Before(inv.ExpiresAt) {
		return platform.Fail(410, "invitation_expired", "Срок приглашения истёк. Попросите новую ссылку.")
	}
	return nil
}
func (s *Service) Resolve(ctx context.Context, token string) (any, error) {
	inv, err := s.lookup(ctx, token)
	if err != nil {
		return nil, err
	}
	if err = s.valid(inv); err != nil {
		return nil, err
	}
	var name string
	err = s.Tx.Within(ctx, inv.TenantID, func(ctx context.Context) error {
		var err error
		name, err = s.Repo.TenantName(ctx, inv.TenantID)
		return err
	})
	return map[string]any{"tenantName": name, "email": inv.Email, "expiresAt": inv.ExpiresAt}, err
}
func (s *Service) Accept(ctx context.Context, p security.Principal, token string) (domain.Tenant, error) {
	var tenant domain.Tenant
	inv, err := s.lookup(ctx, token)
	if err != nil {
		return tenant, err
	}
	if !strings.EqualFold(inv.Email, p.Email) {
		return tenant, platform.Fail(403, "invitation_email_mismatch", "Войдите с email, указанным в приглашении.")
	}
	err = s.Tx.Within(ctx, inv.TenantID, func(ctx context.Context) error {
		if err := s.Repo.LockGrant(ctx, inv.TenantID, inv.EmployeeID); err != nil {
			return err
		}
		locked, err := s.Repo.Lookup(ctx, hash(token), true)
		if err != nil {
			return err
		}
		if locked.AcceptedBy == p.Subject && !locked.Revoked {
			items, err := s.Repo.Grants(ctx, inv.TenantID, []string{inv.EmployeeID})
			if err != nil {
				return err
			}
			name, err := s.Repo.TenantName(ctx, inv.TenantID)
			tenant = domain.Tenant{ID: inv.TenantID, Name: name, Role: items[inv.EmployeeID].Role}
			return err
		}
		if err = s.valid(locked); err != nil {
			return err
		}
		if err = s.Repo.Activate(ctx, inv.TenantID, inv.EmployeeID, p.Subject); err != nil {
			return err
		}
		if err = s.Employees.Link(ctx, inv.TenantID, inv.EmployeeID, p.Subject); err != nil {
			return err
		}
		if err = s.Repo.Accept(ctx, inv.ID, p.Subject); err != nil {
			return err
		}
		items, err := s.Repo.Grants(ctx, inv.TenantID, []string{inv.EmployeeID})
		if err != nil {
			return err
		}
		name, err := s.Repo.TenantName(ctx, inv.TenantID)
		tenant = domain.Tenant{ID: inv.TenantID, Name: name, Role: items[inv.EmployeeID].Role}
		return err
	})
	return tenant, err
}
