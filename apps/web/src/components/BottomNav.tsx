import type { Tab } from '../lib/router';
import { tg } from '../lib/tg';

/** Inline 20px stroke icons — no icon dependency, no font loading. */
const ICONS: Record<Tab, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  discover: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  map: 'M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3zm0 0v15m6-12v15',
  messages: 'M4 5h16v11H8l-4 3.5V5z',
  alerts: 'M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6zM10.5 20a1.8 1.8 0 0 0 3 0',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
};

const LABELS: Record<Tab, string> = {
  home: 'Home',
  discover: 'Discover',
  map: 'Map',
  messages: 'Chats',
  alerts: 'Alerts',
  profile: 'You',
};

const ORDER: Tab[] = ['home', 'discover', 'map', 'messages', 'alerts', 'profile'];

export default function BottomNav({
  tab, onGo,
}: { tab: Tab; onGo: (t: Tab) => void }) {
  return (
    <nav className="nav">
      {ORDER.map((t) => (
        <button
          key={t}
          aria-current={tab === t ? 'page' : undefined}
          onClick={() => { tg.tap('light'); onGo(t); }}
          style={{ position: 'relative' }}
        >
          {tab === t ? <span className="dot" /> : null}
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7"
               strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[t]} />
          </svg>
          {LABELS[t]}
        </button>
      ))}
    </nav>
  );
}
