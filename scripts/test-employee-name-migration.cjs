// Runs only in a disposable database inside the existing local PostgreSQL container.
const fs=require('fs'),{execFileSync}=require('child_process'),assert=require('assert/strict');
const db='neiroot_names_migration_test_'+Date.now();
if(!/^neiroot_names_migration_test_\d+$/.test(db))throw Error('Unexpected test database');
const sql=(database,input)=>execFileSync('docker',['compose','exec','-T','postgres','psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true}).trim();
const up=p=>fs.readFileSync(p,'utf8').split('-- +goose Down')[0];
try{
 sql('postgres',`CREATE DATABASE ${db};`);
 sql(db,up('services/core/migrations/00001_initial.sql'));
 sql(db,`INSERT INTO company.employees(id,tenant_id,full_name,phone,email,access_state,idempotency_key) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Legacy compound name remains exact','+79990000000','legacy@example.test','pending','migration-test');`);
 sql(db,up('services/core/migrations/00002_employee_names.sql'));
 assert.equal(sql(db,`SELECT full_name='Legacy compound name remains exact' AND last_name='' AND first_name='' AND middle_name='' FROM company.employees;`),'t');
 assert.equal(sql(db,`SELECT count(*) FROM information_schema.columns WHERE table_schema='company' AND table_name='employees' AND column_name IN('first_name','last_name','middle_name');`),'3');
 assert.equal(sql(db,`BEGIN;SET LOCAL ROLE core_app;SET LOCAL app.tenant_id='00000000-0000-4000-8000-000000000002';SELECT count(*) FROM company.employees;ROLLBACK;`).split('\n').includes('1'),true);
 assert.equal(sql(db,`SET ROLE core_app;SELECT count(*) FROM company.employees;`).split('\n').pop(),'0');
 sql(db,fs.readFileSync('services/core/migrations/00002_employee_names.sql','utf8').split('-- +goose Down')[1]);
 assert.equal(sql(db,`SELECT full_name FROM company.employees;`),'Legacy compound name remains exact');
 console.log('Employee-name migration: legacy value preserved, 3 columns, RLS and rollback verified.');
}finally{sql('postgres',`DROP DATABASE IF EXISTS ${db};`)}
