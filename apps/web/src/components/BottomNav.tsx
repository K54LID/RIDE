import type { Route, Tab } from '../lib/router';
import { tg } from '../lib/tg';
import { useT } from '../i18n';

/** Inline stroke icons — no icon dependency, no extra font. */
const ICONS: Record<Exclude<Tab, 'create'>, string> = {
  you: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  chats: 'M4 5h16v11H8l-4 3.5V5z',
  discover: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  ranks: 'M6 20V10M12 20V4M18 20v-7',
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
};

const LABEL_KEYS = {
  you: 'nav.you',
  chats: 'nav.chats',
  discover: 'nav.discover',
  ranks: 'nav.leaderboard',
  home: 'nav.home',
} as const;

const LEFT: Array<Exclude<Tab, 'create'>> = ['you', 'chats'];
const RIGHT: Array<Exclude<Tab, 'create'>> = ['discover', 'ranks', 'home'];

export default function BottomNav({
  route, onGo,
}: { route: Route; onGo: (r: Route) => void }) {
  const t = useT();

  const item = (tab: Exclude<Tab, 'create'>) => (
    <button
      key={tab}
      aria-current={route === tab ? 'page' : undefined}
      onClick={() => { tg.tap('light'); onGo(tab); }}
    >
      {route === tab ? <span className="dot" /> : null}
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.7"
           strokeLinecap="round" strokeLinejoin="round">
        <path d={ICONS[tab]} />
      </svg>
      {t(LABEL_KEYS[tab])}
    </button>
  );

  return (
    <nav className="nav">
      {LEFT.map(item)}

      {/* Create sits in the middle and reads as an action, not a
          destination — it lifts above the bar and carries the accent. */}
      <button
        className="nav-create"
        aria-label={t('nav.create')}
        onClick={() => { tg.tap('medium'); onGo('create'); }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {RIGHT.map(item)}
    </nav>
  );
}
