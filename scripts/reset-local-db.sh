#!/bin/bash
# Ricrea da zero il database locale di prova (NON usare su Supabase online).
set -e
export PGPASSWORD=${PGPASSWORD:-postgres}
PSQL="psql -h 127.0.0.1 -U postgres -d otherise -v ON_ERROR_STOP=1 -q"
$PSQL -c "drop schema if exists public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
delete from auth.users;"
for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do $PSQL -f "$f" 2>&1 | grep -v NOTICE || true; done
$PSQL -c "notify pgrst, 'reload schema'"
echo "Database locale pronto."
