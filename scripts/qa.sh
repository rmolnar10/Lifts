#!/usr/bin/env bash
# End-to-end QA for Lifts.
#
#   ./scripts/qa.sh              run the whole suite
#   ./scripts/qa.sh --headed     same, with a visible browser (local only)
#   ./scripts/qa.sh workout      run only specs matching "workout"
#
# Stands up a throwaway Postgres with the real migrations, a Supabase-compatible
# stub in front of it, and the app, then drives a real Chromium through
# docs/QA_CHECKLIST.md. Nothing touches the production project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./qa-env.sh
source "$ROOT/scripts/qa-env.sh"

trap qa_teardown EXIT

qa_start_postgres
qa_start_stub
qa_start_app

echo "==> running Playwright"
cd "$ROOT"
QA_APP_URL="http://127.0.0.1:$QA_APP_PORT" \
  npx playwright test --config qa/playwright.config.ts "$@"
