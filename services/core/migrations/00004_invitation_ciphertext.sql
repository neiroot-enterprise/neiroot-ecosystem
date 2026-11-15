-- +goose Up
ALTER TABLE settings.invitations ADD COLUMN token_ciphertext bytea;

-- +goose Down
ALTER TABLE settings.invitations DROP COLUMN token_ciphertext;
