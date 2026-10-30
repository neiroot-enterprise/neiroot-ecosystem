package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"neiroot/internal/platform"
	"neiroot/services/core/internal/modules/company/domain"
	"sort"
	"strings"
	"time"
)

type CatalogRepository interface {
	CatalogLock(context.Context, string, string, bool) error
	CatalogLoad(context.Context, string) (domain.Catalog, error)
	CatalogPut(context.Context, string, string, domain.CatalogItem) error
	CatalogEmployee(context.Context, string, string) error
	CatalogAssign(context.Context, string, string, string, string, bool) error
	CatalogLink(context.Context, string, string, string, bool) error
	CatalogRequest(context.Context, string, string, string) (string, string, error)
	CatalogRemember(context.Context, string, string, string, string, string) error
}
type CatalogService struct {
	Repo   CatalogRepository
	Tx     Transactions
	Access Access
}
type CatalogInput struct {
	Name     *string `json:"name,omitempty"`
	INN      *string `json:"inn,omitempty"`
	ParentID *string `json:"parentId"`
	BeforeID *string `json:"beforeId"`
}
type CatalogCommand struct {
	Action, Kind, Tenant, Subject, ID, BusinessID, EmployeeID, OrganizationID, Key, Search, Status string
	Limit, Offset                                                                                  int
	Input                                                                                          CatalogInput
	Assignments                                                                                    AssignmentChanges
}
type CatalogList struct {
	Items  []domain.CatalogItem `json:"items"`
	Total  int                  `json:"total"`
	Limit  int                  `json:"limit"`
	Offset int                  `json:"offset"`
}
type AssignmentView struct {
	domain.Assignment
	BusinessName   string `json:"businessName"`
	DepartmentName string `json:"departmentName"`
	Archived       bool   `json:"archived"`
}
type AssignmentList struct {
	Items []AssignmentView `json:"items"`
}

func catalogError(status int, code, message string) error {
	return platform.Fail(status, code, message)
}
func catalogItems(c domain.Catalog, kind string) map[string]domain.CatalogItem {
	switch kind {
	case "businesses":
		return c.Businesses
	case "departments":
		return c.Departments
	case "organizations":
		return c.Organizations
	}
	return nil
}
func sameParent(a, b *string) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }
func matchesArchive(archived bool, status string) bool {
	return status == "all" || archived == (status == "archived")
}
func sortedDepartments(c domain.Catalog, b string, p *string, except string) []domain.CatalogItem {
	items := []domain.CatalogItem{}
	for _, d := range c.Departments {
		if d.BusinessID == b && !d.Archived && sameParent(p, d.ParentID) && d.ID != except {
			items = append(items, d)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Position == items[j].Position {
			return items[i].ID < items[j].ID
		}
		return items[i].Position < items[j].Position
	})
	return items
}
func (s *CatalogService) Execute(ctx context.Context, q CatalogCommand) (any, error) {
	var result any
	write := q.Action != "list" && q.Action != "get" && q.Action != "tree" && q.Action != "assignments" && q.Action != "employeeAssignments" && q.Action != "organizations" && q.Action != "businesses"
	err := s.Tx.Within(ctx, q.Tenant, func(ctx context.Context) error {
		if err := s.Access.Authorize(ctx, q.Tenant, q.Subject, write); err != nil {
			return err
		}
		if q.Status != "" && q.Status != "active" && q.Status != "archived" && q.Status != "all" {
			return catalogError(422, "invalid_status", "Неизвестный режим списка.")
		}
		if err := s.Repo.CatalogLock(ctx, q.Tenant, q.BusinessID, write); err != nil {
			return err
		}
		// A queued mutation must observe permission changes made while it waited.
		if write {
			if err := s.Access.Authorize(ctx, q.Tenant, q.Subject, true); err != nil {
				return err
			}
		}
		c, err := s.Repo.CatalogLoad(ctx, q.Tenant)
		if err != nil {
			return err
		}
		for id, e := range c.Businesses {
			e.EffectiveArchived = e.Archived
			c.Businesses[id] = e
		}
		for id, e := range c.Organizations {
			e.EffectiveArchived = e.Archived
			c.Organizations[id] = e
		}
		for id, e := range c.Departments {
			e.EffectiveArchived = c.ArchivedDepartment(id)
			c.Departments[id] = e
		}
		items := catalogItems(c, q.Kind)
		requireBusiness := func(id string, active bool) (domain.CatalogItem, error) {
			e, ok := c.Businesses[id]
			if !ok {
				return e, catalogError(404, "business_not_found", "Предприятие не найдено.")
			}
			if active && e.Archived {
				return e, catalogError(409, "archived", "Предприятие в архиве. Сначала восстановите его.")
			}
			return e, nil
		}
		requireDepartment := func(id string, active bool) (domain.CatalogItem, error) {
			e, ok := c.Departments[id]
			if !ok || e.BusinessID != q.BusinessID {
				return e, catalogError(404, "department_not_found", "Отдел не найден.")
			}
			if active && e.EffectiveArchived {
				return e, catalogError(409, "archived", "Отдел или его родитель в архиве.")
			}
			return e, nil
		}
		if q.BusinessID != "" {
			if _, err = requireBusiness(q.BusinessID, false); err != nil {
				return err
			}
		}
		var e domain.CatalogItem
		if q.ID != "" {
			var ok bool
			e, ok = items[q.ID]
			if !ok || q.Kind == "departments" && e.BusinessID != q.BusinessID {
				return catalogError(404, "item_not_found", "Объект не найден.")
			}
		}
		switch q.Action {
		case "updateAssignments":
			return s.updateAssignments(ctx, q, c)
		case "get":
			result = e
			return nil
		case "list", "tree", "organizations", "businesses":
			rows := []domain.CatalogItem{}
			if q.Action == "tree" {
				items = c.Departments
			}
			if q.Action == "organizations" || q.Action == "businesses" {
				items = map[string]domain.CatalogItem{}
				for _, link := range c.OrganizationLinks {
					if q.Action == "organizations" && link.BusinessID == q.BusinessID {
						o := c.Organizations[link.OrganizationID]
						o.EffectiveArchived = o.Archived || c.Businesses[link.BusinessID].Archived
						items[o.ID] = o
					}
					if q.Action == "businesses" && link.OrganizationID == q.ID {
						b := c.Businesses[link.BusinessID]
						b.EffectiveArchived = b.Archived || c.Organizations[link.OrganizationID].Archived
						items[b.ID] = b
					}
				}
			}
			for _, row := range items {
				if q.Action == "tree" && row.BusinessID != q.BusinessID {
					continue
				}
				if !matchesArchive(row.EffectiveArchived, q.Status) || !strings.Contains(strings.ToLower(row.Name+" "+row.INN), strings.ToLower(q.Search)) {
					continue
				}
				rows = append(rows, row)
			}
			sort.Slice(rows, func(i, j int) bool {
				if q.Action == "tree" {
					if rows[i].Position == rows[j].Position {
						return rows[i].ID < rows[j].ID
					}
					return rows[i].Position < rows[j].Position
				}
				if rows[i].CreatedAt.Equal(rows[j].CreatedAt) {
					return rows[i].ID > rows[j].ID
				}
				return rows[i].CreatedAt.After(rows[j].CreatedAt)
			})
			total := len(rows)
			limit := q.Limit
			if limit <= 0 {
				limit = 25
			}
			offset := q.Offset
			if q.Action == "tree" {
				limit = total
				offset = 0
			} else {
				if offset > total {
					offset = total
				}
				end := offset + limit
				if end > total {
					end = total
				}
				rows = rows[offset:end]
			}
			result = CatalogList{rows, total, limit, offset}
			return nil
		case "assignments", "employeeAssignments":
			if q.Action == "employeeAssignments" {
				if err = s.Repo.CatalogEmployee(ctx, q.Tenant, q.EmployeeID); err != nil {
					return err
				}
			}
			if q.Kind == "departments" {
				if _, err = requireDepartment(q.ID, false); err != nil {
					return err
				}
			}
			rows := []AssignmentView{}
			for _, a := range c.Assignments {
				if q.Action == "employeeAssignments" {
					if a.EmployeeID != q.EmployeeID {
						continue
					}
				} else if a.BusinessID != q.BusinessID || q.Kind == "departments" && a.DepartmentID != q.ID || q.Kind == "businesses" && a.DepartmentID != "" {
					continue
				}
				v := AssignmentView{Assignment: a, BusinessName: c.Businesses[a.BusinessID].Name, Archived: c.Businesses[a.BusinessID].Archived}
				if a.DepartmentID != "" {
					v.DepartmentName = c.Departments[a.DepartmentID].Name
					v.Archived = c.Departments[a.DepartmentID].EffectiveArchived
				}
				if matchesArchive(v.Archived, q.Status) {
					rows = append(rows, v)
				}
			}
			sort.Slice(rows, func(i, j int) bool {
				return rows[i].BusinessName+rows[i].DepartmentName+rows[i].EmployeeName+rows[i].EmployeeID < rows[j].BusinessName+rows[j].DepartmentName+rows[j].EmployeeName+rows[j].EmployeeID
			})
			result = AssignmentList{rows}
			return nil
		case "assign", "unassign":
			if _, err = requireBusiness(q.BusinessID, true); err != nil {
				return err
			}
			d := ""
			if q.Kind == "departments" {
				if _, err = requireDepartment(q.ID, true); err != nil {
					return err
				}
				d = q.ID
			}
			if err = s.Repo.CatalogEmployee(ctx, q.Tenant, q.EmployeeID); err != nil {
				return err
			}
			return s.Repo.CatalogAssign(ctx, q.Tenant, q.BusinessID, d, q.EmployeeID, q.Action == "assign")
		case "link", "unlink":
			if _, err = requireBusiness(q.BusinessID, true); err != nil {
				return err
			}
			o, ok := c.Organizations[q.OrganizationID]
			if !ok {
				return catalogError(404, "organization_not_found", "Организация не найдена.")
			}
			if o.Archived {
				return catalogError(409, "archived", "Организация в архиве.")
			}
			return s.Repo.CatalogLink(ctx, q.Tenant, q.BusinessID, q.OrganizationID, q.Action == "link")
		case "create":
			if len(q.Key) < 16 || len(q.Key) > 100 {
				return catalogError(400, "idempotency_required", "Необходим ключ повторной отправки.")
			}
			if q.Input.Name == nil {
				return catalogError(422, "invalid_name", "Укажите наименование.")
			}
			name, nameErr := domain.Name(*q.Input.Name)
			if nameErr != nil {
				return catalogError(422, "invalid_name", nameErr.Error())
			}
			q.Input.Name = &name
			if q.Kind == "organizations" {
				if q.Input.INN == nil || !domain.ValidINN(*q.Input.INN) {
					return catalogError(422, "invalid_inn", "Укажите корректный ИНН из 10 или 12 цифр.")
				}
			}
			raw, _ := json.Marshal(struct {
				BusinessID string
				Input      CatalogInput
			}{q.BusinessID, q.Input})
			sum := sha256.Sum256(raw)
			fp := hex.EncodeToString(sum[:])
			prior, old, err := s.Repo.CatalogRequest(ctx, q.Tenant, q.Kind, q.Key)
			if err != nil {
				return err
			}
			if prior != "" {
				if old != fp {
					return catalogError(409, "idempotency_conflict", "Ключ уже использован для другого запроса.")
				}
				result = items[prior]
				return nil
			}
			e = domain.CatalogItem{ID: platform.UUID(), Name: name, BusinessID: q.BusinessID, ParentID: q.Input.ParentID, CreatedAt: time.Now().UTC()}
			if q.Kind == "organizations" {
				e.INN = *q.Input.INN
			}
			if q.Kind == "departments" {
				if _, err = requireBusiness(q.BusinessID, true); err != nil {
					return err
				}
				if e.ParentID != nil {
					if _, err = requireDepartment(*e.ParentID, true); err != nil {
						return err
					}
				}
				siblings := sortedDepartments(c, q.BusinessID, e.ParentID, "")
				if len(siblings) > 0 {
					e.Position = siblings[len(siblings)-1].Position + 1
				}
			}
			if err = s.Repo.CatalogPut(ctx, q.Tenant, q.Kind, e); err != nil {
				return err
			}
			if err = s.Repo.CatalogRemember(ctx, q.Tenant, q.Kind, q.Key, e.ID, fp); err != nil {
				return err
			}
			result = e
			return nil
		case "update", "archive", "restore", "move":
			if q.Action != "restore" && e.EffectiveArchived {
				return catalogError(409, "archived", "Архивные объекты доступны только для просмотра.")
			}
			if q.Action == "restore" {
				if !e.Archived {
					return catalogError(409, "not_archived", "Объект не находится в архиве либо скрыт архивным родителем.")
				}
				if q.Kind == "departments" {
					if _, err = requireBusiness(q.BusinessID, true); err != nil {
						return err
					}
					if e.ParentID != nil {
						if _, err = requireDepartment(*e.ParentID, true); err != nil {
							return err
						}
					}
				}
				e.Archived = false
				e.EffectiveArchived = false
			}
			if q.Input.Name != nil {
				name, nameErr := domain.Name(*q.Input.Name)
				if nameErr != nil {
					return catalogError(422, "invalid_name", nameErr.Error())
				}
				e.Name = name
			}
			if q.Action == "update" && q.Kind == "organizations" && q.Input.INN != nil {
				if !domain.ValidINN(*q.Input.INN) {
					return catalogError(422, "invalid_inn", "Укажите корректный ИНН из 10 или 12 цифр.")
				}
				e.INN = *q.Input.INN
			}
			if q.Action == "archive" {
				e.Archived = true
				e.EffectiveArchived = true
			}
			if q.Action == "move" {
				if q.Kind != "departments" {
					return catalogError(422, "invalid_move", "Перемещать можно только отделы.")
				}
				if q.Input.ParentID != nil {
					if _, err = requireDepartment(*q.Input.ParentID, true); err != nil {
						return err
					}
				}
				if !c.CanParent(e.ID, q.Input.ParentID) {
					return catalogError(422, "department_cycle", "Нельзя переместить отдел внутрь собственной ветви.")
				}
				siblings := sortedDepartments(c, q.BusinessID, q.Input.ParentID, e.ID)
				at := len(siblings)
				if q.Input.BeforeID != nil {
					if *q.Input.BeforeID == e.ID && sameParent(e.ParentID, q.Input.ParentID) {
						result = e
						return nil
					}
					at = -1
					for i, v := range siblings {
						if v.ID == *q.Input.BeforeID {
							at = i
							break
						}
					}
					if at < 0 {
						return catalogError(422, "invalid_position", "Выбранное место больше недоступно. Обновите дерево.")
					}
				}
				e.ParentID = q.Input.ParentID
				e.Position = at
				// Validate target name before updating siblings; SQL uniqueness is the final safeguard.
				for _, v := range siblings {
					if strings.EqualFold(v.Name, e.Name) {
						return catalogError(409, "catalog_conflict", "У нового родителя уже есть отдел с таким наименованием.")
					}
				}
				ordered := append([]domain.CatalogItem{}, siblings[:at]...)
				ordered = append(ordered, e)
				ordered = append(ordered, siblings[at:]...)
				for i, v := range ordered {
					v.Position = i
					if err = s.Repo.CatalogPut(ctx, q.Tenant, "departments", v); err != nil {
						return err
					}
					if v.ID == e.ID {
						e = v
					}
				}
				result = e
				return nil
			}
			if err = s.Repo.CatalogPut(ctx, q.Tenant, q.Kind, e); err != nil {
				return err
			}
			result = e
			return nil
		}
		return catalogError(422, "invalid_action", "Неизвестное действие.")
	})
	return result, err
}
