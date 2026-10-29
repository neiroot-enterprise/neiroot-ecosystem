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
