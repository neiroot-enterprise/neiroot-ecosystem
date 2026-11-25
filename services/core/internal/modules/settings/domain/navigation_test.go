package domain

import (
	"reflect"
	"testing"
)

func TestPersonalOrderSurvivesCatalogEvolution(t *testing.T) {
	got := CompleteNavigationOrder([]string{"removed", "employees", "employees", "businesses"}, []string{"structure", "businesses", "employees", "partners"})
	want := []string{"employees", "businesses", "structure", "partners"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	defaults := NavigationDefaults()
	if defaults.Modules[0] != "company" || defaults.Sections["sales"][2] != "catalog" {
		t.Fatal("wrong initial menu")
	}
	for _, items := range [][]string{nil, {}, {"employees", "employees"}, {"catalog"}, {"unknown"}} {
		if ValidateNavigationOrder(items, defaults.Sections["company"]) == nil {
			t.Fatalf("accepted invalid company order: %v", items)
		}
	}
	if err := ValidateNavigationOrder([]string{"employees", "structure"}, defaults.Sections["company"]); err != nil {
		t.Fatal(err)
	}
}
