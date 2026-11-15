package inbound

import (
	"github.com/go-chi/chi/v5"
	"neiroot/internal/contracts"
	"neiroot/internal/platform"
	"neiroot/internal/platform/identity"
	app "neiroot/services/core/internal/modules/settings/application"
	"neiroot/services/core/internal/modules/settings/domain"
	"net/http"
)

type HTTP struct{ Service *app.Service }

func tenantDTO(t domain.Tenant) contracts.Tenant {
	return contracts.Tenant{ID: t.ID, Name: t.Name, Role: contracts.Role(t.Role)}
}
func tenantsDTO(items []domain.Tenant) []contracts.Tenant {
	result := make([]contracts.Tenant, 0, len(items))
	for _, t := range items {
		result = append(result, tenantDTO(t))
	}
	return result
}
func (h HTTP) Public(r chi.Router) {
	r.Post("/api/v1/invitations/resolve", func(w http.ResponseWriter, r *http.Request) {
		var input contracts.TokenInput
		if err := platform.Decode(w, r, &input); err != nil {
			platform.WriteError(w, r, err)
			return
		}
		value, err := h.Service.Resolve(r.Context(), input.Token)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, value)
	})
}
func (h HTTP) Protected(r chi.Router) {
	r.Get("/api/v1/me", func(w http.ResponseWriter, r *http.Request) {
		p := identity.Current(r.Context())
		spaces, err := h.Service.ListTenants(r.Context(), p)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, contracts.Me{
			Subject: p.Subject, FullName: p.FullName, FirstName: p.FirstName, LastName: p.LastName,
			Phone: p.Phone, Email: p.Email, Tenants: tenantsDTO(spaces),
		})
	})
	r.Get("/api/v1/tenants", func(w http.ResponseWriter, r *http.Request) {
		value, err := h.Service.ListTenants(r.Context(), identity.Current(r.Context()))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, tenantsDTO(value))
	})
	r.Post("/api/v1/onboarding", func(w http.ResponseWriter, r *http.Request) {
		var input contracts.OnboardingInput
		if err := platform.Decode(w, r, &input); err != nil {
			platform.WriteError(w, r, err)
			return
		}
		value, err := h.Service.Onboard(r.Context(), identity.Current(r.Context()), input.Name)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 201, tenantDTO(value))
	})
	r.Post("/api/v1/invitations/accept", func(w http.ResponseWriter, r *http.Request) {
		var input contracts.TokenInput
		if err := platform.Decode(w, r, &input); err != nil {
			platform.WriteError(w, r, err)
			return
		}
		value, err := h.Service.Accept(r.Context(), identity.Current(r.Context()), input.Token)
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, tenantDTO(value))
	})
}
func (h HTTP) Tenant(r chi.Router) {
	r.Patch("/employees/{employeeId:[0-9a-f-]{36}}/role", func(w http.ResponseWriter, r *http.Request) {
		var input contracts.RoleInput
		if err := platform.Decode(w, r, &input); err != nil {
			platform.WriteError(w, r, err)
			return
		}
		err := h.Service.ChangeRole(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"), chi.URLParam(r, "employeeId"), string(input.Role))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		w.WriteHeader(204)
	})
	r.Post("/employees/{employeeId:[0-9a-f-]{36}}/invitation", func(w http.ResponseWriter, r *http.Request) {
		value, err := h.Service.Reissue(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"), chi.URLParam(r, "employeeId"))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 201, contracts.InvitationLink{InvitationURL: value})
	})
	r.Get("/employees/{employeeId:[0-9a-f-]{36}}/invitation", func(w http.ResponseWriter, r *http.Request) {
		inv, err := h.Service.InvitationLink(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"), chi.URLParam(r, "employeeId"))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, contracts.InvitationLink{InvitationURL: h.Service.PublicURL + "/invite#token=" + inv.Token, ExpiresAt: &inv.ExpiresAt})
	})
	r.Post("/employees/{employeeId:[0-9a-f-]{36}}/invitation/refresh", func(w http.ResponseWriter, r *http.Request) {
		inv, err := h.Service.RefreshInvitation(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"), chi.URLParam(r, "employeeId"))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		platform.JSON(w, 200, contracts.InvitationLink{InvitationURL: h.Service.PublicURL + "/invite#token=" + inv.Token, ExpiresAt: &inv.ExpiresAt})
	})
	r.Delete("/employees/{employeeId:[0-9a-f-]{36}}/invitation", func(w http.ResponseWriter, r *http.Request) {
		err := h.Service.Revoke(r.Context(), identity.Current(r.Context()), chi.URLParam(r, "tenantId"), chi.URLParam(r, "employeeId"))
		if err != nil {
			platform.WriteError(w, r, err)
			return
		}
		w.WriteHeader(204)
	})
}
