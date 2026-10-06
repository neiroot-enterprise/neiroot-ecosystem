package outbound

import (
	"context"
	"encoding/json"
	"neiroot/internal/security"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestExistingAccountCannotBeChangedByProvisioning(t *testing.T) {
	posts := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/token") {
			w.Write([]byte(`{"access_token":"unit-test-token"}`))
			return
		}
		if r.Method == "POST" {
			posts++
			t.Error("attempted modification of existing account")
			w.WriteHeader(500)
			return
		}
		json.NewEncoder(w).Encode([]kcUser{{ID: "existing-subject", Username: "+79990000001", Email: "existing@example.test"}})
	}))
	defer s.Close()
	k := Keycloak{BaseURL: s.URL, Realm: "neiroot", HTTP: &http.Client{Timeout: time.Second}}
	_, err := k.Provision(context.Background(), "new-operation", security.PersonName{LastName: "Test", FirstName: "User"}, "+79990000001", "existing@example.test", "synthetic-password")
	if err == nil || posts != 0 {
		t.Fatal("existing account was not protected")
	}
}
func TestProvisioningRetryReusesOnlyAccountOwnedByOperation(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/token") {
			w.Write([]byte(`{"access_token":"unit-test-token"}`))
			return
		}
		if r.Method != "GET" {
			t.Error("retry should not reset credentials")
		}
		json.NewEncoder(w).Encode([]kcUser{{ID: "created-subject", Username: "+79990000002", Email: "retry@example.test", Attributes: map[string][]string{"provisioning_id": {"operation"}}}})
	}))
	defer s.Close()
	k := Keycloak{BaseURL: s.URL, Realm: "neiroot", HTTP: s.Client()}
	sub, err := k.Provision(context.Background(), "operation", security.PersonName{LastName: "Test", FirstName: "User"}, "+79990000002", "retry@example.test", "different-synthetic-password")
	if err != nil || sub != "created-subject" {
		t.Fatalf("retry failed: %v", err)
	}
}

func TestConcurrentProvisionConflictReusesOnlyMatchingOperation(t *testing.T) {
	for _, own := range []bool{true, false} {
		t.Run(map[bool]string{true: "same operation", false: "another operation"}[own], func(t *testing.T) {
			created := false
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if strings.HasSuffix(r.URL.Path, "/token") {
					w.Write([]byte(`{"access_token":"unit-test-token"}`))
					return
				}
				if r.Method == "POST" {
					created = true
					w.WriteHeader(409)
					return
				}
				if !created {
					w.Write([]byte(`[]`))
					return
				}
				operation := "different"
				if own {
					operation = "operation"
				}
				json.NewEncoder(w).Encode([]kcUser{{ID: "concurrent-subject", Username: "+79990000003", Email: "concurrent@example.test", Attributes: map[string][]string{"provisioning_id": {operation}}}})
			}))
			defer s.Close()
			k := Keycloak{BaseURL: s.URL, Realm: "neiroot", HTTP: s.Client()}
			sub, err := k.Provision(context.Background(), "operation", security.PersonName{LastName: "Test", FirstName: "User"}, "+79990000003", "concurrent@example.test", "synthetic-password")
			if own && (err != nil || sub != "concurrent-subject") {
				t.Fatalf("concurrent retry failed: %v", err)
			}
			if !own && err == nil {
				t.Fatal("linked an account belonging to another operation")
			}
		})
	}
}
