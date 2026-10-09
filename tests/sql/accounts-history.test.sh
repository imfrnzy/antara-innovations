#!/usr/bin/env bash
# Runs migration 030 against a scratch Postgres and checks who may save, how many, and who may see what.
# Usage: PGPORT=5544 PGHOST=/tmp/work/pg PGUSER=pgtest bash tests/sql/accounts-history.test.sh
set -euo pipefail
cd "$(dirname "$0")"
export PGUSER=${PGUSER:-pgtest}
DB=acctest_$$
createdb "$DB"; trap 'dropdb "$DB"' EXIT
Q() { psql -v ON_ERROR_STOP=1 -qtA -d "$DB" "$@"; }
Q -f stub-auth.sql >/dev/null
Q -f ../../supabase/migrations/030_accounts_history.sql >/dev/null
Q -f ../../supabase/migrations/032_verified_sessions.sql >/dev/null
Q -f ../../supabase/migrations/030_accounts_history.sql >/dev/null   # idempotent re-run (030 then 032 again)
Q -f ../../supabase/migrations/032_verified_sessions.sql >/dev/null
ANN=11111111-1111-1111-1111-111111111111; BOB=22222222-2222-2222-2222-222222222222; GUEST=33333333-3333-3333-3333-333333333333; GUEST2=44444444-4444-4444-4444-444444444444
Q -c "insert into auth.users values ('$ANN'),('$BOB'),('$GUEST'),('$GUEST2')" >/dev/null
SNAP='{"v":1,"kind":"records","tools":[]}'

# as <uid> <email|-> <anonymous true|false> <sql>   (runs as the logged-in role; prints last line or the error)
as() {
  local amr="${AMR:-}"; [ -z "$amr" ] && amr='[{"method":"otp"}]'
  local claims="{\"sub\":\"$1\",\"email\":\"$([ "$2" = "-" ] && echo "" || echo "$2")\",\"is_anonymous\":$3,\"amr\":$amr}" out
  out=$(psql -X -tA -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); select set_config('request.jwt.claims','$claims',false); $4" 2>&1 || true)
  if echo "$out" | grep -q 'ERROR:'; then echo "$out" | grep -m1 'ERROR:'; else echo "$out" | grep -v '^$' | tail -1; fi
}
ins() { as "$1" "$2" "$3" "insert into public.scan_history(user_id,tool,label,snapshot) values ('$1','${4:-soundings}','x','${5:-$SNAP}');"; }

fail=0; ok(){ echo "ok   $1"; }; bad(){ echo "FAIL $1 (got: $2)"; fail=1; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi; }
has(){ if echo "$2" | grep -q "$3"; then ok "$1"; else bad "$1" "$2"; fi; }

has "anonymous login cannot save" "$(ins $GUEST - true)" "sign_in_required"
has "login with no email cannot save" "$(ins $GUEST - false)" "sign_in_required"
has "the anon role has no access at all" "$(Q -c "set role anon; select count(*) from public.scan_history;" 2>&1)" "permission denied"

check "plan is free by default" "$(as $ANN ann@corp.com false "select public.my_plan();")" "free"
check "save 1" "$(ins $ANN ann@corp.com false)" "INSERT 0 1"
check "save 2" "$(ins $ANN ann@corp.com false)" "INSERT 0 1"
check "save 3" "$(ins $ANN ann@corp.com false)" "INSERT 0 1"
has "save 4 refused on free" "$(ins $ANN ann@corp.com false)" "free_limit"
check "the other tool has its own allowance" "$(ins $ANN ann@corp.com false sentinel)" "INSERT 0 1"

check "bob sees none of ann's scans" "$(as $BOB bob@corp.com false "select count(*) from public.scan_history;")" "0"
check "ann sees her own" "$(as $ANN ann@corp.com false "select count(*) from public.scan_history where tool='soundings';")" "3"
check "bob cannot save as ann, and learns nothing about her count" "$(as $BOB bob@corp.com false "insert into public.scan_history(user_id,tool,snapshot) values ('$ANN','soundings','$SNAP');")" "ERROR:  not_allowed"
has "nobody can edit a saved scan" "$(as $ANN ann@corp.com false "update public.scan_history set label='changed';")" "permission denied"
check "bob cannot delete ann's scan" "$(as $BOB bob@corp.com false "delete from public.scan_history;")" "DELETE 0"

has "the plan table is closed to logged-in users" "$(as $ANN ann@corp.com false "select * from public.plan_grants;")" "permission denied"
has "logged-in users cannot grant themselves Pro" "$(as $ANN ann@corp.com false "select public.grant_plan('ann@corp.com','pro',30,'cheeky');")" "permission denied"
has "logged-in users cannot revoke" "$(as $ANN ann@corp.com false "select public.revoke_plan('ann@corp.com');")" "permission denied"
has "the anon role cannot grant either" "$(Q -c "set role anon; select public.grant_plan('a@b.com','pro',1,'');" 2>&1)" "permission denied"

# You grant Pro by hand, as the database owner
Q -c "select public.grant_plan('Ann@Corp.com','pro',30,'invoice 001');" >/dev/null
check "grant is stored lower-case" "$(Q -c "select email from public.plan_grants;")" "ann@corp.com"
check "plan becomes pro" "$(as $ANN ann@corp.com false "select public.my_plan();")" "pro"
check "an email typed into an anonymous-method session does not get Pro" "$(AMR='[{"method":"anonymous"}]' as $ANN ann@corp.com false "select public.my_plan();")" "free"
check "a login with no method recorded does not get Pro" "$(AMR='[]' as $ANN ann@corp.com false "select public.my_plan();")" "free"
has "and an unproven email cannot save either" "$(AMR='[{"method":"anonymous"}]' ins $ANN ann@corp.com false)" "sign_in_required"
check "a password login counts as proven" "$(AMR='[{"method":"password"}]' as $ANN ann@corp.com false "select public.my_plan();")" "pro"
check "a different person is still free" "$(as $BOB bob@corp.com false "select public.my_plan();")" "free"
check "the claim in the token is matched in lower case" "$(as $ANN ANN@CORP.COM false "select public.my_plan();")" "pro"
check "save 4 now allowed" "$(ins $ANN ann@corp.com false)" "INSERT 0 1"

# Pro stops at 200
Q -c "set role authenticated; select set_config('request.jwt.claim.sub','$ANN',false); select set_config('request.jwt.claims','{\"sub\":\"$ANN\",\"email\":\"ann@corp.com\",\"is_anonymous\":false,\"amr\":[{\"method\":\"otp\"}]}',false);
  do \$\$ begin for i in 1..250 loop begin insert into public.scan_history(user_id,tool,snapshot) values ('$ANN','soundings','$SNAP'); exception when others then if sqlerrm <> 'pro_limit' then raise; end if; exit; end; end loop; end \$\$;" >/dev/null
check "pro stops at 200" "$(as $ANN ann@corp.com false "select count(*) from public.scan_history where tool='soundings';")" "200"
has "201st refused with pro_limit" "$(ins $ANN ann@corp.com false)" "pro_limit"

# Expiry and revoke
Q -c "select public.grant_plan('bob@corp.com','pro',-1,'already ended');" >/dev/null
check "an ended grant counts as free" "$(as $BOB bob@corp.com false "select public.my_plan();")" "free"
Q -c "select public.grant_plan('bob@corp.com','pro',null,'no end date');" >/dev/null
check "a grant with no end date is pro" "$(as $BOB bob@corp.com false "select public.my_plan();")" "pro"
Q -c "select public.revoke_plan('BOB@corp.com');" >/dev/null
check "revoke returns to free" "$(as $BOB bob@corp.com false "select public.my_plan();")" "free"

# Size limit and delete frees a slot
BIG=$(python3 -c "import json;print(json.dumps({'v':1,'pad':'x'*70000}))")
has "a very large snapshot is refused" "$(as $BOB bob@corp.com false "insert into public.scan_history(user_id,tool,snapshot) values ('$BOB','sentinel','$BIG');")" "snapshot_too_large"
for i in 1 2 3; do ins $BOB bob@corp.com false sentinel >/dev/null; done
has "bob is full on the free plan" "$(ins $BOB bob@corp.com false sentinel)" "free_limit"
check "bob deletes one" "$(as $BOB bob@corp.com false "delete from public.scan_history where id=(select id from public.scan_history limit 1);")" "DELETE 1"
check "and can save again" "$(ins $BOB bob@corp.com false sentinel)" "INSERT 0 1"
check "bad tool name refused" "$(as $BOB bob@corp.com false "insert into public.scan_history(user_id,tool,snapshot) values ('$BOB','nonsense','$SNAP');" | grep -c 'violates check constraint')" "1"
for T in keel halo bearing squall ensign; do
  check "$T can be saved" "$(ins $GUEST2 g2@corp.com false $T)" "INSERT 0 1"
done

# Removing a user removes their scans
Q -c "delete from auth.users where id='$BOB'" >/dev/null
check "deleting the user deletes their scans" "$(Q -c "select count(*) from public.scan_history where user_id='$BOB'")" "0"

exit $fail
