-- +goose Up
CREATE TABLE company.businesses (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES settings.tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX businesses_name ON company.businesses(tenant_id,lower(name)) WHERE NOT archived;
CREATE TABLE company.departments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, business_id uuid NOT NULL, parent_id uuid,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), position integer NOT NULL DEFAULT 0,
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,business_id,id),
 FOREIGN KEY(tenant_id,business_id) REFERENCES company.businesses(tenant_id,id),
 FOREIGN KEY(tenant_id,business_id,parent_id) REFERENCES company.departments(tenant_id,business_id,id),
 CHECK(parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX departments_name ON company.departments(tenant_id,business_id,parent_id,lower(name)) NULLS NOT DISTINCT WHERE NOT archived;
CREATE INDEX departments_tree ON company.departments(tenant_id,business_id,parent_id,position,id);
CREATE TABLE company.organizations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES settings.tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 inn text NOT NULL CHECK(inn ~ '^([0-9]{10}|[0-9]{12})$'),
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,inn)
);
ALTER TABLE company.employees ADD CONSTRAINT employees_tenant_id UNIQUE(tenant_id,id);
CREATE TABLE company.business_employees (
 tenant_id uuid NOT NULL, business_id uuid NOT NULL, employee_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,business_id,employee_id),
 FOREIGN KEY(tenant_id,business_id) REFERENCES company.businesses(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES company.employees(tenant_id,id)
);
CREATE TABLE company.department_employees (
 tenant_id uuid NOT NULL, business_id uuid NOT NULL, department_id uuid NOT NULL, employee_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,department_id,employee_id),
 FOREIGN KEY(tenant_id,business_id,department_id) REFERENCES company.departments(tenant_id,business_id,id),
 FOREIGN KEY(tenant_id,business_id,employee_id) REFERENCES company.business_employees(tenant_id,business_id,employee_id)
);
CREATE TABLE company.business_organizations (
 tenant_id uuid NOT NULL, business_id uuid NOT NULL, organization_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,business_id,organization_id),
 FOREIGN KEY(tenant_id,business_id) REFERENCES company.businesses(tenant_id,id),
 FOREIGN KEY(tenant_id,organization_id) REFERENCES company.organizations(tenant_id,id)
);
CREATE TABLE company.catalog_requests (
 tenant_id uuid NOT NULL, kind text NOT NULL, request_key text NOT NULL,
 fingerprint text NOT NULL, item_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,kind,request_key)
);
-- +goose StatementBegin
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['businesses','departments','organizations','business_employees','department_employees','business_organizations','catalog_requests'] LOOP
  EXECUTE format('ALTER TABLE company.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE company.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON company.%I USING (tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id::text=current_setting(''app.tenant_id'',true))',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON company.%I TO core_app',tab);
 END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE company.catalog_requests,company.business_organizations,company.department_employees,company.business_employees;
ALTER TABLE company.employees DROP CONSTRAINT employees_tenant_id;
DROP TABLE company.organizations,company.departments,company.businesses;
