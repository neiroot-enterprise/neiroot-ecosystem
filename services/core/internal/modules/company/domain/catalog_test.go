package domain

import "testing"

func TestINNChecksums(t *testing.T) {
	for _, value := range []string{"7707083893", "500100732259"} {
		if !ValidINN(value) {
			t.Fatalf("valid INN rejected: %s", value)
		}
	}
	for _, value := range []string{"7707083894", "500100732258", "0000000000", "123", "770708389x", " 7707083893"} {
		if ValidINN(value) {
			t.Fatalf("invalid INN accepted: %s", value)
		}
	}
}
func TestTreeArchiveAndCycles(t *testing.T) {
	parent := "parent"
	child := "child"
	c := Catalog{Businesses: map[string]CatalogItem{"b": {ID: "b"}}, Departments: map[string]CatalogItem{"parent": {ID: parent, BusinessID: "b"}, "child": {ID: child, BusinessID: "b", ParentID: &parent}}}
	if c.CanParent(parent, &child) || c.CanParent(child, &child) {
		t.Fatal("cycle allowed")
	}
	if !c.CanParent(child, nil) || c.ArchivedDepartment(child) {
		t.Fatal("valid root move/archive status")
	}
	p := c.Departments[parent]
	p.Archived = true
	c.Departments[parent] = p
	if !c.ArchivedDepartment(child) {
		t.Fatal("ancestor archive not inherited")
	}
	p.Archived = false
	c.Departments[parent] = p
	d := c.Departments[child]
	d.Archived = true
	c.Departments[child] = d
	if !c.ArchivedDepartment(child) || c.ArchivedDepartment(parent) {
		t.Fatal("independent archive was lost")
	}
}
