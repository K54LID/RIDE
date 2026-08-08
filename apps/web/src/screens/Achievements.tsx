import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { tg } from '../lib/tg';
import { useT, useTDyn } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';

interface Achievement {
  slug: string; family: string; tier: number; name: string;
  description: string | null; threshold: number; coin_reward: number;
  progress: number; unlocked: boolean;
}

interface Payload {
  achievements: Achievement[];
  newly_unlocked: string[];
  unlocked_count: number;
  total_count: number;
}

function Row({ a }: { a: Achievement }) {
  const tDyn = useTDyn();
  const pct = Math.min(100, Math.round((a.progress / a.threshold) * 100));
  return (
    <div className={`ach ${a.unlocked ? 'done' : 'locked'}`}>
      <div className="ach-badge">
        {a.unlocked ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4.5 4.5L19 7" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="ach-main">
        {/* Names and descriptions are seeded in English in the
            database; the translation is keyed by slug so no migration
            or duplicated column is needed, and an unknown slug still
            renders the English the server sent. */}
        <div className="ach-name">{tDyn(`ach.${a.slug}.name`, a.name)}</div>
        {a.description
          ? <div className="ach-desc">{tDyn(`ach.${a.slug}.desc`, a.description)}</div>
          : null}
        {!a.unlocked ? (
          <>
            <div className="ach-bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="ach-desc num" style={{ marginTop: 4 }}>
              {a.progress} / {a.threshold}
            </div>
          </>
        ) : null}
      </div>
      {a.coin_reward > 0 ? <div className="ach-reward">+{a.coin_reward}</div> : null}
    </div>
  );
}

export default function Achievements() {
  const t = useT();
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  const load = useCallback(() => {
    setFailed(false);
    apiFetch<Payload>('/v1/achievements')
      .then((d) => {
        setData(d);
        // Celebrate anything earned since the last visit.
        if (d.newly_unlocked.length > 0) tg.notify('success');
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  if (failed) {
    return (
      <div className="screen">
        <div className="head"><h1>{t('ach.title')}</h1></div>
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="screen">
        <div className="head"><h1>{t('ach.title')}</h1></div>
        <Skeleton h={70} mb={9} /><Skeleton h={70} mb={9} /><Skeleton h={70} />
      </div>
    );
  }

  const shown = data.achievements.filter((a) =>
    filter === 'all' ? true : filter === 'unlocked' ? a.unlocked : !a.unlocked);
  const pct = Math.round((data.unlocked_count / data.total_count) * 100);

  return (
    <div className="screen">
      <div className="head"><h1>{t('ach.title')}</h1></div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="eyebrow">{t('ach.progress')}</div>
        <div className="num" style={{ fontSize: '1.6rem', fontWeight: 700 }}>
          {data.unlocked_count}
          <span style={{ color: 'var(--faint)', fontSize: '1rem' }}> / {data.total_count}</span>
        </div>
        <div className="ach-bar" style={{ marginTop: 10 }}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="seg">
        <button aria-pressed={filter === 'all'} onClick={() => { tg.select(); setFilter('all'); }}>
          {t('ach.all')}
        </button>
        <button aria-pressed={filter === 'unlocked'} onClick={() => { tg.select(); setFilter('unlocked'); }}>
          {t('ach.unlocked')}
        </button>
        <button aria-pressed={filter === 'locked'} onClick={() => { tg.select(); setFilter('locked'); }}>
          {t('ach.locked')}
        </button>
      </div>

      {shown.length === 0
        ? <EmptyState title={t('ach.none')} body={t('ach.none.body')} />
        : shown.map((a) => <Row key={a.slug} a={a} />)}
    </div>
  );
}
