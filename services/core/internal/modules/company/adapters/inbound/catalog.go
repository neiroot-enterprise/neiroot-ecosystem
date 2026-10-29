package inbound

import (
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"neiroot/internal/contracts"
	"neiroot/internal/platform"
	"neiroot/internal/platform/identity"
	app "neiroot/services/core/internal/modules/company/application"
	"net/http"
)

func (h HTTP) catalogRoutes(r chi.Router) {
	handler := func(kind, action string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			q := app.CatalogCommand{Kind: kind, Action: action, Tenant: chi.URLParam(r, "tenantId"), Subject: identity.Current(r.Context()).Subject, BusinessID: chi.URLParam(r, "businessId"), OrganizationID: chi.URLParam(r, "organizationId"), EmployeeID: chi.URLParam(r, "employeeId"), Key: r.Header.Get("Idempotency-Key"), Search: r.URL.Query().Get("search"), Status: r.URL.Query().Get("status")}
			for _, param := range []string{"tenantId", "businessId", "departmentId", "organizationId", "employeeId"} {
				if value := chi.URLParam(r, param); value != "" {
					if _, err := uuid.Parse(value); err != nil {
						platform.WriteError(w, r, platform.Fail(404, "item_not_found", "Объект не найден."))
						return
					}
				}
			}
			if kind == "businesses" {
				q.ID = q.BusinessID
			}
			if kind == "departments" {
				q.ID = chi.URLParam(r, "departmentId")
			}
			if kind == "organizations" {
				q.ID = q.OrganizationID
			}
			if action == "create" {
				q.ID = ""
			}
			if action == "list" || action == "businesses" || action == "organizations" {
				var err error
				q.Limit, q.Offset, err = platform.Pagination(r)
				if err != nil {
					platform.WriteError(w, r, err)
					return
				}
			}
			if action == "create" || action == "update" || action == "restore" || action == "move" {
				if err := decodeCatalog(w, r, &q); err != nil {
					platform.WriteError(w, r, err)
					return
				}
			}
			if kind != "departments" && q.Input.ParentID != nil || action != "move" && q.Input.BeforeID != nil || kind != "organizations" && q.Input.INN != nil {
				platform.WriteError(w, r, platform.Fail(422, "invalid_input", "Поля не подходят для этого действия."))
				return
			}
			value, err := h.Catalog.Execute(r.Context(), q)
			if err != nil {
				platform.WriteError(w, r, err)
				return
			}
			status := 200
			if action == "create" {
				status = 201
			}
			if action == "assign" || action == "unassign" || action == "link" || action == "unlink" {
				w.WriteHeader(204)
				return
			}
			platform.JSON(w, status, value)
		}
	}
	for _, kind := range []string{"businesses", "organizations"} {
		id := "businessId"
		if kind == "organizations" {
			id = "organizationId"
		}
		base := "/" + kind
		item := base + "/{" + id + ":[0-9a-f-]{36}}"
		r.Get(base, handler(kind, "list"))
		r.Post(base, handler(kind, "create"))
		r.Get(item, handler(kind, "get"))
		r.Patch(item, handler(kind, "update"))
		r.Post(item+"/archive", handler(kind, "archive"))
		r.Post(item+"/restore", handler(kind, "restore"))
	}
	b := "/businesses/{businessId:[0-9a-f-]{36}}"
	d := b + "/departments/{departmentId:[0-9a-f-]{36}}"
	r.Get(b+"/departments", handler("departments", "tree"))
	r.Post(b+"/departments", handler("departments", "create"))
	r.Get(d, handler("departments", "get"))
	r.Patch(d, handler("departments", "update"))
	for _, action := range []string{"archive", "restore", "move"} {
		r.Post(d+"/"+action, handler("departments", action))
	}
	for _, route := range []struct{ path, kind string }{{b, "businesses"}, {d, "departments"}} {
		r.Get(route.path+"/employees", handler(route.kind, "assignments"))
		r.Put(route.path+"/employees/{employeeId:[0-9a-f-]{36}}", handler(route.kind, "assign"))
		r.Delete(route.path+"/employees/{employeeId:[0-9a-f-]{36}}", handler(route.kind, "unassign"))
	}
	r.Get("/employees/{employeeId:[0-9a-f-]{36}}/assignments", handler("businesses", "employeeAssignments"))
	r.Get(b+"/organizations", handler("businesses", "organizations"))
	r.Put(b+"/organizations/{organizationId:[0-9a-f-]{36}}", handler("businesses", "link"))
	r.Delete(b+"/organizations/{organizationId:[0-9a-f-]{36}}", handler("businesses", "unlink"))
	o := "/organizations/{organizationId:[0-9a-f-]{36}}"
	r.Get(o+"/businesses", handler("organizations", "businesses"))
	r.Put(o+"/businesses/{businessId:[0-9a-f-]{36}}", handler("organizations", "link"))
	r.Delete(o+"/businesses/{businessId:[0-9a-f-]{36}}", handler("organizations", "unlink"))
}

// Decode the operation's generated DTO so unrelated fields cannot silently turn
// into another operation. Required names are validated by the application.
func decodeCatalog(w http.ResponseWriter, r *http.Request, q *app.CatalogCommand) error {
	switch {
	case q.Action == "restore":
		var v contracts.RestoreCatalogInput
		if err := platform.Decode(w, r, &v); err != nil {
			return err
		}
		q.Input.Name = v.Name
	case q.Action == "move":
		var body struct {
			ParentID json.RawMessage `json:"parentId"`
			BeforeID json.RawMessage `json:"beforeId"`
		}
		if err := platform.Decode(w, r, &body); err != nil {
			return err
		}
		if len(body.ParentID) == 0 || len(body.BeforeID) == 0 {
			return platform.Fail(422, "invalid_position", "Укажите parentId и beforeId; для корня или конца списка передайте null.")
		}
		raw, _ := json.Marshal(body)
		var v contracts.MoveDepartmentInput
		if err := json.Unmarshal(raw, &v); err != nil {
			return platform.Fail(422, "invalid_position", "Некорректное место перемещения.")
		}
		if v.ParentId != nil {
			p := v.ParentId.String()
			q.Input.ParentID = &p
		}
		if v.BeforeId != nil {
			p := v.BeforeId.String()
			q.Input.BeforeID = &p
		}
	case q.Action == "create" && q.Kind == "departments":
		var v contracts.CreateDepartmentInput
		if err := platform.Decode(w, r, &v); err != nil {
			return err
		}
		q.Input.Name = &v.Name
		if v.ParentId != nil {
			p := v.ParentId.String()
			q.Input.ParentID = &p
		}
	case q.Action == "create" && q.Kind == "organizations":
		var v contracts.OrganizationInput
		if err := platform.Decode(w, r, &v); err != nil {
			return err
		}
		q.Input.Name = &v.Name
		q.Input.INN = &v.INN
	case q.Action == "update" && q.Kind == "organizations":
		var v contracts.OrganizationUpdate
		if err := platform.Decode(w, r, &v); err != nil {
			return err
		}
		q.Input.Name = v.Name
		q.Input.INN = v.INN
	default:
		var v contracts.CatalogNameInput
		if err := platform.Decode(w, r, &v); err != nil {
			return err
		}
		q.Input.Name = &v.Name
	}
	return nil
}
