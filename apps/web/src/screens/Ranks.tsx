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
            <div className="podium-name">
              {e.display_name.split(' ')[0]}
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
  const [entries, setEntries] = useState<RankEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setEntries(null);
    setFailed(false);
    apiFetch<{ entries: RankEntry[] }>(`/v1/leaderboard?board=${board}&period=${period}`)
      .then((r) => setEntries(r.entries))
      .catch(() => setFailed(true));
  }, [board, period]);

  useEffect(load, [load]);

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
                    <div className="person-name" style={{ fontSize: '0.88rem' }}>
                      {e.display_name}
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
