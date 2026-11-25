-- +goose Up
CREATE TABLE settings.navigation_orders (
    tenant_id uuid NOT NULL,
    subject text NOT NULL,
    list_id text NOT NULL,
    items text[] NOT NULL,
    PRIMARY KEY (tenant_id, subject, list_id),
    FOREIGN KEY (tenant_id, subject) REFERENCES settings.memberships(tenant_id, subject) ON DELETE CASCADE,
    CHECK (cardinality(items) BETWEEN 1 AND 100)
);
ALTER TABLE settings.navigation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings.navigation_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY navigation_personal ON settings.navigation_orders
    USING (tenant_id::text=current_setting('app.tenant_id',true) AND subject=current_setting('app.subject',true))
    WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND subject=current_setting('app.subject',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON settings.navigation_orders TO core_app;

-- +goose Down
DROP TABLE settings.navigation_orders;
