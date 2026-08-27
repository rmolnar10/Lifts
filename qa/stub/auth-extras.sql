-- Extra columns the QA stub needs on top of supabase/tests/00_local_auth_stub.sql.
-- Test-only: passwords are stored in plain text because nothing here is a real
-- credential and the whole cluster is thrown away at the end of the run.
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists created_at timestamptz not null default now();
