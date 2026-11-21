#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?Set DATABASE_URL to the disposable CI source database}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

# Use PostgreSQL 16 client binaries to match the PostgreSQL 16 service exactly.
# The runner's packaged client may be newer and emit settings unsupported by PG16.
pg_tools="$tmp_dir/postgres16-tools"
mkdir -m 700 "$pg_tools"
for tool in pg_dump pg_restore; do
  cat >"$pg_tools/$tool" <<'WRAPPER'
#!/usr/bin/env bash
exec docker run --rm -i --network host postgres:16 TOOL_PLACEHOLDER "$@"
WRAPPER
  sed -i "s/TOOL_PLACEHOLDER/$tool/" "$pg_tools/$tool"
  chmod 700 "$pg_tools/$tool"
done
export PATH="$pg_tools:$PATH"

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

# Exercise the optional S3-compatible off-host upload path with a local fake
# endpoint. The test verifies that both encrypted dump and checksum are
# uploaded, and that the backup script downloads and verifies the dump.
mock_bin="$tmp_dir/mock-bin"
remote_root="$tmp_dir/mock-object-store"
remote_backup_dir="$tmp_dir/remote-backups"
mkdir -m 700 "$mock_bin" "$remote_root" "$remote_backup_dir"
cat >"$mock_bin/aws" <<'MOCK_AWS'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == "s3" && "$2" == "cp" ]] || { echo "Unexpected mock AWS command" >&2; exit 2; }
source_path="$3"
destination_path="$4"
if [[ "$source_path" == s3://* ]]; then
  source_path="$REMOTE_ROOT/${source_path#s3://}"
fi
if [[ "$destination_path" == s3://* ]]; then
  destination_path="$REMOTE_ROOT/${destination_path#s3://}"
fi
mkdir -p "$(dirname "$destination_path")"
cp "$source_path" "$destination_path"
MOCK_AWS
chmod 700 "$mock_bin/aws"
PATH="$mock_bin:$PATH" REMOTE_ROOT="$remote_root" DATABASE_URL="$DATABASE_URL" \
  BACKUP_DIR="$remote_backup_dir" AGE_RECIPIENT="$recipient" \
  BACKUP_S3_URI='s3://test-bucket/real-estate-api' \
  bash "$script_dir/backup-postgres.sh"
remote_objects="$(find "$remote_root" -type f | wc -l | tr -d ' ')"
[[ "$remote_objects" == "2" ]] || { echo "Expected encrypted dump and checksum in remote store" >&2; exit 1; }

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
