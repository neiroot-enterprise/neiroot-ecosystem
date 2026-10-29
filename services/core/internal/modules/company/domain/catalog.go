package domain

import (
	"errors"
	"strings"
	"time"
)

// CatalogItem is a company entity. ParentID applies only to departments and INN only to organizations.
type CatalogItem struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	BusinessID        string    `json:"businessId,omitempty"`
	ParentID          *string   `json:"parentId"`
	Position          int       `json:"position"`
	INN               string    `json:"inn,omitempty"`
	Archived          bool      `json:"archived"`
	EffectiveArchived bool      `json:"effectiveArchived"`
	CreatedAt         time.Time `json:"createdAt"`
}
type Assignment struct {
	BusinessID   string `json:"businessId"`
	DepartmentID string `json:"departmentId,omitempty"`
	EmployeeID   string `json:"employeeId"`
	EmployeeName string `json:"employeeName"`
}
type OrganizationLink struct {
	BusinessID     string `json:"businessId"`
	OrganizationID string `json:"organizationId"`
}
type Catalog struct {
	Businesses        map[string]CatalogItem
	Departments       map[string]CatalogItem
	Organizations     map[string]CatalogItem
	Assignments       []Assignment
	OrganizationLinks []OrganizationLink
}

func Name(value string) (string, error) {
	value = strings.TrimSpace(value)
	if len([]rune(value)) < 1 || len([]rune(value)) > 200 {
		return "", errors.New("Наименование должно содержать от 1 до 200 символов.")
	}
	return value, nil
}
func ValidINN(inn string) bool {
	if len(inn) != 10 && len(inn) != 12 {
		return false
	}
	digits := make([]int, len(inn))
	for i, c := range inn {
		if c < '0' || c > '9' {
			return false
		}
		digits[i] = int(c - '0')
	}
	// Reject placeholder values even though zeroes satisfy the arithmetic checks.
	if strings.Trim(inn, "0") == "" {
		return false
	}
	check := func(weights []int) int {
		sum := 0
		for i, w := range weights {
			sum += digits[i] * w
		}
		return sum % 11 % 10
	}
	if len(inn) == 10 {
		return digits[9] == check([]int{2, 4, 10, 3, 5, 9, 4, 6, 8})
	}
	return digits[10] == check([]int{7, 2, 4, 10, 3, 5, 9, 4, 6, 8}) && digits[11] == check([]int{3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8})
}
func (c Catalog) ArchivedDepartment(id string) bool {
	seen := map[string]bool{}
	for id != "" {
		d, ok := c.Departments[id]
		if !ok || seen[id] {
			return true
		}
		seen[id] = true
		if d.Archived {
			return true
		}
		b, ok := c.Businesses[d.BusinessID]
		if !ok || b.Archived {
			return true
		}
		if d.ParentID == nil {
			return false
		}
		id = *d.ParentID
	}
	return false
}
func (c Catalog) CanParent(id string, parent *string) bool {
	seen := map[string]bool{}
	for parent != nil {
		if *parent == id || seen[*parent] {
			return false
		}
		seen[*parent] = true
		d, ok := c.Departments[*parent]
		if !ok {
			return false
		}
		parent = d.ParentID
	}
	return true
}
