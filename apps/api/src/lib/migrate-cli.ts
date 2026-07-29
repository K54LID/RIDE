import { sql } from './db.js';
import { runMigrations } from './migrate.js';

try {
  await runMigrations(sql);
  await sql.end({ timeout: 5 });
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
}
