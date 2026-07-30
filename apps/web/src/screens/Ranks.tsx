import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type RankEntry } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { VerifiedMark } from '../components/VerifiedMark';

type Board = 'court' | 'woofs' | 'posts' | 'gifts' | 'followers';
type Period = 'day' | 'week' | 'month' | 'all';

const BOARDS: Array<[Board, 'ranks.court' | 'ranks.woofs' | 'ranks.posts' | 'ranks.gifts' | 'ranks.followers']> = [
  ['court', 'ranks.court'],
  ['woofs', 'ranks.woofs'],
  ['posts', 'ranks.posts'],
  ['gifts', 'ranks.gifts'],
  ['followers', 'ranks.followers'],
];

const PERIODS: Array<[Period, 'ranks.day' | 'ranks.week' | 'ranks.month' | 'ranks.all']> = [
  ['day', 'ranks.day'], ['week', 'ranks.week'],
  ['month', 'ranks.month'], ['all', 'ranks.all'],
];

function Initial({ name, size }: { name: string; size: number }) {
  return (
    <div className="rank-av" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

/** Top three get the podium; the rest is a dense list. */
function Podium({ top }: { top: RankEntry[] }) {
  const order = [top[1], top[0], top[2]];      // silver, gold, bronze
  const heights = [58, 78, 46];
  const medals = ['🥈', '🥇', '🥉'];
  return (
    <div className="podium">
      {order.map((e, i) =>
        e ? (
          <div key={e.account_id} className="podium-col">
            <Initial name={e.display_name} size={i === 1 ? 52 : 42} />
            <div className="podium-name">
              {e.display_name.split(' ')[0]}
              {e.verified ? <VerifiedMark size={11} /> : null}
            </div>
            <div className="podium-score num">{e.score}</div>
            <div className={`podium-block p${i}`} style={{ height: heights[i] }}>
              <span>{medals[i]}</span>
            </div>
          </div>
        ) : <div key={i} className="podium-col" />,
      )}
    </div>
  );
}

export default function Ranks() {
  const t = useT();
  const [board, setBoard] = useState<Board>('court');
  const [period, setPeriod] = useState<Period>('all');
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
          <Podium top={entries.slice(0, 3)} />
          {entries.length > 3 ? (
            <div className="card compact" style={{ padding: 0, overflow: 'hidden' }}>
              {entries.slice(3).map((e) => (
                <div key={e.account_id} className="rank">
                  <span className="rank-pos num">{e.rank}</span>
                  <Initial name={e.display_name} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="person-name" style={{ fontSize: '0.88rem' }}>
                      {e.display_name}
                      {e.verified ? <VerifiedMark size={12} /> : null}
                    </div>
                  </div>
                  <span className="rank-score num">{e.score}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
