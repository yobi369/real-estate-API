import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;
export const pool = config.DATABASE_URL ? new Pool({
  connectionString: config.DATABASE_URL,
  ...(config.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: true } } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
}) : null;

export async function migrate(): Promise<void> {
  if (!pool) {
    if (config.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
    return;
  }

  const client = await pool.connect();
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
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS agency_invitations_agency_idx ON agency_invitations (agency_id,created_at DESC);
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

      INSERT INTO schema_migrations(version) VALUES (1),(2),(3) ON CONFLICT (version) DO NOTHING;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
