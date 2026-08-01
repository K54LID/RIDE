import { sql } from './db.js';

/**
 * Court value decays.
 *
 * A courtship lasts 30 days from the last time someone paid. When it
 * lapses the person's court value falls back to the starting value of
 * 2, which is what makes the board a standing you have to keep rather
 * than a purchase you made once. Courting again resets the full 30
 * days.
 *
 * Back to 2, not 0: a court costs double the current value, so a value
 * of 0 would make every future court free.
 *
 * This runs on a timer rather than being computed on read. Court value
 * is read by the leaderboard, discover's sort, both profiles, posts and
 * the achievement checks — pushing an expiry condition into every one
 * of those is six chances to get it wrong and a join nobody remembers
 * is load-bearing. One writer, many plain readers.
 *
 * Expiries are recorded in `court_expiries`, not `court_events`. That
 * table models "X courted Y" — courter_id is NOT NULL and a CHECK
 * forbids courter = target — so an expiry, which nobody performed,
 * cannot be written there without inventing an actor.
 */

const INTERVAL_MS = 5 * 60 * 1000;

/** Where a lapsed court value lands. Must stay above 0 — see above. */
const BASE_COURT_VALUE = 2;

export async function expireCourtships(): Promise<number> {
  return sql.begin(async (tx) => {
    const expired = await tx<Array<{ target_id: string; before: string }>>`
      SELECT c.target_id, p.court_value AS before
      FROM courtships c
      JOIN profiles p ON p.account_id = c.target_id
      WHERE c.expires_at <= now()
      FOR UPDATE OF c
    `;
    if (expired.length === 0) return 0;

    const ids = expired.map((r) => r.target_id);

    // History first, while the old value is still readable.
    for (const row of expired) {
      if (Number(row.before) > BASE_COURT_VALUE) {
        await tx`
          INSERT INTO court_expiries (account_id, value_before)
          VALUES (${row.target_id}, ${row.before})
        `;
      }
    }

    await tx`
      UPDATE profiles SET court_value = ${BASE_COURT_VALUE}, updated_at = now()
      WHERE account_id = ANY(${ids}) AND court_value > ${BASE_COURT_VALUE}
    `;
    await tx`DELETE FROM courtships WHERE target_id = ANY(${ids})`;

    return expired.length;
  });
}

let timer: NodeJS.Timeout | null = null;

export function startCourtExpiryWorker(log: (m: string) => void = console.log): void {
  if (timer) return;
  log(`Court expiry worker started (every ${INTERVAL_MS / 1000}s)`);

  const run = () => {
    expireCourtships()
      .then((n) => { if (n > 0) log(`court expiry: ${n} courtship(s) lapsed`); })
      .catch((err) => {
        log(`court expiry error: ${err instanceof Error ? err.message : String(err)}`);
      });
  };

  // Once at boot: a container that was down over a weekend should not
  // wait five minutes before correcting the boards.
  run();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref();
}

export function stopCourtExpiryWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
