package application

import (
	"context"
	"neiroot/services/core/internal/modules/company/domain"
)

// AssignmentTarget identifies membership or a single department within it.
type AssignmentTarget struct {
	BusinessID, DepartmentID string
}

type AssignmentChanges struct {
	Add, Remove []AssignmentTarget
}

// updateAssignments runs inside Execute's authorized, locked tenant transaction.
func (s *CatalogService) updateAssignments(ctx context.Context, q CatalogCommand, c domain.Catalog) error {
	if err := s.Repo.CatalogEmployee(ctx, q.Tenant, q.EmployeeID); err != nil {
		return err
	}
	adding, removing := map[AssignmentTarget]bool{}, map[AssignmentTarget]bool{}
	removedBusinesses := map[string]bool{}
	for _, target := range q.Assignments.Remove {
		removing[target] = true
		if target.DepartmentID == "" {
			removedBusinesses[target.BusinessID] = true
		}
	}
	for _, target := range q.Assignments.Add {
		adding[target] = true
		if removing[target] || removedBusinesses[target.BusinessID] {
			return catalogError(422, "conflicting_assignments", "Нельзя одновременно назначить и исключить сотрудника из одного предприятия или отдела.")
		}
	}
	validate := func(target AssignmentTarget, removal bool) error {
		b, ok := c.Businesses[target.BusinessID]
		if !ok {
			return catalogError(404, "business_not_found", "Предприятие не найдено.")
		}
		if b.Archived {
			return catalogError(409, "archived", "Предприятие в архиве. Сначала восстановите его.")
		}
		if target.DepartmentID != "" {
			d, ok := c.Departments[target.DepartmentID]
			if !ok || d.BusinessID != target.BusinessID {
				return catalogError(404, "department_not_found", "Отдел не найден.")
			}
			// A business removal deliberately includes its archived departments.
			if d.EffectiveArchived && !(removal && removedBusinesses[target.BusinessID]) {
				return catalogError(409, "archived", "Отдел или его родитель в архиве.")
			}
		}
		return nil
	}
	for target := range adding {
		if err := validate(target, false); err != nil {
			return err
		}
	}
	for target := range removing {
		if err := validate(target, true); err != nil {
			return err
		}
	}
	for target := range removing {
		if target.DepartmentID != "" && removedBusinesses[target.BusinessID] {
			continue
		}
		if err := s.Repo.CatalogAssign(ctx, q.Tenant, target.BusinessID, target.DepartmentID, q.EmployeeID, false); err != nil {
			return err
		}
	}
	for target := range adding {
		if err := s.Repo.CatalogAssign(ctx, q.Tenant, target.BusinessID, target.DepartmentID, q.EmployeeID, true); err != nil {
			return err
		}
	}
	return nil
}
