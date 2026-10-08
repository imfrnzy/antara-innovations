#!/usr/bin/env bash
# Runs every test in the repo. From the repo root:  bash tests/run-all.sh
# Needs: node, deno, a Chromium for Playwright, and (for the database tests) a local Postgres.
# Set DENO=/path/to/deno and PGPORT/PGHOST for your machine. Database tests are skipped if no Postgres answers.
cd "$(dirname "$0")/.."
DENO=${DENO:-deno}
fail=0
run() { echo "== $*"; "$@" > /tmp/test-out.$$ 2>&1 && tail -1 /tmp/test-out.$$ || { cat /tmp/test-out.$$ | tail -25; fail=1; }; }
for f in records-scan manifest-flags prompt-rules sentinel-engine config-check team halo-report-check bearing-engine keel-engine manifest-agent-rules manifest-rules-parity manifest-outcomes; do run node tests/$f.test.mjs; done
for f in sentinel-function halo-function bearing-function; do run $DENO test --no-check --config tests/deno.json -A tests/$f.test.ts; done
run $DENO test --no-check -A tests/manifest-functions.test.ts
for f in ui-soundings ui-sentinel ui-team ui-bearing ui-keel ui-manifest; do run node tests/$f.test.mjs; done
if psql -d postgres -c 'select 1' >/dev/null 2>&1; then for f in team-runs bearing-followup; do run bash tests/sql/$f.test.sh; done; else echo "(database tests skipped: no Postgres)"; fi
rm -f /tmp/test-out.$$
exit $fail
