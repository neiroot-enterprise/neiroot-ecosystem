package inbound

import (
	app "neiroot/services/core/internal/modules/company/application"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCatalogOperationBodies(t *testing.T) {
	for _, tc := range []struct {
		kind, action, body string
		valid              bool
	}{
		{"departments", "move", `{"parentId":null,"beforeId":null}`, true},
		{"departments", "move", `{}`, false},
		{"departments", "move", `{"parentId":"wrong","beforeId":null}`, false},
		{"departments", "move", `{"parentId":null,"beforeId":null,"name":"rename"}`, false},
		{"businesses", "update", `{"name":"Новое"}`, true},
		{"businesses", "update", `{"name":"Новое","parentId":null}`, false},
		{"organizations", "create", `{"name":"Организация","inn":"7707083893"}`, true},
		{"businesses", "restore", `{}`, true},
	} {
		t.Run(tc.kind+tc.action+tc.body, func(t *testing.T) {
			q := app.CatalogCommand{Kind: tc.kind, Action: tc.action}
			r := httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
			err := decodeCatalog(httptest.NewRecorder(), r, &q)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
		})
	}
}

func TestAssignmentBatchBodies(t *testing.T) {
	const target = `{"businessId":"10000000-0000-0000-0000-000000000001","departmentId":null}`
	for _, tc := range []struct {
		body  string
		valid bool
	}{
		{`{"add":[],"remove":[]}`, true},
		{`{"add":[` + target + `],"remove":[]}`, true},
		{`{"add":[{"businessId":"10000000-0000-0000-0000-000000000001","departmentId":"10000000-0000-0000-0000-000000000002"}],"remove":[]}`, true},
		{`{}`, false},
		{`null`, false},
		{`{"add":null,"remove":[]}`, false},
		{`{"add":[],"remove":[],"extra":true}`, false},
		{`{"add":[null],"remove":[]}`, false},
		{`{"add":[{}],"remove":[]}`, false},
		{`{"add":[{"businessId":"10000000-0000-0000-0000-000000000001"}],"remove":[]}`, false},
		{`{"add":[{"businessId":"wrong","departmentId":null}],"remove":[]}`, false},
		{`{"add":[{"businessId":"10000000-0000-0000-0000-000000000001","departmentId":"wrong"}],"remove":[]}`, false},
		{`{"add":[{"businessId":null,"departmentId":null}],"remove":[]}`, false},
		{`{"add":[{"businessId":"10000000-0000-0000-0000-000000000001","departmentId":null,"extra":true}],"remove":[]}`, false},
	} {
		t.Run(tc.body, func(t *testing.T) {
			q := app.CatalogCommand{}
			err := decodeAssignments(httptest.NewRecorder(), httptest.NewRequest("PATCH", "/", strings.NewReader(tc.body)), &q)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
			if err == nil && len(q.Assignments.Add) == 1 && q.Assignments.Add[0].BusinessID != "10000000-0000-0000-0000-000000000001" {
				t.Fatal("assignment target was not decoded")
			}
		})
	}
}
