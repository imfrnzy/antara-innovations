#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PGUSER=${PGUSER:-pgtest}
DB=bearingtest_$$; createdb "$DB"; trap 'dropdb "$DB"' EXIT
Q() { psql -v ON_ERROR_STOP=1 -qtA -d "$DB" "$@"; }
Q -f stub-auth.sql >/dev/null
Q -f ../../supabase/migrations/005_bearing.sql >/dev/null 2>&1
Q -f ../../supabase/migrations/021_bearing_followup.sql >/dev/null
Q -f ../../supabase/migrations/021_bearing_followup.sql >/dev/null
A=11111111-1111-1111-1111-111111111111; B=22222222-2222-2222-2222-222222222222
Q -c "insert into auth.users values ('$A'),('$B')" >/dev/null
Q -c "insert into public.bearing_assessments(id,user_id,jurisdictions) values ('33333333-3333-3333-3333-333333333333','$A','{uk}')" >/dev/null
as() { Q -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); $2" | grep -v '^$' | tail -1; }
fail=0; check(){ if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got $2)"; fail=1; fi; }
check "owner saves" "$(as $A "select public.save_bearing_supervisor('33333333-3333-3333-3333-333333333333','{\"tests\":[]}'::jsonb);")" "t"
check "other user cannot" "$(as $B "select public.save_bearing_supervisor('33333333-3333-3333-3333-333333333333','{\"tests\":[1]}'::jsonb);")" "f"
check "array rejected" "$(as $A "select public.save_bearing_supervisor('33333333-3333-3333-3333-333333333333','[1]'::jsonb);")" "f"
check "oversize rejected" "$(as $A "select public.save_bearing_supervisor('33333333-3333-3333-3333-333333333333', jsonb_build_object('x', repeat('a', 30000)));")" "f"
check "stored value unchanged by the refused writes" "$(Q -c "select supervisor::text from public.bearing_assessments")" '{"tests": []}'
exit $fail
