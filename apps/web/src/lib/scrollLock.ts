/**
 * Reference-counted body scroll lock.
 *
 * Every overlay used to do this itself:
 *
 *     const prev = document.body.style.overflow;
 *     document.body.style.overflow = 'hidden';
 *     return () => { document.body.style.overflow = prev; };
 *
 * which is correct for one overlay and wrong for two. Whenever a sheet
 * and a page overlapped, the inner one captured `prev = 'hidden'` and
 * restored *that* on the way out — leaving the body locked with every
 * overlay gone. The page then looked frozen: taps landed, nothing
 * scrolled, and only a reload cleared it.
 *
 * A counter cannot get this wrong. The first lock records the real
 * value, the last release restores it, and releasing twice is a no-op.
 */

let depth = 0;
let saved = '';

export function lockScroll(): () => void {
  if (depth === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth += 1;

  let released = false;
  return () => {
    if (released) return;      // double-release must not unbalance the count
    released = true;
    depth -= 1;
    if (depth <= 0) {
      depth = 0;
      document.body.style.overflow = saved;
    }
  };
}
