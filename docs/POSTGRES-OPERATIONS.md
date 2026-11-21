# PostgreSQL backup and restore operations

This runbook is for the Real Estate API's PostgreSQL database. It is intentionally provider-neutral: the current deployment uses Neon PostgreSQL and Render for the API. Do not treat a Neon branch as the only backup, and do not treat a green application CI run as proof that a database restore works.

## Safety boundaries

- Never run a restore against the production database as a test.
- Never use `pg_restore --clean`, `DROP DATABASE`, or overwrite an existing target as part of a routine drill.
- Use a dedicated disposable restore database/branch and verify its identity before restoring.
- Backups contain account and contact data if such data is later stored. Encrypt them, restrict access, and apply an approved retention/deletion policy.
- Keep the age private identity separate from the backup files and from the application runtime.
- Do not put database URLs, passwords, private age identities, OAuth refresh tokens, or decrypted dumps in Git, logs, tickets, or chat.
- The scripts below create encrypted database dumps and refuse to restore into a non-empty target. They do not provision storage, configure provider retention, or prove that off-host copies are recoverable.

## Required backup policy decisions

Before accepting customer data, the service owner must document:
- Recovery point objective (maximum acceptable data loss).
- Recovery time objective (maximum acceptable outage).
- Backup frequency and retention period.
- Who can create, download, decrypt, and restore backups.
- Where the encrypted off-host copy is stored and how access is audited.
- How the age private identity is escrowed and rotated.

Provider-managed Neon restore history is useful for point-in-time recovery, but maintain an independent encrypted logical export for portability and disaster recovery. Confirm the actual Neon plan's retention and restore window in the Neon Console; do not assume a plan feature or retention duration.

## Tools

Install PostgreSQL client tools matching the deployed PostgreSQL major version (the current Neon project is PostgreSQL 16), [age](https://age-encryption.org/), and optionally [rclone](https://rclone.org/) or AWS CLI v2 for off-host copies.

Generate an age identity on a trusted operator machine and store the private identity securely:

```bash
age-keygen -o real-estate-backup-identity.txt
age-keygen -y real-estate-backup-identity.txt
```

The second command prints the public recipient. Store the private identity outside the repository in an approved secrets vault or offline secure location. The public recipient can be supplied to the backup job.

## Create an encrypted backup

Run from a trusted operator environment with network access to the intended database:

```bash
DATABASE_URL='(load from approved secret store)' \
BACKUP_DIR='/secure-backup-volume/real-estate-api' \
AGE_RECIPIENT='age1...' \
bash scripts/backup-postgres.sh
```

The script:
1. Uses PostgreSQL custom dump format.
2. Streams the dump directly through age encryption; it does not write a plaintext dump to disk.
3. Creates a SHA-256 checksum.
4. Restricts local file permissions.

## Google Drive off-host copy (free personal Drive)

Google Drive can be used without introducing an S3 bucket. A personal Google account's free storage quota is shared across Drive, Gmail, and Google Photos; check available space before selecting a retention period. This is a convenience destination, not an immutable backup vault.

1. Install rclone on the trusted backup runner.
2. Run `rclone config` interactively as the backup operator and create a remote named `gdrive` with the Google Drive backend. Complete Google's browser OAuth flow on the operator's own device.
3. Keep the rclone config (which contains refresh credentials) outside the repository, restrict it to the backup operator, and provide it to the job through a protected file/secret mount. Never commit or print it.
4. Create a private destination folder in Drive, for example `real-estate-api-backups`. Do not enable link sharing or public permissions.
5. Set `BACKUP_RCLONE_DESTINATION='gdrive:real-estate-api-backups'` in the backup job environment. Set `RCLONE_CONFIG` to the protected config file path if it is not in rclone's default location.

Example:

```bash
DATABASE_URL='(load from approved secret store)' \
BACKUP_DIR='/secure-backup-volume/real-estate-api' \
AGE_RECIPIENT='age1...' \
BACKUP_RCLONE_DESTINATION='gdrive:real-estate-api-backups' \
RCLONE_CONFIG='/secure-operator-secrets/rclone.conf' \
bash scripts/backup-postgres.sh
```

The script uploads only the already age-encrypted `.dump.age` and its `.sha256` sidecar. It downloads both objects again, checks the dump digest, and compares the checksum sidecar before reporting success. The rclone remote is not created automatically; configure and authorize it privately first.

Use the narrowest practical Google Drive scope in rclone's setup, and review the permissions requested by the OAuth flow. For a dedicated OAuth client, follow rclone's current Google Drive setup documentation; do not put a client secret or refresh token in GitHub issues, chat, or application logs.

**Retention:** no automatic remote deletion is performed by the backup script. Start with manual inspection and an owner-approved retention schedule. Before enabling automated deletion, prove a restore from Drive and document retention, quota monitoring, and recovery access. Keep at least one separately protected copy of the age private identity; Drive backups cannot be decrypted without it.

## Optional S3-compatible off-host copy

The backup script can also upload the encrypted dump and checksum to a private S3-compatible object store:

```bash
DATABASE_URL='(load from approved secret store)' \
BACKUP_DIR='/secure-backup-volume/real-estate-api' \
AGE_RECIPIENT='age1...' \
BACKUP_S3_URI='s3://private-bucket/real-estate-api' \
AWS_ACCESS_KEY_ID='(load from approved secret store)' \
AWS_SECRET_ACCESS_KEY='(load from approved secret store)' \
AWS_ENDPOINT_URL='(provider S3 endpoint; omit for AWS)' \
AWS_DEFAULT_REGION='(provider region; R2 uses auto)' \
bash scripts/backup-postgres.sh
```

- Use a private bucket and credentials scoped to the single backup bucket/prefix with only the required object read/write permissions.
- For Cloudflare R2, use the account's S3 endpoint and an R2 S3 token; never use a global Cloudflare API token for backup jobs.
- The script uploads the `.dump.age` and `.sha256` objects, downloads both again, and verifies the dump and checksum sidecar.
- If `BACKUP_S3_URI` is absent, this path is skipped. If both off-host variables are absent, the script explicitly warns that the run created only a local backup.
- Configure and verify object lifecycle/retention separately. Do not enable automatic deletion until the retention policy is approved and a restore has been proven.

CI exercises both off-host transfer paths using local mock commands. This validates the copy/download/checksum flow, not live Google OAuth, a real Drive account, cloud availability, quota, or lifecycle policy.

## Automated backup/restore verification

CI runs an end-to-end test against a disposable PostgreSQL 16 database. It generates an ephemeral age identity, writes a probe row, creates an encrypted logical backup, restores it into a newly created empty database, verifies the restored row, and confirms that a second restore is refused once the target is populated. Mock S3 and rclone commands verify that both encrypted dump and checksum sidecar are uploaded and downloaded for checksum comparison.

This validates the repository scripts and encryption/decryption flow in CI. It is not evidence of a real off-host backup copy, scheduled retention, a production restore, or an achieved RPO/RTO.

## Restore drill

Create a disposable empty PostgreSQL 16 database or isolated Neon branch dedicated to restore testing. Never point this procedure at the production database.

```bash
BACKUP_FILE='/secure-backup-volume/real-estate-api/real-estate-api-YYYYMMDDTHHMMSSZ.dump.age' \
AGE_IDENTITY_FILE='/secure-operator-secrets/real-estate-backup-identity.txt' \
TARGET_DATABASE_URL='(load disposable restore database URL from approved secret store)' \
RESTORE_CONFIRM='RESTORE_TO_EMPTY_DATABASE' \
bash scripts/restore-postgres.sh
```

The restore script validates the checksum, checks that the target contains no user relations, routines, types, non-default schemas, large objects, event triggers, publications, subscriptions, or foreign-data objects, decrypts the dump as a stream, and uses a single PostgreSQL restore transaction. It does not drop objects or clear an existing database.

## Post-restore verification

Record evidence for each drill:
- Backup filename, checksum, creation time, source branch/database identifier, and PostgreSQL major version (never record credentials).
- Restore target identifier and confirmation it was isolated/disposable.
- Restore start/end timestamps and elapsed time.
- Restored table inventory and row counts for `users`, `properties`, `inquiries`, agency tables, and audit events where present.
- `schema_migrations` contents and application schema compatibility.
- Application startup, `/health/live`, `/health/ready`, login with a designated test account, tenant isolation, listing read/write, and enquiry flow using synthetic test data.
- Any errors, data discrepancies, and remediation.

Delete the disposable restore target and temporary credentials only after evidence is captured and the owner approves cleanup. Keep the evidence record without customer personal data.

## Migration execution boundary

The application server no longer runs schema DDL at startup. Run `npm run db:migrate` as a controlled one-off job before deploying the application release. In production, set both:

- `DATABASE_URL`: the restricted runtime role connection string.
- `MIGRATION_DATABASE_URL`: a separate schema-owner/migration role connection string, available only to the one-off migration job.

The current migration body remains one idempotent DDL/backfill transaction and records legacy marker versions; it has not yet been decomposed into independently versioned, ordered migration files. Treat schema evolution as operator-controlled until that migration history is formalized. Test every migration on an isolated Neon branch before production execution.

## Release gate

A backup is not considered verified until an encrypted copy exists off-host and a restore has completed into an isolated empty target with the application-level checks above. Record the date, operator, RPO/RTO achieved, and reviewer sign-off in the production-readiness evidence.
