import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

/**
 * Forward-only SQL migration runner.
 *
 * Design notes:
 *
 *  - A Postgres advisory lock serialises concurrent runners. When two
 *    API containers boot simultaneously, the second blocks until the
 *    first finishes, then observes the work is already done. This is
 *    what makes it safe to scale to multiple replicas without changing
 *    anything here.
 *
 *  - Each file is applied inside a transaction. Postgres has
 *    transactional DDL, so a failure halfway through a migration rolls
 *    back cleanly rather than leaving a half-built schema.
 *
 *  - Checksums are recorded. Editing an already-applied migration is
 *    the single most common way to get production and development to
 *    silently diverge, so we refuse to start instead.
 */

// Arbitrary but fixed. Any other process using this same key would
// block us, so it must not collide with application-level locks.
const LOCK_KEY = 4823741;

/**
 * Candidate locations, in priority order.
 *
 *  1. MIGRATIONS_DIR       — explicit override, always wins.
 *  2. <dist>/db/migrations — production. Bundled into dist at build
 *                            time so it arrives with the compiled code
 *                            and cannot be shadowed by a volume mounted
 *                            at /app/db.
 *  3. <repo>/db/migrations — local development via tsx.
 */
function migrationCandidates(): string[] {
  if (process.env.MIGRATIONS_DIR) return [process.env.MIGRATIONS_DIR];

  const here = dirname(fileURLToPath(import.meta.url)); // dist/lib or src/lib
  return [
    join(here, '..', 'db', 'migrations'),
    join(here, '..', '..', 'db', 'migrations'),
    join(here, '..', '..', '..', 'db', 'migrations'),
  ];
}

async function resolveMigrationsDir(
  log: (msg: string) => void,
): Promise<{ dir: string; files: string[] }> {
  const candidates = migrationCandidates();
  const tried: string[] = [];

  for (const dir of candidates) {
    try {
      const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
      if (files.length > 0) {
        log(`Reading migrations from ${dir}`);
        return { dir, files };
      }
      tried.push(`${dir} (exists, no .sql files)`);
    } catch {
      tried.push(`${dir} (not found)`);
    }
  }

  throw new Error(
    `No migrations found. Tried:\n  ${tried.join('\n  ')}\n` +
      `Set MIGRATIONS_DIR to an absolute path to override.`,
  );
}


/**
 * Converts a Postgres error into one that names the migration file and
 * the line number of the failing statement. The server reports a
 * character position within the submitted script; counting newlines up
 * to it gives the line. Without this, a failed migration logs a bare
 * "type does not exist" with no location — which costs a debugging
 * round trip every single time.
 */
function describeSqlFailure(err: unknown, file: string, contents: string): Error {
  const pgErr = err as { message?: string; code?: string; position?: string };
  const message = typeof pgErr.message === 'string' ? pgErr.message : String(err);
  const code = typeof pgErr.code === 'string' ? pgErr.code : 'unknown';

  let location = '';
  const pos = Number(pgErr.position);
  if (Number.isFinite(pos) && pos > 0 && pos <= contents.length) {
    const upTo = contents.slice(0, pos - 1);
    const line = upTo.split('\n').length;
    const failingLine = contents.split('\n')[line - 1]?.trim() ?? '';
    location = ` at line ${line}: "${failingLine}"`;
  }

  const wrapped = new Error(
    `Migration ${file} failed${location}\n  ${message} (SQLSTATE ${code})\n` +
      `  The transaction was rolled back; no partial schema was left behind.`,
  );
  if (err instanceof Error) (wrapped as Error & { cause?: unknown }).cause = err;
  return wrapped;
}
function checksum(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

interface AppliedRow {
  version: string;
  checksum: string;
}

export async function runMigrations(
  sql: Sql,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const { dir, files } = await resolveMigrationsDir(log);

  // A dedicated connection — advisory locks are session-scoped, so a
  // pooled connection could hand the lock to an unrelated query.
  const conn = await sql.reserve();

  try {
    await conn`SELECT pg_advisory_lock(${LOCK_KEY})`;

    await conn`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = await conn<AppliedRow[]>`
      SELECT version, checksum FROM schema_migrations
    `;
    const appliedMap = new Map(applied.map((r) => [r.version, r.checksum]));

    let count = 0;

    for (const file of files) {
      const contents = await readFile(join(dir, file), 'utf8');
      const hash = checksum(contents);
      const previous = appliedMap.get(file);

      if (previous !== undefined) {
        if (previous !== hash) {
          throw new Error(
            `Migration ${file} was modified after being applied.\n` +
              `  recorded: ${previous}\n` +
              `  current:  ${hash}\n` +
              `Migrations are immutable. Add a new file instead of editing this one.`,
          );
        }
        continue;
      }

      log(`Applying ${file}…`);
      try {
        await conn.begin(async (tx) => {
          // .simple() uses the simple query protocol, which is what
          // allows a file of many statements to run as one call.
          await tx.unsafe(contents).simple();
          await tx`
            INSERT INTO schema_migrations (version, checksum)
            VALUES (${file}, ${hash})
          `;
        });
      } catch (err) {
        throw describeSqlFailure(err, file, contents);
      }
      log(`Applied ${file}`);
      count += 1;
    }

    log(
      count === 0
        ? `Schema up to date (${files.length} migration(s) already applied).`
        : `Applied ${count} migration(s).`,
    );
  } finally {
    // Release before returning the connection to the pool, or the lock
    // outlives this run and the next boot hangs.
    await conn`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => undefined);
    conn.release();
  }
}
