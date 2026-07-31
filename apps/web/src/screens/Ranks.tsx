import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type RankEntry } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { VerifiedMark } from '../components/VerifiedMark';
import Avatar from '../components/Avatar';

type Board = 'court' | 'woofs' | 'likes' | 'gifts' | 'followers';
type Period = 'day' | 'week' | 'month' | 'all';

const BOARDS: Array<[Board, 'ranks.court' | 'ranks.woofs' | 'ranks.likes' | 'ranks.gifts' | 'ranks.followers']> = [
  ['court', 'ranks.court'],
  ['woofs', 'ranks.woofs'],
  ['likes', 'ranks.likes'],
  ['gifts', 'ranks.gifts'],
  ['followers', 'ranks.followers'],
];

/**
 * Every board explains itself: what is being counted, and the one thing
 * that moves it. A leaderboard nobody understands is just a number
 * people resent — if it is going to rank people it owes them the rule.
 */
const EXPLAIN: Record<Board, `ranks.how.${Board}`> = {
  court: 'ranks.how.court',
  woofs: 'ranks.how.woofs',
  likes: 'ranks.how.likes',
  gifts: 'ranks.how.gifts',
  followers: 'ranks.how.followers',
};

const PERIODS: Array<[Period, 'ranks.day' | 'ranks.week' | 'ranks.month' | 'ranks.all']> = [
  ['day', 'ranks.day'], ['week', 'ranks.week'],
  ['month', 'ranks.month'], ['all', 'ranks.all'],
];

/** Top three get the podium; the rest is a dense list. */
function Podium({ top, onOpen }: { top: RankEntry[]; onOpen: (id: string) => void }) {
  const order = [top[1], top[0], top[2]];      // silver, gold, bronze
  const heights = [58, 78, 46];
  const medals = ['🥈', '🥇', '🥉'];
  return (
    <div className="podium">
      {order.map((e, i) =>
        e ? (
          <button key={e.account_id} className="podium-col"
                  onClick={() => { tg.tap('light'); onOpen(e.account_id); }}>
            <Avatar name={e.display_name} mediaId={e.avatar_media_id}
                    size={i === 1 ? 52 : 42} radius={i === 1 ? 26 : 21} />
            <div className="podium-name num">
              @{e.handle}
              {e.verified ? <VerifiedMark size={11} /> : null}
            </div>
            <div className="podium-score num">{e.score}</div>
            <div className={`podium-block p${i}`} style={{ height: heights[i] }}>
              <span>{medals[i]}</span>
            </div>
          </button>
        ) : <div key={i} className="podium-col" />,
      )}
    </div>
  );
}

export default function Ranks({ onOpenUser }: { onOpenUser: (accountId: string) => void }) {
  const t = useT();
  // Court value for today is the statistic people open this screen to
  // see — who is climbing right now, not the all-time standing that
  // barely moves day to day.
  const [board, setBoard] = useState<Board>('court');
  const [period, setPeriod] = useState<Period>('day');
  const [howOpen, setHowOpen] = useState(false);
  const [entries, setEntries] = useState<RankEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** When the current board next empties. Null on All time, which doesn't. */
  const [resetsAt, setResetsAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    setEntries(null);
    setFailed(false);
    apiFetch<{ entries: RankEntry[]; resets_at: string | null }>(
      `/v1/leaderboard?board=${board}&period=${period}`)
      .then((r) => { setEntries(r.entries); setResetsAt(r.resets_at); })
      .catch(() => setFailed(true));
  }, [board, period]);

  useEffect(load, [load]);

  /**
   * Tick once a minute, not once a second. The countdown is measured in
   * hours and days; a seconds display on a leaderboard is a distraction
   * that also wakes the webview sixty times more often than it needs to.
   * Crossing the boundary reloads the board, so the reset is something
   * you can watch happen rather than something you notice later.
   */
  useEffect(() => {
    if (!resetsAt) return;
    const id = setInterval(() => {
      const t0 = Date.now();
      setNow(t0);
      if (t0 >= new Date(resetsAt).getTime()) load();
    }, 60000);
    return () => clearInterval(id);
  }, [resetsAt, load]);

  const countdown = (() => {
    if (!resetsAt) return null;
    const ms = new Date(resetsAt).getTime() - now;
    if (ms <= 0) return null;
    const mins = Math.floor(ms / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
  })();

  return (
    <div className="screen">
      <div className="head"><h1>{t('ranks.title')}</h1></div>

      <div className="seg tight">
        {BOARDS.map(([b, key]) => (
          <button key={b} aria-pressed={board === b}
                  onClick={() => { tg.select(); setBoard(b); }}>{t(key)}</button>
        ))}
      </div>
      <div className="seg tight">
        {PERIODS.map(([p, key]) => (
          <button key={p} aria-pressed={period === p}
                  onClick={() => { tg.select(); setPeriod(p); }}>{t(key)}</button>
        ))}
      </div>

      {/* All time has no countdown because it never resets — saying so
          is the point, otherwise the absence of a timer reads as a bug. */}
      <div className="rank-reset">
        {countdown
          ? <>{t('ranks.resetsIn')} <b className="num">{countdown}</b></>
          : t('ranks.neverResets')}
      </div>

      <button className="rank-how" onClick={() => { tg.tap('light'); setHowOpen((v) => !v); }}
              aria-expanded={howOpen}>
        <span>{t('ranks.howTitle')}</span>
        <span aria-hidden="true">{howOpen ? '−' : '?'}</span>
      </button>
      {howOpen ? (
        <div className="card compact rank-how-body">
          <p>{t(EXPLAIN[board])}</p>
          <p className="hint" style={{ marginTop: 8 }}>{t('ranks.how.period')}</p>
          <p className="hint" style={{ marginTop: 6 }}>{t('ranks.how.fair')}</p>
        </div>
      ) : null}

      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : entries === null ? (
        <><Skeleton h={110} mb={10} /><Skeleton h={44} mb={6} /><Skeleton h={44} /></>
      ) : entries.length === 0 ? (
        <EmptyState title={t('ranks.empty')} body={t('ranks.empty.body')} />
      ) : (
        <>
          <Podium top={entries.slice(0, 3)} onOpen={onOpenUser} />
          {entries.length > 3 ? (
            <div className="card compact" style={{ padding: 0, overflow: 'hidden' }}>
              {entries.slice(3).map((e) => (
                <button key={e.account_id} className="rank rank-btn"
                        onClick={() => { tg.tap('light'); onOpenUser(e.account_id); }}>
                  <span className="rank-pos num">{e.rank}</span>
                  <Avatar name={e.display_name} mediaId={e.avatar_media_id} size={30} radius={15} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="person-name num" style={{ fontSize: '0.88rem' }}>
                      @{e.handle}
                      {e.verified ? <VerifiedMark size={12} /> : null}
                    </div>
                  </div>
                  <span className="rank-score num">{e.score}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
