package domain

import "fmt"

// Navigation is a personal presentation preference, scoped to one ecosystem.
type Navigation struct {
	Modules  []string            `json:"modules"`
	Sections map[string][]string `json:"sections"`
}

func NavigationDefaults() Navigation {
	return Navigation{
		Modules: []string{"company", "money", "sales", "settings"},
		Sections: map[string][]string{
			"company":  {"structure", "businesses", "employees", "organizations", "contracts", "counterparties", "partners"},
			"money":    {"cash", "banks", "loans", "payroll"},
			"sales":    {"invoices", "acts", "catalog"},
			"settings": {"fields", "access"},
		},
	}
}

// CompleteNavigationOrder keeps personal positions and appends newly available items.
func CompleteNavigationOrder(saved, available []string) []string {
	result := make([]string, 0, len(available))
	allowed := map[string]bool{}
	for _, id := range available {
		allowed[id] = true
	}
	for _, id := range append(append([]string{}, saved...), available...) {
		if allowed[id] {
			result = append(result, id)
			delete(allowed, id)
		}
	}
	return result
}

func ValidateNavigationOrder(items, available []string) error {
	if len(items) == 0 || len(items) > len(available) {
		return fmt.Errorf("invalid navigation order length")
	}
	allowed := map[string]bool{}
	for _, id := range available {
		allowed[id] = true
	}
	for _, id := range items {
		if !allowed[id] {
			return fmt.Errorf("unknown or duplicate navigation item")
		}
		delete(allowed, id)
	}
	return nil
}
