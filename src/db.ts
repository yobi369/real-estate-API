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
      INSERT INTO schema_migrations(version) VALUES (1),(2) ON CONFLICT (version) DO NOTHING;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
