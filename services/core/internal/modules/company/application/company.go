package application

import (
	"context"
	"neiroot/internal/contracts"
	"neiroot/internal/platform"
	"neiroot/internal/security"
	"neiroot/services/core/internal/modules/company/domain"
	"strings"
)

type Repository interface {
	Create(context.Context, domain.Employee) error
	Get(context.Context, string, string) (domain.Employee, error)
	ByKey(context.Context, string, string) (domain.Employee, bool, error)
	List(context.Context, string, string, int, int) ([]domain.Employee, int, error)
	Link(context.Context, string, string, string, string) error
}
type Grant struct{ Role, InvitationState string }
type Access interface {
	Authorize(context.Context, string, string, bool) error
	EnsureGrant(context.Context, string, string, string, string) error
	Grants(context.Context, string, []string) (map[string]Grant, error)
	Activate(context.Context, string, string, string) error
	Issue(context.Context, string, string) (string, error)
}
type Identity interface {
	Provision(context.Context, string, security.PersonName, string, string, string) (string, error)
}
type Transactions interface {
	Within(context.Context, string, func(context.Context) error) error
}
type Service struct {
	Repo      Repository
	Access    Access
	Identity  Identity
	Tx        Transactions
	PublicURL string
}
type Employee = contracts.Employee
type Input = contracts.CreateEmployeeInput
type Result = contracts.CreateEmployeeResult

func dto(e domain.Employee, g Grant) Employee {
	return Employee{ID: e.ID, FullName: e.FullName, LastName: e.LastName, FirstName: e.FirstName, MiddleName: e.MiddleName, Phone: e.Phone, Email: e.Email, Role: contracts.Role(g.Role), AccessState: e.AccessState, InvitationState: g.InvitationState, CreatedAt: e.CreatedAt}
}
func (s *Service) List(ctx context.Context, subject, tenant, search string, limit, offset int) (any, error) {
	var result any
	err := s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
		if err := s.Access.Authorize(ctx, tenant, subject, false); err != nil {
			return err
		}
		rows, total, err := s.Repo.List(ctx, tenant, search, limit, offset)
		if err != nil {
			return err
		}
		ids := make([]string, len(rows))
		for i, e := range rows {
			ids[i] = e.ID
		}
		grants, err := s.Access.Grants(ctx, tenant, ids)
		if err != nil {
			return err
		}
		items := make([]Employee, 0, len(rows))
		for _, e := range rows {
			items = append(items, dto(e, grants[e.ID]))
		}
		result = contracts.EmployeeList{Items: items, Total: total, Limit: limit, Offset: offset}
		return nil
	})
	return result, err
}
func (s *Service) Get(ctx context.Context, subject, tenant, id string) (Employee, error) {
	var result Employee
	err := s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
		if err := s.Access.Authorize(ctx, tenant, subject, false); err != nil {
			return err
		}
		e, err := s.Repo.Get(ctx, tenant, id)
		if err != nil {
			return err
		}
		g, err := s.Access.Grants(ctx, tenant, []string{id})
		if err != nil {
			return err
		}
		result = dto(e, g[id])
		return nil
	})
	return result, err
}
func (s *Service) Create(ctx context.Context, subject, tenant, key string, input Input) (Result, error) {
	var result Result
	if len(key) < 16 || len(key) > 100 {
		return result, platform.Fail(400, "idempotency_required", "Необходим ключ повторной отправки.")
	}
	phone, err := platform.Phone(input.Phone)
	if err != nil {
		return result, err
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.LastName = strings.TrimSpace(input.LastName)
	input.FirstName = strings.TrimSpace(input.FirstName)
	input.MiddleName = strings.TrimSpace(input.MiddleName)
	if input.LastName == "" || input.FirstName == "" {
		return result, platform.Fail(422, "invalid_name", "Укажите фамилию и имя сотрудника.")
	}
	input.Phone = phone
	if input.Role != "admin" && input.Role != "user" {
		return result, platform.Fail(422, "invalid_role", "Выберите роль администратора или пользователя.")
	}
	if input.Mode != "password" && input.Mode != "invite" {
		return result, platform.Fail(422, "invalid_mode", "Выберите способ подключения.")
	}
	if input.Mode == "password" && (len([]rune(input.Password)) < 8 || len(input.Password) > 256) {
		return result, platform.Fail(422, "invalid_password", "Пароль должен содержать от 8 до 256 символов.")
	}
	e := domain.Employee{ID: platform.UUID(), TenantID: tenant, FullName: strings.TrimSpace(input.LastName + " " + input.FirstName + " " + input.MiddleName), LastName: input.LastName, FirstName: input.FirstName, MiddleName: input.MiddleName, Phone: phone, Email: input.Email, AccessState: "pending", IdempotencyKey: key}
	if err = e.Validate(); err != nil {
		return result, platform.Fail(422, err.Error(), "Проверьте ФИО, email и телефон.")
	}
	err = s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
		if err := s.Access.Authorize(ctx, tenant, subject, true); err != nil {
			return err
		}
		// Serialize only the same tenant/key; uniqueness also protects concurrent distinct requests.
		if lock, ok := s.Repo.(interface {
			Lock(context.Context, string, string) error
		}); ok {
			if err := lock.Lock(ctx, tenant, key); err != nil {
				return err
			}
		}
		prior, found, err := s.Repo.ByKey(ctx, tenant, key)
		if err != nil {
			return err
		}
		if found {
			if prior.LastName != e.LastName || prior.FirstName != e.FirstName || prior.MiddleName != e.MiddleName || prior.Phone != e.Phone || prior.Email != e.Email {
				return platform.Fail(409, "idempotency_conflict", "Этот ключ уже использован для другой карточки.")
			}
			e = prior
			return nil
		}
		if err = s.Repo.Create(ctx, e); err != nil {
			return err
		}
		if err = s.Access.EnsureGrant(ctx, tenant, e.ID, e.Email, string(input.Role)); err != nil {
			return err
		}
		if input.Mode == "invite" {
			token, err := s.Access.Issue(ctx, tenant, e.ID)
			if err != nil {
				return err
			}
			result.InvitationURL = s.PublicURL + "/invite#token=" + token
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	if input.Mode == "password" && e.Subject == "" {
		sub, provisionErr := s.Identity.Provision(ctx, e.ID, security.PersonName{LastName: e.LastName, FirstName: e.FirstName, MiddleName: e.MiddleName}, e.Phone, e.Email, input.Password)
		if provisionErr != nil {
			_ = s.Tx.Within(ctx, tenant, func(ctx context.Context) error { return s.Repo.Link(ctx, tenant, e.ID, "", "error") })
			return result, provisionErr
		}
		err = s.Tx.Within(ctx, tenant, func(ctx context.Context) error {
			if err := s.Access.Authorize(ctx, tenant, subject, true); err != nil {
				return err
			}
			if err := s.Access.Activate(ctx, tenant, e.ID, sub); err != nil {
				return err
			}
			return s.Repo.Link(ctx, tenant, e.ID, sub, "active")
		})
		if err != nil {
			return result, err
		}
	}
	result.Employee, err = s.Get(ctx, subject, tenant, e.ID)
	return result, err
}

// Used only by authenticated onboarding/invitation scenarios through an internal module port.
func (s *Service) AddOwner(ctx context.Context, tenant string, p security.Principal) (string, error) {
	e := domain.Employee{ID: platform.UUID(), TenantID: tenant, Subject: p.Subject, FullName: p.FullName, LastName: p.LastName, FirstName: p.FirstName, MiddleName: p.MiddleName, Phone: p.Phone, Email: p.Email, AccessState: "active", IdempotencyKey: "owner:" + p.Subject}
	if err := e.Validate(); err != nil {
		return "", platform.Fail(422, "invalid_profile", "Заполните профиль аккаунта.")
	}
	return e.ID, s.Repo.Create(ctx, e)
}
func (s *Service) Link(ctx context.Context, tenant, id, subject string) error {
	return s.Repo.Link(ctx, tenant, id, subject, "active")
}
func (s *Service) Pending(ctx context.Context, tenant, id string) error {
	return s.Repo.Link(ctx, tenant, id, "", "pending")
}
