import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type RankEntry } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { VerifiedMark } from '../components/VerifiedMark';

type Board = 'court' | 'woofs' | 'gifts' | 'followers';
type Period = 'day' | 'week' | 'month' | 'all';

const BOARDS: Array<[Board, 'ranks.court' | 'ranks.woofs' | 'ranks.gifts' | 'ranks.followers']> = [
  ['court', 'ranks.court'],
  ['woofs', 'ranks.woofs'],
  ['gifts', 'ranks.gifts'],
  ['followers', 'ranks.followers'],
];

const PERIODS: Array<[Period, 'ranks.day' | 'ranks.week' | 'ranks.month' | 'ranks.all']> = [
  ['day', 'ranks.day'],
  ['week', 'ranks.week'],
  ['month', 'ranks.month'],
  ['all', 'ranks.all'],
];

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

      <div className="seg">
        {BOARDS.map(([b, key]) => (
          <button key={b} aria-pressed={board === b}
                  onClick={() => { tg.select(); setBoard(b); }}>
            {t(key)}
          </button>
        ))}
      </div>

      <div className="seg">
        {PERIODS.map(([p, key]) => (
          <button key={p} aria-pressed={period === p}
                  onClick={() => { tg.select(); setPeriod(p); }}>
            {t(key)}
          </button>
        ))}
      </div>

      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : entries === null ? (
        <>
          <Skeleton h={52} mb={8} />
          <Skeleton h={52} mb={8} />
          <Skeleton h={52} />
        </>
      ) : entries.length === 0 ? (
        <EmptyState title={t('ranks.empty')} body={t('ranks.empty.body')} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {entries.map((e) => (
            <div key={e.account_id} className={`rank rank-${e.rank}`}>
              <span className="rank-pos">
                {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}
              </span>
              <div className="person-avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: '0.85rem' }}>
                {e.display_name.trim().charAt(0).toUpperCase() || '?'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="person-name" style={{ fontSize: '0.92rem' }}>
                  {e.display_name}
                  {e.verified ? <VerifiedMark size={13} /> : null}
                </div>
                {e.handle ? <div className="person-sub num">@{e.handle}</div> : null}
              </div>
              <span className="rank-score num">{e.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
