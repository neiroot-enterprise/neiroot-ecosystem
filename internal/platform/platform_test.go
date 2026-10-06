package platform

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPhoneNormalization(t *testing.T) {
	got, err := Phone("+7 (999) 000-00-00")
	if err != nil || got != "+79990000000" {
		t.Fatalf("normalization failed: %v", err)
	}
	for _, value := range []string{"79990000000", "++79990000000", "+09990000000", "+7abc9990000000", "+123"} {
		if _, err := Phone(value); err == nil {
			t.Errorf("accepted invalid phone %q", value)
		}
	}
}
func TestDecodeRejectsUnknownFieldsAndTrailingJSON(t *testing.T) {
	for _, body := range []string{`{"name":"test","tenantId":"foreign"}`, `{"name":"test"}{"name":"second"}`, `{`} {
		r := httptest.NewRequest("POST", "/", strings.NewReader(body))
		var value struct {
			Name string `json:"name"`
		}
		if Decode(httptest.NewRecorder(), r, &value) == nil {
			t.Error("accepted invalid input")
		}
	}
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"test"}`))
	var value struct {
		Name string `json:"name"`
	}
	if err := Decode(httptest.NewRecorder(), r, &value); err != nil {
		t.Fatal(err)
	}
}
