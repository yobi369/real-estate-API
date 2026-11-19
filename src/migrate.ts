import { config } from './config.js';
import { migrate, migrationPool } from './db.js';

try {
  if (config.NODE_ENV === 'production' && !config.MIGRATION_DATABASE_URL) {
    throw new Error('MIGRATION_DATABASE_URL is required for production migration jobs');
  }
  if (!migrationPool) throw new Error('DATABASE_URL is required to run database migrations');
  await migrate(migrationPool);
  process.stdout.write('Database schema initialization completed.\n');
} catch (error) {
  process.stderr.write(`Database schema initialization failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
} finally {
  if (migrationPool) await migrationPool.end();
}
