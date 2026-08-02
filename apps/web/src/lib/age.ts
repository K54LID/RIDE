/**
 * Age in whole years from a birth date.
 *
 * Accepts whatever the API sends. `birth_date` is a Postgres `date` and
 * postgres.js decodes those into JavaScript Date objects, so it arrives
 * as a full ISO timestamp ("1998-01-01T00:00:00.000Z") rather than
 * "1998-01-01" — taking the date part handles both that and the plain
 * form an <input type="date"> produces.
 *
 * Shared rather than copied: two parsers means one of them eventually
 * gets fixed alone.
 */
export function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(`${String(birth).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}
