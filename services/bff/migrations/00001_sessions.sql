-- +goose Up
CREATE TABLE sessions(id_hash text PRIMARY KEY,access_token bytea NOT NULL,refresh_token bytea NOT NULL,access_expires_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,tenant_id uuid,csrf text NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE oauth_flows(id_hash text PRIMARY KEY,verifier bytea NOT NULL,nonce text NOT NULL,return_to text NOT NULL,expires_at timestamptz NOT NULL);
GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,oauth_flows TO bff_app;
-- +goose Down
DROP TABLE oauth_flows;
DROP TABLE sessions;
