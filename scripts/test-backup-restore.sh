#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?Set DATABASE_URL to the disposable CI source database}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

identity="$tmp_dir/age-identity.txt"
backup_dir="$tmp_dir/backups"
mkdir -m 700 "$backup_dir"
age-keygen -o "$identity" >/dev/null 2>&1
recipient="$(age-keygen -y "$identity")"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
  'CREATE TABLE public.backup_restore_probe(id integer PRIMARY KEY,payload text NOT NULL)'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
  "INSERT INTO public.backup_restore_probe(id,payload) VALUES(1,'encrypted-restore-ci-probe')"

DATABASE_URL="$DATABASE_URL" BACKUP_DIR="$backup_dir" AGE_RECIPIENT="$recipient" \
  bash "$script_dir/backup-postgres.sh"

mapfile -t backups < <(find "$backup_dir" -maxdepth 1 -type f -name '*.dump.age' -print)
[[ "${#backups[@]}" -eq 1 ]] || { echo "Expected exactly one encrypted backup" >&2; exit 1; }

createdb --maintenance-db="$DATABASE_URL" restore_drill
target_database_url="${DATABASE_URL%/*}/restore_drill"

BACKUP_FILE="${backups[0]}" \
AGE_IDENTITY_FILE="$identity" \
TARGET_DATABASE_URL="$target_database_url" \
RESTORE_CONFIRM='RESTORE_TO_EMPTY_DATABASE' \
  bash "$script_dir/restore-postgres.sh"

restored="$(psql "$target_database_url" -X -v ON_ERROR_STOP=1 -Atq -c \
  "SELECT count(*) FROM public.backup_restore_probe WHERE id=1 AND payload='encrypted-restore-ci-probe'")"
[[ "$restored" == "1" ]] || { echo "Restored data did not match the source probe" >&2; exit 1; }

# A second restore into the now-populated target must be refused safely.
if BACKUP_FILE="${backups[0]}" \
   AGE_IDENTITY_FILE="$identity" \
   TARGET_DATABASE_URL="$target_database_url" \
   RESTORE_CONFIRM='RESTORE_TO_EMPTY_DATABASE' \
     bash "$script_dir/restore-postgres.sh" >"$tmp_dir/second-restore.log" 2>&1; then
  echo "Restore script unexpectedly accepted a non-empty target" >&2
  exit 1
fi
grep -q "Refusing restore: target database contains" "$tmp_dir/second-restore.log" || {
  cat "$tmp_dir/second-restore.log" >&2
  echo "Restore failed for a reason other than the non-empty target guard" >&2
  exit 1
}

echo "Encrypted PostgreSQL backup and restore passed; non-empty target was refused."
