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
 *    first finishes, then observes the work is already done.
 *
 *  - The lock is session-scoped, so EVERYTHING here must run on one
 *    pinned session (sql.reserve()). That is also why transactions are
 *    managed manually with BEGIN/COMMIT rather than sql.begin():
 *    sql.begin() allocates its own pool connection, which would put the
 *    lock and the transaction on different sessions and silently void
 *    the concurrency guarantee.
 *
 *  - postgres.js blocks manual `BEGIN` via tagged templates
 *    (UNSAFE_TRANSACTION) because that is dangerous on pooled
 *    connections. conn.unsafe('BEGIN') is the intended escape hatch,
 *    and is safe here because the session is reserved.
 *
 *  - Each file is applied inside one transaction. Postgres has
 *    transactional DDL, so a failure rolls back cleanly. Consequence:
 *    migration files must NOT contain their own BEGIN/COMMIT.
 *
 *  - Checksums are recorded. Editing an already-applied migration is
 *    the most common way to make environments silently diverge, so we
 *    refuse to start instead.
 */

// Arbitrary but fixed. Any other process using this same key would
// block us, so it must not collide with application-level locks.
const LOCK_KEY = 4823741;

/**
 * Candidate locations, in priority order.
 *
 *  1. MIGRATIONS_DIR       — explicit override, always wins.
 *  2. <dist>/db/migrations — production; bundled into dist at build
 *                            time so migrations travel with the code.
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
  const tried: string[] = [];

  for (const dir of migrationCandidates()) {
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
 * the line of the failing statement. The server reports a character
 * position within the submitted script; counting newlines up to it
 * gives the line.
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

  // One pinned session for the lock AND all transactions — see header.
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
              `Migrations are immutable once applied. Add a new file instead.`,
          );
        }
        continue;
      }

      log(`Applying ${file}…`);
      await conn.unsafe('BEGIN');
      try {
        // .simple() uses the simple query protocol, which is what
        // allows a file of many statements to run as one call. The
        // statements execute inside the transaction opened above.
        await conn.unsafe(contents).simple();
        await conn`
          INSERT INTO schema_migrations (version, checksum)
          VALUES (${file}, ${hash})
        `;
        await conn.unsafe('COMMIT');
      } catch (err) {
        // Must ROLLBACK before the finally-block unlock: an aborted
        // transaction rejects every later command on this session,
        // including pg_advisory_unlock.
        await conn.unsafe('ROLLBACK').catch(() => undefined);
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
    await conn`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => undefined);
    conn.release();
  }
}
