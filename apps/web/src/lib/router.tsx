import { useCallback, useEffect, useState } from 'react';

/**
 * Hash routing, ~40 lines instead of a dependency.
 *
 * Hash rather than the history API on purpose: Telegram's webview
 * handles back/forward inconsistently across platforms, and hash changes
 * never reach the server, so a deep link can't 404 against nginx.
 */

/** Tabs in the bottom bar, left to right. `create` opens a sheet. */
export type Tab = 'home' | 'achievements' | 'chats' | 'create' | 'discover' | 'ranks' | 'you';

/** Routes reachable but not in the bar. */
export type Route = Tab | 'alerts' | 'wallet' | 'edit' | 'settings' | 'admin';

const ROUTES: Route[] = [
  'home', 'achievements', 'chats', 'create', 'discover', 'ranks', 'you',
  'alerts', 'wallet', 'edit', 'settings', 'admin',
];

function read(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(raw) ? (raw as Route) : 'home';
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
  }, []);

  return [route, go];
}
