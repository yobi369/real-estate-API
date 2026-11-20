#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the disposable CI PostgreSQL database}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
guard_sql="$script_dir/restore-target-guard.sql"

empty_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -f "$guard_sql")"
[[ "$empty_count" == "0" ]] || { echo "Expected an empty database, found $empty_count objects" >&2; exit 1; }

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c 'CREATE TABLE public.restore_target_guard_probe(id integer)'
cleanup() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c 'DROP TABLE IF EXISTS public.restore_target_guard_probe' >/dev/null
  if [[ -n "${large_object_oid:-}" ]]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c "SELECT lo_unlink($large_object_oid)" >/dev/null || true
  fi
}
trap cleanup EXIT

table_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -f "$guard_sql")"
[[ "$table_count" =~ ^[0-9]+$ && "$table_count" -gt 0 ]] || { echo "Restore guard failed to detect a user table" >&2; exit 1; }

large_object_oid="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT lo_create(0)')"
[[ "$large_object_oid" =~ ^[0-9]+$ ]] || { echo "Could not create test large object" >&2; exit 1; }

large_object_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -f "$guard_sql")"
[[ "$large_object_count" =~ ^[0-9]+$ && "$large_object_count" -gt "$table_count" ]] || { echo "Restore guard failed to detect a large object" >&2; exit 1; }

echo "Restore target guard detected an empty database, a user table, and a large object."
