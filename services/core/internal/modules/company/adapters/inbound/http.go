package inbound

import (
	"github.com/go-chi/chi/v5"
	"neiroot/internal/platform"
	"neiroot/internal/platform/identity"
	app "neiroot/services/core/internal/modules/company/application"
	"net/http"
)

type HTTP struct{ Service *app.Service }

func (h HTTP) Routes(r chi.Router) {
	r.Get("/employees", func(w http.ResponseWriter, r *http.Request) {
		limit, offset, err := platform.Pagination(r)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		value, err := h.Service.List(r.Context(), identity.Current(r.Context()).Subject, chi.URLParam(r, "tenantId"), r.URL.Query().Get("search"), limit, offset)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, value)
	})
	r.Post("/employees", func(w http.ResponseWriter, r *http.Request) {
		var input app.Input
		if err := platform.Decode(w, r, &input); err != nil {
			platform.WriteError(w, r, err)
			return
		}
		value, err := h.Service.Create(r.Context(), identity.Current(r.Context()).Subject, chi.URLParam(r, "tenantId"), r.Header.Get("Idempotency-Key"), input)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 201, value)
	})
	r.Get("/employees/{employeeId:[0-9a-f-]{36}}", func(w http.ResponseWriter, r *http.Request) {
		value, err := h.Service.Get(r.Context(), identity.Current(r.Context()).Subject, chi.URLParam(r, "tenantId"), chi.URLParam(r, "employeeId"))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, value)
	})
}
