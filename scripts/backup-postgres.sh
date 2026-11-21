#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?Set DATABASE_URL to the source PostgreSQL database}"
: "${BACKUP_DIR:?Set BACKUP_DIR to a private backup directory}"
: "${AGE_RECIPIENT:?Set AGE_RECIPIENT to the age public recipient}"

for command in pg_dump age sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 127; }
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/real-estate-api-$timestamp.dump.age"
temporary="$(mktemp "$BACKUP_DIR/.real-estate-api-$timestamp.XXXXXX")"
trap 'rm -f "$temporary"' EXIT

# Custom-format dumps support selective inspection and restore with pg_restore.
# Encrypt in the stream so an unencrypted dump is never written to disk.
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" \
  | age --encrypt --recipient "$AGE_RECIPIENT" > "$temporary"

test -s "$temporary" || { echo "Backup output is empty" >&2; exit 1; }
if [[ -e "$output" || -e "$output.sha256" ]]; then
  echo "Refusing to overwrite an existing backup: $output" >&2
  exit 1
fi
mv "$temporary" "$output"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$output")" > "$(basename "$output").sha256"
)
chmod 600 "$output" "$output.sha256"

echo "Encrypted backup created: $output"
echo "Checksum created: $output.sha256"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  command -v aws >/dev/null 2>&1 || { echo "BACKUP_S3_URI is set but AWS CLI was not found" >&2; exit 127; }
  remote_prefix="${BACKUP_S3_URI%/}"
  remote_backup="$remote_prefix/$(basename "$output")"
  remote_checksum="$remote_backup.sha256"
  verification_file="$(mktemp "$BACKUP_DIR/.remote-verify.XXXXXX")"
  trap 'rm -f "$temporary" "$verification_file"' EXIT

  # The source dump is already age-encrypted before it is uploaded. For R2,
  # set AWS_ENDPOINT_URL to the account's S3-compatible endpoint and use
  # bucket-scoped credentials with only the required object permissions.
  aws s3 cp "$output" "$remote_backup" --only-show-errors
  aws s3 cp "$output.sha256" "$remote_checksum" --only-show-errors
  aws s3 cp "$remote_backup" "$verification_file" --only-show-errors
  local_digest="$(sha256sum "$output" | awk '{print $1}')"
  remote_digest="$(sha256sum "$verification_file" | awk '{print $1}')"
  [[ "$local_digest" == "$remote_digest" ]] || {
    echo "Off-host backup verification failed: downloaded object checksum differs" >&2
    exit 1
  }
  rm -f "$verification_file"
  echo "Off-host encrypted copy uploaded and checksum-verified: $remote_backup"
else
  echo "WARNING: BACKUP_S3_URI is unset; this run produced only a local encrypted backup."
  echo "Copy both files to encrypted, access-controlled off-host storage and complete a restore drill."
fi
