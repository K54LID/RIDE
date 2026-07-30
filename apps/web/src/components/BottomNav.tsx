import type { Route, Tab } from '../lib/router';
import { tg } from '../lib/tg';
import { useT } from '../i18n';

type NavTab = Exclude<Tab, 'create'>;

const ICONS: Record<NavTab, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  achievements: 'M8 4h8v4a4 4 0 1 1-8 0V4zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M9 20h6M12 14v6',
  chats: 'M4 5h16v11H8l-4 3.5V5z',
  discover: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  ranks: 'M6 20V10M12 20V4M18 20v-7',
  you: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
};

const LABEL_KEYS = {
  home: 'nav.home',
  achievements: 'nav.achievements',
  chats: 'nav.chats',
  discover: 'nav.discover',
  ranks: 'nav.leaderboard',
  you: 'nav.you',
} as const;

const LEFT: NavTab[] = ['home', 'achievements', 'chats'];
const RIGHT: NavTab[] = ['discover', 'ranks', 'you'];

export default function BottomNav({
  route, onGo,
}: { route: Route; onGo: (r: Route) => void }) {
  const t = useT();

  const item = (tab: NavTab) => (
    <button
      key={tab}
      aria-current={route === tab ? 'page' : undefined}
      onClick={() => { tg.tap('light'); onGo(tab); }}
    >
      {route === tab ? <span className="dot" /> : null}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.7"
           strokeLinecap="round" strokeLinejoin="round">
        <path d={ICONS[tab]} />
      </svg>
      {t(LABEL_KEYS[tab])}
    </button>
  );

  return (
    <nav className="nav nav-7">
      {LEFT.map(item)}
      {/* Same icon-above-label column as every other tab, so the plus
          sits on the icon line instead of floating above the bar. Only
          the little gradient pill marks it as the create action. */}
      <button
        className="nav-create"
        aria-label={t('nav.create')}
        onClick={() => { tg.tap('medium'); onGo('create'); }}
      >
        <span className="nav-plus" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        {t('nav.create')}
      </button>
      {RIGHT.map(item)}
    </nav>
  );
}
