/**
 * App-wide facts that arrive with /v1/me and are needed in places props
 * don't reach.
 *
 * Specifically the bot link. Sharing happens from the feed, a single
 * post, the saved list and the wallet — four screens at three different
 * depths, two of them inside the overlay stack. Threading one string
 * through all of that is a prop on every component in between, and the
 * one place it gets forgotten is the one that keeps shipping the wrong
 * link. A module-level value set once at load is the smaller mistake.
 */

let bot = '';

export function setBotUrl(url: string): void {
  if (url) bot = url;
}

/**
 * Falls back to the Mini App's own origin rather than an empty string —
 * a share with no URL at all is worse than a share with a web link.
 */
export function botUrl(): string {
  return bot || window.location.origin;
}
