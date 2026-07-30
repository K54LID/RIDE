import { useCallback, useEffect, useState } from 'react';

/**
 * Hash routing with one parameterised route (chat threads). Still ~60
 * lines instead of a dependency; hash survives Telegram's webview
 * quirks and can never 404 against the static server.
 */

export type Tab = 'home' | 'achievements' | 'chats' | 'create' | 'discover' | 'ranks' | 'you';

export type Route =
  | Tab | 'alerts' | 'wallet' | 'edit' | 'settings' | 'admin' | 'saved';

export interface Location {
  route: Route;
  /** Conversation id when route is a chat thread. */
  chatId: string | null;
}

const STATIC_ROUTES: Route[] = [
  'home', 'achievements', 'chats', 'create', 'discover', 'ranks', 'you',
  'alerts', 'wallet', 'edit', 'settings', 'admin', 'saved',
];

function read(): Location {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const chat = raw.match(/^chat\/([0-9a-f-]{36})$/);
  if (chat) return { route: 'chats', chatId: chat[1]! };
  return {
    route: (STATIC_ROUTES as string[]).includes(raw) ? (raw as Route) : 'home',
    chatId: null,
  };
}

export function useRoute(): [Location, (r: Route) => void, (id: string) => void] {
  const [loc, setLoc] = useState<Location>(read);

  useEffect(() => {
    const onHash = () => setLoc(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
    setLoc({ route: r, chatId: null });
  }, []);

  const openChat = useCallback((id: string) => {
    window.location.hash = `/chat/${id}`;
    setLoc({ route: 'chats', chatId: id });
  }, []);

  return [loc, go, openChat];
}
