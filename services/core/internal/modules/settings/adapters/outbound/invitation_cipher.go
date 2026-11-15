package outbound

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	app "neiroot/services/core/internal/modules/settings/application"
)

// InvitationCipher keeps recoverable capability secrets encrypted at rest.
type InvitationCipher struct{ aead cipher.AEAD }

func NewInvitationCipher(key string) (*InvitationCipher, error) {
	decoded, err := hex.DecodeString(key)
	if err != nil || len(decoded) != 32 {
		return nil, errors.New("INVITATION_ENCRYPTION_KEY must contain 32 hex-encoded bytes")
	}
	block, err := aes.NewCipher(decoded)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	return &InvitationCipher{aead: aead}, err
}

func invitationAAD(i app.Invitation) []byte {
	return []byte(i.TenantID + ":" + i.EmployeeID + ":" + i.ID + ":" + i.Hash)
}

func (c *InvitationCipher) Encrypt(i app.Invitation) ([]byte, error) {
	if c == nil {
		return nil, errors.New("invitation cipher is not configured")
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return c.aead.Seal(nonce, nonce, []byte(i.Token), invitationAAD(i)), nil
}

func (c *InvitationCipher) Decrypt(i app.Invitation, encrypted []byte) (string, error) {
	if c == nil || len(encrypted) < c.aead.NonceSize() {
		return "", errors.New("invitation token is unavailable")
	}
	n := c.aead.NonceSize()
	token, err := c.aead.Open(nil, encrypted[:n], encrypted[n:], invitationAAD(i))
	if err != nil {
		return "", errors.New("invitation token cannot be decrypted")
	}
	digest := sha256.Sum256(token)
	if len(token) != 64 || hex.EncodeToString(digest[:]) != i.Hash {
		return "", errors.New("invitation token hash mismatch")
	}
	return string(token), nil
}
