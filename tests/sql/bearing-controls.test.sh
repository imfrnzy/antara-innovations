#!/usr/bin/env bash
# Runs migrations 030 and 031 against a scratch Postgres and checks the audit pack register rules.
set -euo pipefail
cd "$(dirname "$0")"
export PGUSER=${PGUSER:-pgtest}
DB=ctltest_$$
createdb "$DB"; trap 'dropdb "$DB"' EXIT
Q() { psql -v ON_ERROR_STOP=1 -qtA -d "$DB" "$@"; }
Q -f stub-auth.sql >/dev/null
Q -f ../../supabase/migrations/030_accounts_history.sql >/dev/null
Q -f ../../supabase/migrations/031_bearing_controls.sql >/dev/null
Q -f ../../supabase/migrations/032_verified_sessions.sql >/dev/null
Q -f ../../supabase/migrations/031_bearing_controls.sql >/dev/null   # idempotent re-run
Q -f ../../supabase/migrations/032_verified_sessions.sql >/dev/null
ANN=11111111-1111-1111-1111-111111111111; BOB=22222222-2222-2222-2222-222222222222; GUEST=33333333-3333-3333-3333-333333333333
Q -c "insert into auth.users values ('$ANN'),('$BOB'),('$GUEST')" >/dev/null
as() {
  local amr="${AMR:-}"; [ -z "$amr" ] && amr='[{"method":"otp"}]'
  local claims="{\"sub\":\"$1\",\"email\":\"$([ "$2" = "-" ] && echo "" || echo "$2")\",\"is_anonymous\":$3,\"amr\":$amr}" out
  out=$(psql -X -tA -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); select set_config('request.jwt.claims','$claims',false); $4" 2>&1 || true)
  if echo "$out" | grep -q 'ERROR:'; then echo "$out" | grep -m1 'ERROR:'; else echo "$out" | grep -v '^$' | tail -1; fi
}
put() { as "$1" "$2" "$3" "insert into public.bearing_controls(user_id,obligation_id,owner,review_date,evidence_note) values ('$1','$4','${5:-Ann}','2026-12-01','register in SharePoint') on conflict (user_id,obligation_id) do update set owner=excluded.owner, review_date=excluded.review_date, evidence_note=excluded.evidence_note;"; }
fail=0; ok(){ echo "ok   $1"; }; bad(){ echo "FAIL $1 (got: $2)"; fail=1; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2"; fi; }
has(){ if echo "$2" | grep -q "$3"; then ok "$1"; else bad "$1" "$2"; fi; }

has "anonymous login cannot keep owners" "$(put $GUEST - true uk:a)" "sign_in_required"
has "the anon role has no access" "$(Q -c "set role anon; select count(*) from public.bearing_controls;" 2>&1)" "permission denied"
has "an unproven email cannot keep owners" "$(AMR='[{"method":"anonymous"}]' put $ANN ann@corp.com false uk:zz)" "sign_in_required"
for i in 1 2 3 4 5; do check "free save $i" "$(put $ANN ann@corp.com false uk:o$i)" "INSERT 0 1"; done
has "sixth obligation refused on free" "$(put $ANN ann@corp.com false uk:o6)" "controls_free_limit"
check "changing one you already track works at the limit" "$(put $ANN ann@corp.com false uk:o3 Zed)" "INSERT 0 1"
check "and the change is stored" "$(as $ANN ann@corp.com false "select owner from public.bearing_controls where obligation_id='uk:o3';")" "Zed"
check "bob sees none of ann's rows" "$(as $BOB bob@corp.com false "select count(*) from public.bearing_controls;")" "0"
check "bob cannot save as ann, and learns nothing" "$(as $BOB bob@corp.com false "insert into public.bearing_controls(user_id,obligation_id) values ('$ANN','uk:z');")" "ERROR:  not_allowed"
check "bob cannot edit ann's row" "$(as $BOB bob@corp.com false "update public.bearing_controls set owner='x';")" "UPDATE 0"
check "bob cannot delete ann's row" "$(as $BOB bob@corp.com false "delete from public.bearing_controls;")" "DELETE 0"
check "an owner name over 80 characters is refused" "$(as $BOB bob@corp.com false "insert into public.bearing_controls(user_id,obligation_id,owner) values ('$BOB','uk:a','$(printf 'x%.0s' $(seq 1 81))');" | grep -c 'violates check constraint')" "1"
check "an evidence note over 300 characters is refused" "$(as $BOB bob@corp.com false "insert into public.bearing_controls(user_id,obligation_id,evidence_note) values ('$BOB','uk:a','$(printf 'x%.0s' $(seq 1 301))');" | grep -c 'violates check constraint')" "1"
check "a row cannot be handed to someone else" "$(as $ANN ann@corp.com false "update public.bearing_controls set user_id='$BOB' where obligation_id='uk:o1';" | grep -c 'not_allowed\|row-level security')" "1"
check "clearing one frees a slot" "$(as $ANN ann@corp.com false "delete from public.bearing_controls where obligation_id='uk:o1';")" "DELETE 1"
check "and a new one fits" "$(put $ANN ann@corp.com false uk:o7)" "INSERT 0 1"

Q -c "select public.grant_plan('ann@corp.com','pro',30,'test');" >/dev/null
check "pro lifts the limit" "$(put $ANN ann@corp.com false uk:o8)" "INSERT 0 1"
Q -c "set role authenticated; select set_config('request.jwt.claim.sub','$ANN',false); select set_config('request.jwt.claims','{\"sub\":\"$ANN\",\"email\":\"ann@corp.com\",\"is_anonymous\":false,\"amr\":[{\"method\":\"otp\"}]}',false);
  do \$\$ begin for i in 1..600 loop begin insert into public.bearing_controls(user_id,obligation_id) values ('$ANN','bulk:'||i); exception when others then if sqlerrm <> 'controls_pro_limit' then raise; end if; exit; end; end loop; end \$\$;" >/dev/null
check "pro stops at 500" "$(as $ANN ann@corp.com false "select count(*) from public.bearing_controls;")" "500"
Q -c "delete from auth.users where id='$ANN'" >/dev/null
check "deleting the user deletes the rows" "$(Q -c "select count(*) from public.bearing_controls where user_id='$ANN'")" "0"
exit $fail
