package outbound

import (
	"bytes"
	"context"
	"encoding/json"
	"neiroot/internal/platform"
	"neiroot/internal/security"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Keycloak struct {
	BaseURL, Realm, ClientID, Secret string
	HTTP                             *http.Client
}
type kcUser struct {
	ID         string              `json:"id"`
	Username   string              `json:"username"`
	Email      string              `json:"email"`
	Attributes map[string][]string `json:"attributes"`
}

func (k *Keycloak) token(ctx context.Context) (string, error) {
	form := url.Values{"grant_type": {"client_credentials"}, "client_id": {k.ClientID}, "client_secret": {k.Secret}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, k.BaseURL+"/realms/"+k.Realm+"/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := k.HTTP.Do(req)
	if err != nil {
		return "", platform.Fail(503, "identity_unavailable", "Сервис аккаунтов временно недоступен. Карточка сохранена; повторите действие.")
	}
	defer res.Body.Close()
	var data struct {
		Token string `json:"access_token"`
	}
	if res.StatusCode != 200 || json.NewDecoder(res.Body).Decode(&data) != nil || data.Token == "" {
		return "", platform.Fail(503, "identity_unavailable", "Не удалось подключиться к сервису аккаунтов.")
	}
	return data.Token, nil
}
func (k *Keycloak) request(ctx context.Context, token, method, path string, body any) (*http.Response, error) {
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	req, _ := http.NewRequestWithContext(ctx, method, k.BaseURL+"/admin/realms/"+k.Realm+path, bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := k.HTTP.Do(req)
	if err != nil {
		return nil, platform.Fail(503, "identity_unavailable", "Сервис аккаунтов временно недоступен. Повторите действие.")
	}
	return res, nil
}
func (k *Keycloak) lookup(ctx context.Context, token, field, value string) ([]kcUser, error) {
	res, err := k.request(ctx, token, "GET", "/users?exact=true&"+field+"="+url.QueryEscape(value), nil)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, platform.Fail(503, "identity_unavailable", "Не удалось проверить существующие аккаунты.")
	}
	var items []kcUser
	err = json.NewDecoder(res.Body).Decode(&items)
	return items, err
}
func (k *Keycloak) Provision(ctx context.Context, operation string, name security.PersonName, phone, email, password string) (string, error) {
	if k.HTTP == nil {
		k.HTTP = &http.Client{Timeout: 15 * time.Second}
	}
	token, err := k.token(ctx)
	if err != nil {
		return "", err
	}
	for _, lookup := range [][2]string{{"username", phone}, {"email", email}} {
		items, err := k.lookup(ctx, token, lookup[0], lookup[1])
		if err != nil {
			return "", err
		}
		if len(items) > 0 {
			u := items[0]
			values := u.Attributes["provisioning_id"]
			if len(values) == 1 && values[0] == operation && u.Username == phone && strings.EqualFold(u.Email, email) {
				return u.ID, nil
			}
			return "", platform.Fail(409, "account_exists", "Аккаунт с таким телефоном или email уже существует. Подключите его по приглашению.")
		}
	}
	body := map[string]any{"username": phone, "email": email, "firstName": name.FirstName, "lastName": name.LastName, "enabled": true, "emailVerified": false, "attributes": map[string][]string{"full_name": {strings.TrimSpace(name.LastName + " " + name.FirstName + " " + name.MiddleName)}, "middle_name": {name.MiddleName}, "provisioning_id": {operation}}, "credentials": []any{map[string]any{"type": "password", "value": password, "temporary": false}}}
	res, err := k.request(ctx, token, "POST", "/users", body)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode == 409 {
		// Another request for the same operation may have created the account between lookup and POST.
		items, lookupErr := k.lookup(ctx, token, "username", phone)
		if lookupErr != nil {
			return "", lookupErr
		}
		if len(items) == 1 {
			u := items[0]
			values := u.Attributes["provisioning_id"]
			if len(values) == 1 && values[0] == operation && u.Username == phone && strings.EqualFold(u.Email, email) {
				return u.ID, nil
			}
		}
		return "", platform.Fail(409, "account_exists", "Аккаунт уже существует. Используйте приглашение.")
	}
	if res.StatusCode != 201 {
		return "", platform.Fail(503, "identity_provision_failed", "Не удалось создать аккаунт. Проверьте пароль или повторите действие; карточка сохранена.")
	}
	location := res.Header.Get("Location")
	parts := strings.Split(strings.TrimRight(location, "/"), "/")
	if len(parts) == 0 || parts[len(parts)-1] == "" {
		return "", platform.Fail(503, "identity_provision_failed", "Повторите создание доступа.")
	}
	return parts[len(parts)-1], nil
}
