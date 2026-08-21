#!/usr/bin/env bash
# Apply the Supabase migrations to a throwaway local Postgres and run the RLS tests.
#
# Usage:  ./scripts/test-db.sh
# Requires a local PostgreSQL 14+ installation (initdb/pg_ctl/psql on PATH, or in
# /usr/lib/postgresql/<ver>/bin). Nothing here touches your real Supabase project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-/tmp/lifts-testdb}"
PGSOCK="${PGSOCK:-/tmp/lifts-testdb-sock}"
PGPORT="${PGPORT:-5599}"

for dir in /usr/lib/postgresql/*/bin; do [ -d "$dir" ] && PATH="$dir:$PATH"; done
export PATH

# Postgres refuses to run as root, so fall back to the `postgres` system user.
AS_PG=(); [ "$(id -u)" -eq 0 ] && AS_PG=(su postgres -c)

run_pg() {
  if [ ${#AS_PG[@]} -gt 0 ]; then su postgres -c "PATH=$PATH $*"; else bash -c "$*"; fi
}

cleanup() { run_pg "pg_ctl -D $PGDATA -m immediate stop" >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$PGDATA" "$PGSOCK"
mkdir -p "$PGDATA" "$PGSOCK"
if [ ${#AS_PG[@]} -gt 0 ]; then chown -R postgres:postgres "$PGDATA" "$PGSOCK"; fi
chmod 700 "$PGDATA"

echo "==> initialising throwaway cluster in $PGDATA"
run_pg "initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
run_pg "pg_ctl -D $PGDATA -o '-k $PGSOCK -p $PGPORT -c listen_addresses=' -l $PGDATA/server.log start" >/dev/null

PSQL=(psql -h "$PGSOCK" -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 -q)

echo "==> creating local auth stub"
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_local_auth_stub.sql"

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  "${PSQL[@]}" -f "$f" 2>&1 | grep -v 'NOTICE' || true
done

echo "==> re-applying migrations (idempotency check)"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1
done

echo "==> running RLS + RPC tests"
psql -h "$PGSOCK" -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/01_rls_test.sql"
