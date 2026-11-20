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

## Proposed pilot backup baseline (approval required)

Use the following as initial planning targets for a controlled pilot; they are not achieved guarantees and must be confirmed against the selected Neon plan, backup destination, and customer agreement:
- RPO target: at most 24 hours.
- RTO target: at most 8 hours for critical service restoration.
- At least one encrypted logical backup every 24 hours.
- Proposed retention: 30 daily restore points, with an off-host encrypted copy.
- Quarterly restore drill and after material backup/restore changes.

Before accepting customer data, the service owner must document and approve:
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

The restore script validates the checksum, checks that the target contains no user objects, decrypts the dump as a stream, and uses a single PostgreSQL restore transaction. It does not drop objects or clear an existing database.

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

A backup is not considered verified until an encrypted copy exists off-host and a restore has completed into an isolated empty target with the application-level checks above. Record the date, operator, backup age at recovery, restore duration, RPO/RTO achieved, and reviewer sign-off in the production-readiness evidence. The current Neon branch-copy drill is not an independent logical backup/restore drill.

## Isolated staging migration rehearsal — 2026-11-20

A disposable Neon child branch was created from the staging branch and used to replay the exact migration SQL from the `security/distributed-rate-limiting` branch. This is a rehearsal only; neither the shared staging branch nor production was migrated.

- Source: staging branch snapshot (PostgreSQL 16).
- Disposable target: `staging-migration-rehearsal-2026-11-20` (`br-damp-tree-aod6jsil`).
- Before: one user, one inquiry, one media asset, and migration markers 1–2.
- Applied: all 56 SQL statements from the application migration, in one transaction.
- After: one user, one inquiry, one media asset, one legacy agency, one owner membership, three seeded subscription plans (all inactive), and migration markers 1–5.
- Replayed the same 56 statements a second time: row counts remained unchanged; no duplicate legacy agency, membership, or plan was created.
- Verified inquiry tenant backfill and preservation of the existing media asset.
- Created a non-login runtime-role test principal on the disposable branch and verified schema USAGE plus SELECT/INSERT/UPDATE/DELETE on tables, while CREATE schema, TRUNCATE, TRIGGER, and REFERENCES remained denied. Default privileges for future tables and sequences were configured for the rehearsal role.

This proves the current migration can be applied and replayed against a copy of the staging data. It does not prove the actual staging Render service is configured with the new runtime credential, that the staging service can start against the migrated schema, or that the production migration is approved. Keep the disposable branch until the evidence is reviewed; do not treat it as a backup or customer environment.

## Shared staging migration — 2026-11-20

After the disposable rehearsal passed, the same v5 migration was applied transactionally to the shared Neon staging branch (`staging`, `br-wispy-glade-aomxo2z8`). This was not a production operation.

Verified after migration:
- Schema markers: versions 1–5.
- Existing data preserved: 1 user, 1 inquiry, 1 media asset.
- Legacy backfill: 1 agency, 1 owner membership, and the existing inquiry assigned to that agency.
- Subscription catalog: 3 plans seeded; all 3 remain inactive.
- Distributed rate-limit table exists and contains no buckets.
- A `secure_properties_runtime` group role was created as `NOLOGIN`, granted CONNECT, schema USAGE, table DML and sequence usage, and given default privileges for future tables/sequences.
- Explicit privilege checks confirm no schema CREATE, table TRUNCATE, TRIGGER, or REFERENCES privilege.

The NOLOGIN role is a privilege template, not an application credential. The Render staging service has not yet been switched to it; a separate managed login credential and staging environment configuration are still required. The staging service has not been redeployed as part of this database operation. Production remains at its prior schema version and has not been migrated.

## Staging runtime split verification — 2026-11-20

The v5 schema is applied to the shared staging branch `staging` (`br-wispy-glade-aomxo2z8`). A separate Render staging candidate was deployed from the security branch:

- Service: `secure-properties-api-staging-v2` — `https://secure-properties-api-staging-v2.onrender.com`.
- Branch/commit: `security/distributed-rate-limiting` / `fb01da6052e09a0451bd9097c9199bb4688db480`.
- Render deploy: `dep-dc02i4dg1s2s73e09700`, status `live`.
- `DATABASE_URL` uses the restricted `secure_properties_staging_app` login.
- `MIGRATION_DATABASE_URL` currently mirrors the restricted staging runtime login. No owner-level database credential is stored in the long-running candidate service. For a controlled manual migration, inject the owner credential only into a separate one-off execution environment.
- The runtime login can use schema `public` and perform ordinary table DML, including inserting a temporary rate-limit bucket. It cannot CREATE in schema `public`. The temporary test row was deleted after verification.
- The application readiness SQL predicate returned `ready=true`; schema migration markers 1–5 were present. Counts remained 1 user, 0 properties, 1 inquiry, 1 agency, 1 membership, and 3 inactive plans.
- Temporary secret-generation database roles were revoked and dropped after their generated values were stored as staging environment variables.

The earlier staging service was restored to its previous owner-level database URL so it would not remain broken while the new candidate is tested. It is a legacy compatibility service on the older `integration/secure-properties-platform` branch, not the release candidate. The candidate's Render deploy is live and startup logged no application configuration or database-permission error. The owner-level staging credential was removed from the candidate environment before the latest redeploy; both database URL variables now resolve to the restricted login. The external HTTP health/readiness routes, authentication/bootstrap, tenant isolation, quota enforcement, M-Pesa sandbox callbacks, and live multi-request rate-limit behavior still require explicit staging tests.

No production database migration, production secret update, production deployment, PR merge, or subscription-plan activation was performed. Do not copy the staging owner credential into the production runtime; production must use its own separately managed migration and least-privilege runtime credentials.
