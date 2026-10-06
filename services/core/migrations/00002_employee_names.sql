-- +goose Up
-- Preserve legacy full_name exactly: a combined string cannot be reliably split.
ALTER TABLE company.employees ADD COLUMN last_name text NOT NULL DEFAULT '' CHECK(length(last_name)<=200);
ALTER TABLE company.employees ADD COLUMN first_name text NOT NULL DEFAULT '' CHECK(length(first_name)<=200);
ALTER TABLE company.employees ADD COLUMN middle_name text NOT NULL DEFAULT '' CHECK(length(middle_name)<=200);
-- +goose Down
ALTER TABLE company.employees DROP COLUMN middle_name, DROP COLUMN first_name, DROP COLUMN last_name;
