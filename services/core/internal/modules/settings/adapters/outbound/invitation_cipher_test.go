package outbound

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	app "neiroot/services/core/internal/modules/settings/application"
	"strings"
	"testing"
)

func TestInvitationCipherBindsSecretToInvitation(t *testing.T) {
	c, err := NewInvitationCipher(strings.Repeat("ab", 32))
	if err != nil {
		t.Fatal(err)
	}
	i := app.Invitation{ID: "invitation", TenantID: "tenant", EmployeeID: "employee", Token: strings.Repeat("c", 64)}
	digest := sha256.Sum256([]byte(i.Token))
	i.Hash = hex.EncodeToString(digest[:])
	encrypted, err := c.Encrypt(i)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encrypted, []byte(i.Token)) {
		t.Fatal("plaintext persisted")
	}
	if token, err := c.Decrypt(i, encrypted); err != nil || token != i.Token {
		t.Fatal("secret not recoverable", err)
	}
	other, _ := c.Encrypt(i)
	if bytes.Equal(encrypted, other) {
		t.Fatal("nonce reused")
	}
	for _, field := range []string{"tenant", "employee", "id", "hash"} {
		changed := i
		switch field {
		case "tenant":
			changed.TenantID += "x"
		case "employee":
			changed.EmployeeID += "x"
		case "id":
			changed.ID += "x"
		case "hash":
			changed.Hash += "x"
		}
		if _, err := c.Decrypt(changed, encrypted); err == nil {
			t.Fatalf("ciphertext transferable across %s", field)
		}
	}
	for _, value := range [][]byte{nil, {1, 2}, append([]byte(nil), encrypted...)} {
		if len(value) > 2 {
			value[len(value)-1] ^= 1
		}
		if _, err := c.Decrypt(i, value); err == nil {
			t.Fatal("invalid ciphertext accepted")
		}
	}
	wrong, _ := NewInvitationCipher(strings.Repeat("cd", 32))
	if _, err := wrong.Decrypt(i, encrypted); err == nil {
		t.Fatal("wrong key accepted")
	}
	for _, key := range []string{"", "not-hex", strings.Repeat("ab", 31)} {
		if _, err := NewInvitationCipher(key); err == nil {
			t.Fatal("invalid key accepted")
		}
	}
}
