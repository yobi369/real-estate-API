import { migrate, pool } from './db.js';

try {
  if (!pool) throw new Error('DATABASE_URL is required to run database migrations');
  await migrate();
  process.stdout.write('Database schema initialization completed.\n');
} catch (error) {
  process.stderr.write(`Database schema initialization failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
