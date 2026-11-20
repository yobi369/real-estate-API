import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Pool as PgPool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { migrate, pool } from '../src/db.js';

const { Pool } = pg;
const schemaName = 'legacy_migration_' + randomUUID().replaceAll('-', '');
let isolatedPool: PgPool | null = null;

afterAll(async () => {
  await isolatedPool?.end();
  if (pool && isolatedPool) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
});

describe('legacy PostgreSQL tenancy migration', () => {
  it('preserves existing users, properties, and enquiries while assigning a legacy agency', async () => {
    if (!pool || !config.DATABASE_URL) return;

    await pool.query(`CREATE SCHEMA "${schemaName}"`);
    isolatedPool = new Pool({
      connectionString: config.DATABASE_URL,
      options: `-c search_path=${schemaName}`
    });

    // Recreate the pre-tenancy tables and seed representative legacy records.
    await isolatedPool.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE properties (
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
      CREATE TABLE inquiries (
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
    `);

    const legacyAdminId = randomUUID();
    const legacyAgentId = randomUUID();
    const propertyId = randomUUID();
    const inquiryId = randomUUID();
    await isolatedPool.query(
      "INSERT INTO users(id,email,password_hash,role,created_at) VALUES ($1,'legacy-admin@example.test','hash-admin','admin','2025-01-01T00:00:00Z'),($2,'legacy-agent@example.test','hash-agent','user','2025-02-01T00:00:00Z')",
      [legacyAdminId, legacyAgentId]
    );
    await isolatedPool.query(
      "INSERT INTO properties(id,owner_id,title,description,price,currency,property_type,transaction_type,city) VALUES ($1,$2,'Legacy listing','Existing listing description',12500000,'KES','house','sale','Nairobi')",
      [propertyId, legacyAgentId]
    );
    await isolatedPool.query(
      "INSERT INTO inquiries(id,listing_id,request_type,name,email,phone,message) VALUES ($1,$2,'viewing','Test lead','lead@example.test','0700000000','Please arrange a viewing')",
      [inquiryId, propertyId]
    );

    await migrate(isolatedPool);

    const agency = await isolatedPool.query<{ id: string; name: string }>(
      "SELECT id,name FROM agencies WHERE slug='legacy-default'"
    );
    expect(agency.rows).toHaveLength(1);
    expect(agency.rows[0]?.name).toBe('Default Agency');

    const memberships = await isolatedPool.query<{ user_id: string; role: string }>(
      'SELECT user_id,role FROM agency_memberships WHERE agency_id=$1 ORDER BY user_id',
      [agency.rows[0]!.id]
    );
    expect(memberships.rows).toHaveLength(2);
    expect(memberships.rows).toContainEqual({ user_id: legacyAdminId, role: 'owner' });
    expect(memberships.rows).toContainEqual({ user_id: legacyAgentId, role: 'agent' });

    const migratedProperty = await isolatedPool.query<{ agency_id: string }>(
      'SELECT agency_id FROM properties WHERE id=$1',
      [propertyId]
    );
    const migratedInquiry = await isolatedPool.query<{ agency_id: string }>(
      'SELECT agency_id FROM inquiries WHERE id=$1',
      [inquiryId]
    );
    expect(migratedProperty.rows[0]?.agency_id).toBe(agency.rows[0]!.id);
    expect(migratedInquiry.rows[0]?.agency_id).toBe(agency.rows[0]!.id);

    const versions = await isolatedPool.query<{ versions: number[] }>(
      'SELECT array_agg(version ORDER BY version) AS versions FROM schema_migrations'
    );
    expect(versions.rows[0]?.versions).toEqual([1, 2, 3, 4]);
  });
});
