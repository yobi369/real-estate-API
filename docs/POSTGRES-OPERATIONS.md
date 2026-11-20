# PostgreSQL backup and restore operations

This runbook is for the Real Estate API's PostgreSQL database. It is intentionally provider-neutral: the current deployment uses Neon PostgreSQL and Render for the API. Do not treat a Neon branch as the only backup, and do not treat a green application CI run as proof that a database restore works.

## Safety boundaries

- Never run a restore against the production database as a test.
- Never use `pg_restore --clean`, `DROP DATABASE`, or overwrite an existing target as part of a routine drill.
- Use a dedicated disposable restore database/branch and verify its identity before restoring.
- Backups contain account and contact data if such data is later stored. Encrypt them, restrict access, and apply an approved retention/deletion policy.
- Keep the age private identity separate from the backup files and from the application runtime.
- Do not put database URLs, passwords, private age identities, or decrypted dumps in Git, logs, tickets, or chat.
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

Install PostgreSQL client tools matching the deployed PostgreSQL major version (the current Neon project is PostgreSQL 16) and [age](https://age-encryption.org/).

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

Copy both the `.dump.age` and `.dump.age.sha256` files to a separate, encrypted, access-controlled storage location. Verify the copied checksum. A local copy on the same host or volume is not an off-host backup.

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
