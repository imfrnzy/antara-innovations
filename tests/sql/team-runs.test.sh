#!/usr/bin/env bash
# Runs the team runs migration against a scratch Postgres and checks the privacy rules.
# Usage: PGPORT=5544 PGHOST=/tmp/work/pg bash tests/sql/team-runs.test.sh
set -euo pipefail
cd "$(dirname "$0")"
export PGUSER=${PGUSER:-pgtest}
DB=teamtest_$$
createdb "$DB"; trap 'dropdb "$DB"' EXIT
Q() { psql -v ON_ERROR_STOP=1 -qtA -d "$DB" "$@"; }
Q -f stub-auth.sql >/dev/null
Q -f ../../supabase/migrations/020_team_runs.sql >/dev/null
Q -f ../../supabase/migrations/020_team_runs.sql >/dev/null   # idempotent re-run
OWNER=11111111-1111-1111-1111-111111111111; OTHER=22222222-2222-2222-2222-222222222222
Q -c "insert into auth.users values ('$OWNER'),('$OTHER')" >/dev/null
as() { # as <role> <uid> <sql>
  Q -c "set role $1; select set_config('request.jwt.claim.sub','$2',false); $3" | tail -n +1 | grep -v '^$' | tail -1
}
fail=0; ok(){ echo "ok   $1"; }; bad(){ echo "FAIL $1 (got: $2)"; fail=1; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2"; fi; }

row=$(as authenticated $OWNER "select run_id||'|'||join_code from public.create_team_run('halo','','Q4 leaders');")
RUN=${row%%|*}; CODE=${row##*|}
[ -n "$RUN" ] && ok "owner creates run, code=$CODE" || bad "create" "$row"

check "anon cannot create" "$(Q -c "set role anon; select public.create_team_run('halo','','x');" 2>&1 | grep -c 'not signed in\|permission denied')" "1"
check "public lookup works for anon" "$(as anon '' "select tool||status from public.team_run_public('$CODE');")" "haloopen"
check "bad code" "$(as anon '' "select public.submit_team_result('NOPE1234','tokentokentoken0001','{\"R1\":2}'::jsonb);")" "unknown_code"
check "short token" "$(as anon '' "select public.submit_team_result('$CODE','short','{\"R1\":2}'::jsonb);")" "bad_token"
check "text answer rejected" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0001','{\"R1\":\"hello\"}'::jsonb);")" "bad_answers"
check "bad key rejected" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0001','{\"R 1;\":1}'::jsonb);")" "bad_answers"
check "fraction rejected" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0001','{\"R1\":1.5}'::jsonb);")" "bad_answers"
check "out of range rejected" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0001','{\"R1\":11}'::jsonb);")" "bad_answers"

check "first answer" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0001','{\"R1\":2,\"R2\":0}'::jsonb);")" "ok"
check "second answer" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0002','{\"R1\":1,\"R2\":0}'::jsonb);")" "ok"
check "same token again replaces, not adds" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0002','{\"R1\":0,\"R2\":0}'::jsonb);")" "ok"
check "two people: hidden" "$(as authenticated $OWNER "select (public.team_run_summary('$RUN')->>'visible');")" "false"
check "two people: no question data" "$(as authenticated $OWNER "select public.team_run_summary('$RUN') ? 'questions';")" "f"
check "third answer" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0003','{\"R1\":2,\"R2\":1}'::jsonb);")" "ok"
check "three people: visible" "$(as authenticated $OWNER "select (public.team_run_summary('$RUN')->>'visible');")" "true"
check "average R1 (0,2,2 -> 1.33)" "$(as authenticated $OWNER "select public.team_run_summary('$RUN')->'questions'->'R1'->>'avg';")" "1.33"
check "counts R1" "$(as authenticated $OWNER "select public.team_run_summary('$RUN')->'questions'->'R1'->'counts'->>'2';")" "2"
check "counts R2 zero" "$(as authenticated $OWNER "select public.team_run_summary('$RUN')->'questions'->'R2'->'counts'->>'0';")" "2"
check "other user sees nothing" "$(as authenticated $OTHER "select coalesce(public.team_run_summary('$RUN')::text,'null');")" "null"
check "anon cannot read results table" "$(Q -c "set role anon; select count(*) from public.team_run_results;" 2>&1 | grep -c 'permission denied')" "1"
check "owner cannot read results table" "$(Q -c "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); select count(*) from public.team_run_results;" 2>&1 | grep -c 'permission denied')" "1"
check "other user cannot see run row" "$(as authenticated $OTHER "select count(*) from public.team_runs;")" "0"
check "owner cannot insert directly" "$(Q -c "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); insert into public.team_runs(owner_id,tool,join_code) values ('$OWNER','halo','ZZZZZZZZ');" 2>&1 | grep -c 'permission denied')" "1"
check "list shows count" "$(as authenticated $OWNER "select n from public.list_team_runs('halo');")" "3"
check "other cannot close" "$(as authenticated $OTHER "select public.close_team_run('$RUN');")" "f"
check "owner closes" "$(as authenticated $OWNER "select public.close_team_run('$RUN');")" "t"
check "closed rejects" "$(as anon '' "select public.submit_team_result('$CODE','tokentokentoken0009','{\"R1\":1}'::jsonb);")" "closed"
check "token stored hashed" "$(Q -c "select count(*) from public.team_run_results where token_hash like 'tokentoken%'")" "0"
exit $fail
