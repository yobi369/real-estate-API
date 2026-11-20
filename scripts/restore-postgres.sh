#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_FILE:?Set BACKUP_FILE to the encrypted .dump.age file}"
: "${AGE_IDENTITY_FILE:?Set AGE_IDENTITY_FILE to the private age identity file}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL to a disposable, empty restore database}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE to proceed}"

if [[ "$RESTORE_CONFIRM" != "RESTORE_TO_EMPTY_DATABASE" ]]; then
  echo "Refusing restore: explicit confirmation value is missing" >&2
  exit 2
fi

for command in age pg_restore psql sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 127; }
done

test -f "$BACKUP_FILE" || { echo "Backup file not found" >&2; exit 1; }
test -f "$AGE_IDENTITY_FILE" || { echo "Age identity file not found" >&2; exit 1; }
test -f "$BACKUP_FILE.sha256" || { echo "Backup checksum file not found" >&2; exit 1; }

(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum --check "$(basename "$BACKUP_FILE").sha256"
)

# Never drop or clean an existing schema. Reject relations, routines, types,
# non-default schemas, and database-level objects that are not covered by the
# ordinary relation checks (for example large objects and event triggers).
object_count="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
  SELECT count(*) FROM (
    SELECT c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    UNION ALL
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION ALL
    SELECT t.oid
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION ALL
    SELECT n.oid
    FROM pg_namespace n
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
    UNION ALL
    SELECT oid FROM pg_largeobject_metadata
    UNION ALL
    SELECT oid FROM pg_event_trigger
    UNION ALL
    SELECT oid FROM pg_publication
    UNION ALL
    SELECT oid FROM pg_subscription
    UNION ALL
    SELECT oid FROM pg_foreign_data_wrapper
    UNION ALL
    SELECT oid FROM pg_foreign_server
    UNION ALL
    SELECT oid FROM pg_user_mapping
  ) AS user_objects
")"

if [[ ! "$object_count" =~ ^[0-9]+$ ]] || [[ "$object_count" -ne 0 ]]; then
  echo "Refusing restore: target database contains $object_count user objects" >&2
  exit 1
fi

# A single transaction prevents a partially restored target if any object fails.
age --decrypt --identity "$AGE_IDENTITY_FILE" "$BACKUP_FILE" \
  | pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-acl \
      --exit-on-error --single-transaction

echo "Restore completed into the explicitly supplied empty target database."
echo "Run the application-level verification checklist before treating this restore as valid."
