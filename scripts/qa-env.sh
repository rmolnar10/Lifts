#!/usr/bin/env bash
# Brings up the full QA stack: local Postgres with the real migrations, the
# Supabase stub, and the app. Sourced by scripts/qa.sh; not meant to run alone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export QA_PGDATA="${QA_PGDATA:-/tmp/lifts-qa-db}"
export QA_PGSOCK="${QA_PGSOCK:-/tmp/lifts-qa-sock}"
export QA_PGPORT="${QA_PGPORT:-5601}"
export QA_STUB_PORT="${QA_STUB_PORT:-54331}"
export QA_APP_PORT="${QA_APP_PORT:-3210}"

for dir in /usr/lib/postgresql/*/bin; do [ -d "$dir" ] && PATH="$dir:$PATH"; done
export PATH

run_pg() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "PATH=$PATH $*"; else bash -c "$*"; fi
}

qa_start_postgres() {
  echo "==> starting throwaway postgres"
  run_pg "pg_ctl -D $QA_PGDATA -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$QA_PGDATA" "$QA_PGSOCK"
  mkdir -p "$QA_PGDATA" "$QA_PGSOCK"
  [ "$(id -u)" -eq 0 ] && chown -R postgres:postgres "$QA_PGDATA" "$QA_PGSOCK"
  chmod 700 "$QA_PGDATA"

  run_pg "initdb -D $QA_PGDATA -U postgres --auth=trust" >/dev/null
  run_pg "pg_ctl -D $QA_PGDATA -o '-k $QA_PGSOCK -p $QA_PGPORT -c listen_addresses=' -l $QA_PGDATA/server.log start" >/dev/null

  local psql_cmd=(psql -h "$QA_PGSOCK" -p "$QA_PGPORT" -U postgres -v ON_ERROR_STOP=1 -q)
  echo "==> applying auth stub and migrations"
  "${psql_cmd[@]}" -f "$ROOT/supabase/tests/00_local_auth_stub.sql"
  "${psql_cmd[@]}" -f "$ROOT/qa/stub/auth-extras.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    "${psql_cmd[@]}" -f "$f" 2>&1 | grep -v NOTICE || true
  done
  # The stub connects as postgres; RLS must apply to it too, or the tests would
  # pass against policies that never actually run.
  "${psql_cmd[@]}" -c "alter role postgres set row_security = on;"
  "${psql_cmd[@]}" -c "grant authenticated to postgres;"
}

qa_start_stub() {
  echo "==> starting supabase stub on :$QA_STUB_PORT"
  PGHOST="$QA_PGSOCK" PGPORT="$QA_PGPORT" QA_STUB_PORT="$QA_STUB_PORT" \
    node "$ROOT/qa/stub/supabase-stub.mjs" > /tmp/lifts-qa-stub.log 2>&1 &
  echo $! > /tmp/lifts-qa-stub.pid
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "http://127.0.0.1:$QA_STUB_PORT/auth/v1/settings" && return 0
    sleep 0.25
  done
  echo "stub failed to start:"; cat /tmp/lifts-qa-stub.log; return 1
}

qa_start_app() {
  echo "==> starting app on :$QA_APP_PORT"
  cd "$ROOT"
  NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$QA_STUB_PORT" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="qa-anon-key" \
    npx next dev -p "$QA_APP_PORT" > /tmp/lifts-qa-app.log 2>&1 &
  echo $! > /tmp/lifts-qa-app.pid
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "http://127.0.0.1:$QA_APP_PORT/login" && return 0
    sleep 1
  done
  echo "app failed to start:"; tail -30 /tmp/lifts-qa-app.log; return 1
}

qa_teardown() {
  echo "==> tearing down"
  for f in /tmp/lifts-qa-app.pid /tmp/lifts-qa-stub.pid; do
    [ -f "$f" ] && kill -9 "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  done
  for p in $(ps -eo pid,args | grep -E 'next-serv[e]r|next de[v]|supabase-stu[b]' | awk '{print $1}'); do
    kill -9 "$p" 2>/dev/null || true
  done
  run_pg "pg_ctl -D $QA_PGDATA -m immediate stop" >/dev/null 2>&1 || true
}
