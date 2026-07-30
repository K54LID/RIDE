import { useEffect, useState } from 'react';

/**
 * Hash routing, ~30 lines instead of a dependency.
 *
 * Hash rather than history API on purpose: Telegram's webview handles
 * back/forward inconsistently across platforms, and hash changes never
 * hit the server — so a deep link can't 404 against nginx.
 */
export type Tab = 'home' | 'discover' | 'map' | 'messages' | 'alerts' | 'profile';

const TABS: Tab[] = ['home', 'discover', 'map', 'messages', 'alerts', 'profile'];

function read(): Tab {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (TABS as string[]).includes(raw) ? (raw as Tab) : 'home';
}

export function useRoute(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(read);

  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    window.location.hash = `/${t}`;
    setTab(t);
  };

  return [tab, go];
}
