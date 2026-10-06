package domain

import (
	"errors"
	"net/mail"
	"strings"
	"time"
)

type Employee struct {
	LastName, FirstName, MiddleName                                            string
	ID, TenantID, FullName, Phone, Email, Subject, AccessState, IdempotencyKey string
	CreatedAt                                                                  time.Time
}

func (e Employee) Validate() error {
	if strings.TrimSpace(e.FullName) == "" || len([]rune(e.FullName)) > 200 {
		return errors.New("invalid_name")
	}
	for _, part := range []string{e.LastName, e.FirstName, e.MiddleName} {
		if len([]rune(part)) > 200 {
			return errors.New("invalid_name")
		}
	}
	email, err := mail.ParseAddress(e.Email)
	if err != nil || email.Address != e.Email || len(e.Email) > 254 {
		return errors.New("invalid_email")
	}
	if len(e.Phone) < 9 || len(e.Phone) > 16 || !strings.HasPrefix(e.Phone, "+") {
		return errors.New("invalid_phone")
	}
	return nil
}
