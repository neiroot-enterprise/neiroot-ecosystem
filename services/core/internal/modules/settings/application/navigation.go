package application

import (
	"context"
	"neiroot/internal/platform"
	"neiroot/internal/security"
	"neiroot/services/core/internal/modules/settings/domain"
)

type NavigationRepository interface {
	Read(context.Context, string, string) (map[string][]string, error)
	Save(context.Context, string, string, string, []string) error
}

type NavigationAccess interface {
	Authorize(context.Context, string, string, bool) error
}

type NavigationService struct {
	Repo   NavigationRepository
	Tx     Transactions
	Access NavigationAccess
}

func (s *NavigationService) Read(ctx context.Context, p security.Principal, tenant string) (domain.Navigation, error) {
	result := domain.NavigationDefaults()
	err := s.Tx.Within(s.Tx.ForSubject(ctx, p.Subject), tenant, func(ctx context.Context) error {
		if err := s.Access.Authorize(ctx, tenant, p.Subject, false); err != nil {
			return err
		}
		saved, err := s.Repo.Read(ctx, tenant, p.Subject)
		if err != nil {
			return err
		}
		result.Modules = domain.CompleteNavigationOrder(saved["modules"], result.Modules)
		for module, items := range result.Sections {
			result.Sections[module] = domain.CompleteNavigationOrder(saved["sections:"+module], items)
		}
		return nil
	})
	return result, err
}

// An empty module selects the module list; otherwise only that module's sections change.
func (s *NavigationService) Save(ctx context.Context, p security.Principal, tenant, module string, items []string) ([]string, error) {
	var result []string
	err := s.Tx.Within(s.Tx.ForSubject(ctx, p.Subject), tenant, func(ctx context.Context) error {
		if err := s.Access.Authorize(ctx, tenant, p.Subject, false); err != nil {
			return err
		}
		defaults := domain.NavigationDefaults()
		available, list := defaults.Modules, "modules"
		if module != "" {
			var ok bool
			available, ok = defaults.Sections[module]
			if !ok {
				return platform.Fail(422, "invalid_navigation_module", "Неизвестный модуль меню.")
			}
			list = "sections:" + module
		}
		if domain.ValidateNavigationOrder(items, available) != nil {
			return platform.Fail(422, "invalid_navigation_order", "Порядок меню содержит неизвестные или повторяющиеся пункты либо пустой список.")
		}
		result = domain.CompleteNavigationOrder(items, available)
		return s.Repo.Save(ctx, tenant, p.Subject, list, result)
	})
	return result, err
}
