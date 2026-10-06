package application

import (
	"testing"
	"time"
)

func TestInvitationExpiresAtDeadlineAndRevocationWins(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	s := Service{Now: func() time.Time { return now }}
	if s.valid(Invitation{ExpiresAt: now}) == nil {
		t.Fatal("invitation accepted at expiry")
	}
	if s.valid(Invitation{ExpiresAt: now.Add(time.Second), Revoked: true}) == nil {
		t.Fatal("revoked invitation accepted")
	}
	if s.valid(Invitation{ExpiresAt: now.Add(time.Second), AcceptedBy: "subject"}) == nil {
		t.Fatal("used invitation accepted again")
	}
	if err := s.valid(Invitation{ExpiresAt: now.Add(7 * 24 * time.Hour)}); err != nil {
		t.Fatal(err)
	}
}
