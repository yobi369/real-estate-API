import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;
const poolOptions = (connectionString: string) => ({
  connectionString,
  ...(config.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: true } } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

export const pool = config.DATABASE_URL ? new Pool(poolOptions(config.DATABASE_URL)) : null;
// Migrations may use a separate owner-level credential. The runtime pool remains
// bound to DATABASE_URL and is never used by server startup for schema changes.
export const migrationPool = config.MIGRATION_DATABASE_URL
  ? new Pool(poolOptions(config.MIGRATION_DATABASE_URL))
  : pool;

export async function migrate(targetPool: pg.Pool | null = migrationPool): Promise<void> {
  if (!targetPool) {
    if (config.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
    return;
  }

  const client = await targetPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(2026111501)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        CHECK (expires_at > created_at)
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
        ON auth_sessions (user_id,expires_at DESC) WHERE revoked_at IS NULL;
      CREATE TABLE IF NOT EXISTS auth_email_tokens (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose text NOT NULL CHECK (purpose IN ('password_reset','email_verification')),
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS auth_email_tokens_user_purpose_idx
        ON auth_email_tokens (user_id,purpose,expires_at DESC) WHERE consumed_at IS NULL;
      CREATE TABLE IF NOT EXISTS auth_login_attempts (
        email_digest text PRIMARY KEY,
        failed_attempts integer NOT NULL CHECK (failed_attempts >= 0),
        locked_until timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS auth_login_attempts_locked_idx
        ON auth_login_attempts (locked_until) WHERE locked_until IS NOT NULL;
      DO $identity_runtime_grants$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_runtime') THEN
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.auth_email_tokens TO secure_properties_runtime',current_schema());
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.auth_login_attempts TO secure_properties_runtime',current_schema());
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_staging_app') THEN
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.auth_email_tokens TO secure_properties_staging_app',current_schema());
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.auth_login_attempts TO secure_properties_staging_app',current_schema());
        END IF;
      END
      $identity_runtime_grants$;
      DO $auth_session_runtime_grants$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_runtime') THEN
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.auth_sessions TO secure_properties_runtime',current_schema());
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_staging_app') THEN
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.auth_sessions TO secure_properties_staging_app',current_schema());
        END IF;
      END
      $auth_session_runtime_grants$;
      CREATE TABLE IF NOT EXISTS properties (
        id uuid PRIMARY KEY,
        owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        title varchar(120) NOT NULL,
        description varchar(5000) NOT NULL,
        price numeric(14,2) NOT NULL CHECK (price > 0),
        currency varchar(3) NOT NULL CHECK (currency IN ('KES','USD','GBP')),
        property_type text NOT NULL CHECK (property_type IN ('apartment','house','land','commercial')),
        transaction_type text NOT NULL CHECK (transaction_type IN ('sale','rent','lease')),
        bedrooms integer NOT NULL DEFAULT 0 CHECK (bedrooms >= 0),
        bathrooms integer NOT NULL DEFAULT 0 CHECK (bathrooms >= 0),
        city varchar(100) NOT NULL,
        country varchar(100) NOT NULL DEFAULT 'Kenya',
        image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug varchar(160) NOT NULL DEFAULT '';
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'property';
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_type text NOT NULL DEFAULT 'total';
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS location varchar(150) NOT NULL DEFAULT '';
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS address varchar(250) NOT NULL DEFAULT '';
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS area_sqm numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS size_acres numeric(12,4) NOT NULL DEFAULT 0;
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS title_status varchar(120);
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_use varchar(120);
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS max_guests integer NOT NULL DEFAULT 0;
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS properties_category_idx ON properties (category);
      CREATE INDEX IF NOT EXISTS properties_city_idx ON properties (lower(city));
      CREATE INDEX IF NOT EXISTS properties_price_idx ON properties (price);
      CREATE INDEX IF NOT EXISTS properties_owner_idx ON properties (owner_id);
      CREATE TABLE IF NOT EXISTS media_assets (
        id uuid PRIMARY KEY,
        content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
        data bytea NOT NULL,
        byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS media_assets_created_at_idx ON media_assets (created_at);
      CREATE TABLE IF NOT EXISTS inquiries (
        id uuid PRIMARY KEY,
        listing_id uuid REFERENCES properties(id) ON DELETE SET NULL,
        listing_title varchar(160),
        listing_category text CHECK (listing_category IS NULL OR listing_category IN ('property','airbnb','land')),
        request_type text NOT NULL CHECK (request_type IN ('general','booking','viewing','site_visit')),
        name varchar(120) NOT NULL,
        email varchar(254) NOT NULL,
        phone varchar(32) NOT NULL,
        message varchar(4000) NOT NULL,
        service varchar(120),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS inquiries_created_at_idx ON inquiries (created_at DESC);
      CREATE INDEX IF NOT EXISTS inquiries_status_idx ON inquiries (status);

      -- Multi-agency foundation. The new agency_id columns remain nullable during
      -- the compatibility phase; application authorization is added in later steps.
      CREATE TABLE IF NOT EXISTS agencies (
        id uuid PRIMARY KEY,
        name varchar(160) NOT NULL,
        slug varchar(180) NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS agency_memberships (
        id uuid PRIMARY KEY,
        agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner','admin','agent','viewer')),
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (agency_id,user_id)
      );
      CREATE INDEX IF NOT EXISTS agency_memberships_user_idx ON agency_memberships (user_id,status);
      CREATE INDEX IF NOT EXISTS agency_memberships_agency_idx ON agency_memberships (agency_id,status);
      CREATE TABLE IF NOT EXISTS agency_invitations (
        id uuid PRIMARY KEY,
        agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL CHECK (role IN ('admin','agent','viewer')),
        token_hash text NOT NULL UNIQUE,
        invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE agency_invitations ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
      CREATE INDEX IF NOT EXISTS agency_invitations_agency_idx ON agency_invitations (agency_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS agency_ownership_transfers (
        id uuid PRIMARY KEY,
        agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
        initiated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (initiated_by <> target_user_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agency_ownership_transfers_pending_agency_idx
        ON agency_ownership_transfers (agency_id)
        WHERE accepted_at IS NULL AND revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS agency_ownership_transfers_target_idx
        ON agency_ownership_transfers (target_user_id, expires_at DESC);

      CREATE TABLE IF NOT EXISTS audit_events (
        id uuid PRIMARY KEY,
        agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS audit_events_agency_created_idx ON audit_events (agency_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id uuid PRIMARY KEY,
        code varchar(60) NOT NULL UNIQUE,
        name varchar(100) NOT NULL,
        description varchar(500) NOT NULL DEFAULT '',
        currency varchar(3) NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
        price_minor bigint NOT NULL CHECK (price_minor > 0),
        billing_interval text NOT NULL CHECK (billing_interval IN ('month','year')),
        max_listings integer CHECK (max_listings IS NULL OR max_listings >= 0),
        max_members integer CHECK (max_members IS NULL OR max_members >= 0),
        monthly_api_requests bigint CHECK (monthly_api_requests IS NULL OR monthly_api_requests >= 0),
        features jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_active boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS subscription_plans_active_price_idx ON subscription_plans (is_active,price_minor);
      INSERT INTO subscription_plans
        (id,code,name,description,currency,price_minor,billing_interval,max_listings,max_members,monthly_api_requests,features,is_active)
      VALUES
        ('00000000-0000-4000-8000-000000000251','starter','Starter','For small agencies starting their digital property operations.','KES',250000,'month',25,3,NULL,'["agency_console","property_inventory","enquiries"]'::jsonb,false),
        ('00000000-0000-4000-8000-000000000252','professional','Professional','For growing agencies managing larger property portfolios.','KES',500000,'month',100,10,NULL,'["agency_console","property_inventory","enquiries","team_management","reports"]'::jsonb,false),
        ('00000000-0000-4000-8000-000000000253','business','Business','For established agencies and multi-team operations.','KES',1200000,'month',500,30,NULL,'["agency_console","property_inventory","enquiries","team_management","reports","priority_support"]'::jsonb,false)
      ON CONFLICT (code) DO UPDATE SET max_listings=EXCLUDED.max_listings,max_members=EXCLUDED.max_members,updated_at=now();
      CREATE TABLE IF NOT EXISTS agency_subscriptions (
        id uuid PRIMARY KEY,
        agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        status text NOT NULL CHECK (status IN ('pending','trialing','active','past_due','cancelled','expired')),
        provider text NOT NULL DEFAULT 'mpesa' CHECK (provider IN ('mpesa','manual')),
        provider_reference text,
        current_period_start timestamptz,
        current_period_end timestamptz,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agency_subscriptions_one_current_idx
        ON agency_subscriptions (agency_id) WHERE status IN ('pending','trialing','active','past_due');
      CREATE INDEX IF NOT EXISTS agency_subscriptions_agency_history_idx ON agency_subscriptions (agency_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS subscription_payments (
        id uuid PRIMARY KEY,
        agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
        subscription_id uuid REFERENCES agency_subscriptions(id) ON DELETE SET NULL,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        provider text NOT NULL CHECK (provider IN ('mpesa','manual')),
        idempotency_key varchar(128) NOT NULL,
        checkout_request_id text UNIQUE,
        merchant_request_id text,
        phone_number varchar(20),
        amount_minor bigint NOT NULL CHECK (amount_minor > 0),
        currency varchar(3) NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
        status text NOT NULL CHECK (status IN ('initiated','pending','succeeded','failed','expired')),
        result_code text,
        result_description text,
        mpesa_receipt_number text UNIQUE,
        callback_payload jsonb,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (agency_id,idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS subscription_payments_agency_created_idx ON subscription_payments (agency_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS subscription_payments_status_created_idx ON subscription_payments (status,created_at DESC);
      CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
        bucket_key text PRIMARY KEY,
        request_count integer NOT NULL CHECK (request_count > 0),
        reset_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_reset_idx ON api_rate_limit_buckets (reset_at);
      DO $rate_limit_runtime_grants$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_runtime') THEN
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.api_rate_limit_buckets TO secure_properties_runtime',current_schema());
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_staging_app') THEN
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.api_rate_limit_buckets TO secure_properties_staging_app',current_schema());
        END IF;
      END
      $rate_limit_runtime_grants$;
      CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_one_pending_per_agency_idx ON subscription_payments (agency_id) WHERE status IN ('initiated','pending');
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft','published','archived'));
      CREATE INDEX IF NOT EXISTS properties_publication_status_created_idx ON properties (publication_status,created_at DESC);
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE RESTRICT;
      ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE RESTRICT;
      CREATE INDEX IF NOT EXISTS properties_agency_created_idx ON properties (agency_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS inquiries_agency_created_idx ON inquiries (agency_id,created_at DESC);

      -- Preserve existing production inventory in one explicit legacy agency.
      -- The oldest existing administrator becomes its owner; if no administrator
      -- exists yet, the oldest account is used as the migration owner.
      DO $tenancy_backfill$
      DECLARE
        default_owner_id uuid;
        default_agency_id uuid;
      BEGIN
        SELECT id INTO default_owner_id
          FROM users
          ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END, created_at, id
          LIMIT 1;

        IF default_owner_id IS NOT NULL THEN
          SELECT id INTO default_agency_id FROM agencies WHERE slug='legacy-default';
          IF default_agency_id IS NULL THEN
            default_agency_id := gen_random_uuid();
            INSERT INTO agencies(id,name,slug,created_by)
              VALUES(default_agency_id,'Default Agency','legacy-default',default_owner_id);
          END IF;

          INSERT INTO agency_memberships(id,agency_id,user_id,role,status)
            SELECT gen_random_uuid(),default_agency_id,u.id,
              CASE WHEN u.id=default_owner_id THEN 'owner'
                   WHEN u.role='admin' THEN 'admin'
                   ELSE 'agent' END,
              'active'
            FROM users u
            WHERE u.id=default_owner_id
               OR u.role='admin'
               OR EXISTS (SELECT 1 FROM properties p WHERE p.owner_id=u.id)
            ON CONFLICT (agency_id,user_id) DO NOTHING;

          UPDATE properties SET agency_id=default_agency_id WHERE agency_id IS NULL;
          UPDATE inquiries SET agency_id=default_agency_id WHERE agency_id IS NULL;
        END IF;
      END
      $tenancy_backfill$;

      INSERT INTO schema_migrations(version) VALUES (1),(2),(3),(4),(5),(6),(7) ON CONFLICT (version) DO NOTHING;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
