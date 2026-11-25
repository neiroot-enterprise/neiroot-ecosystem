package inbound

import (
	"github.com/go-chi/chi/v5"
	"neiroot/internal/contracts"
	"neiroot/internal/platform"
	"neiroot/internal/platform/identity"
	"net/http"
)

func (h HTTP) navigationRoutes(r chi.Router) {
	r.Get("/me/navigation", func(w http.ResponseWriter, r *http.Request) {
		value, err := h.Navigation.Read(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, contracts.NavigationPreferences{Modules: value.Modules, Sections: value.Sections})
	})
	save := func(module string, w http.ResponseWriter, r *http.Request) {
		var input contracts.NavigationOrder
		if err := platform.Decode(w, r, &input); err != nil {
			platform.WriteError(w, r, err)
			return
		}
		items, err := h.Navigation.Save(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"), module, input.Items)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, contracts.NavigationOrder{Items: items})
	}
	r.Put("/me/navigation/modules", func(w http.ResponseWriter, r *http.Request) { save("", w, r) })
	r.Put("/me/navigation/modules/{moduleId}/sections", func(w http.ResponseWriter, r *http.Request) { save(chi.URLParam(r, "moduleId"), w, r) })
}
