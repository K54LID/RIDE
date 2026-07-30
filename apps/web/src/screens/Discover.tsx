import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Person } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, ChipGroup, ChipPick, EmptyState, Field, Skeleton } from '../components/ui';
import ComingSoon from '../components/ComingSoon';
import PersonCard from '../components/PersonCard';
import Page from '../components/Page';

type View = 'list' | 'map';
type Sort = 'active' | 'new' | 'court' | 'nearby';

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Trans man', 'Trans woman'] as const;
const LOOKING = ['Friends', 'Chat', 'Dates', 'Relationship', 'Networking', 'Events'] as const;
const LANGS = ['English', 'Русский', 'Türkçe', 'Español', 'Deutsch', 'Français', 'العربية', 'Azərbaycan'] as const;
const INTERESTS = ['Gaming', 'Fitness', 'Travel', 'Music', 'Movies', 'Photography', 'Cooking', 'Art', 'Tech', 'Sports', 'Pets', 'Nightlife'] as const;
const DISTANCES = ['5', '10', '25', '50', '100'] as const;
const AGES = ['18–24', '25–34', '35–44', '45–54', '55+'] as const;

const AGE_BOUNDS: Record<string, [number, number]> = {
  '18–24': [18, 24], '25–34': [25, 34], '35–44': [35, 44],
  '45–54': [45, 54], '55+': [55, 120],
};

export default function Discover({ onOpenUser }: {
  onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [view, setView] = useState<View>('list');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('active');
  const [gender, setGender] = useState<string | null>(null);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [looking, setLooking] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [maxKm, setMaxKm] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);

  const activeFilters =
    (gender ? 1 : 0) + (ageBand ? 1 : 0) + (looking.length ? 1 : 0) +
    (languages.length ? 1 : 0) + (interests.length ? 1 : 0) +
    (maxKm ? 1 : 0) + (verifiedOnly ? 1 : 0) + (onlineOnly ? 1 : 0);

  const load = useCallback(() => {
    setPeople(null);
    setFailed(false);
    const p = new URLSearchParams({ sort });
    if (q.trim()) p.set('q', q.trim());
    if (gender) p.set('gender', gender);
    if (ageBand) {
      const [lo, hi] = AGE_BOUNDS[ageBand]!;
      p.set('age_min', String(lo));
      p.set('age_max', String(hi));
    }
    if (looking.length) p.set('looking_for', looking.join(','));
    if (languages.length) p.set('languages', languages.join(','));
    if (interests.length) p.set('interests', interests.join(','));
    if (maxKm) p.set('max_km', maxKm);
    if (verifiedOnly) p.set('verified_only', 'true');
    if (onlineOnly) p.set('online_only', 'true');

    apiFetch<{ people: Person[] }>(`/v1/discover?${p.toString()}`)
      .then((r) => setPeople(r.people))
      .catch(() => setFailed(true));
  }, [q, sort, gender, ageBand, looking, languages, interests, maxKm, verifiedOnly, onlineOnly]);

  // Debounced so typing in the search box doesn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
  }, [load]);

  const clearAll = () => {
    tg.tap('light');
    setGender(null); setAgeBand(null); setLooking([]); setLanguages([]);
    setInterests([]); setMaxKm(null); setVerifiedOnly(false); setOnlineOnly(false);
  };

  return (
    <div className="screen">
      <div className="head">
        <h1>{t('discover.title')}</h1>
        <button className="icon-btn" aria-label={t('common.filters')}
                onClick={() => { tg.tap('light'); setFiltersOpen(true); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {activeFilters > 0 ? <span className="badge num">{activeFilters}</span> : null}
        </button>
      </div>

      <label className="field">
        <input
          value={q}
          placeholder={t('discover.searchPlaceholder')}
          autoCapitalize="none"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="seg">
        <button aria-pressed={view === 'list'} onClick={() => { tg.select(); setView('list'); }}>
          {t('discover.grid')}
        </button>
        <button aria-pressed={view === 'map'} onClick={() => { tg.select(); setView('map'); }}>
          {t('discover.map')}
        </button>
      </div>

      {view === 'map' ? (
        <ComingSoon title={t('soon.map')} body={t('soon.map.body')} />
      ) : failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : people === null ? (
        <>
          <Skeleton h={72} mb={10} />
          <Skeleton h={72} mb={10} />
          <Skeleton h={72} />
        </>
      ) : people.length === 0 ? (
        <EmptyState
          title={t('discover.empty')}
          body={t('discover.empty.body')}
          action={activeFilters > 0
            ? <Button variant="ghost" onClick={clearAll}>{t('common.clear')}</Button>
            : undefined}
        />
      ) : (
        people.map((p) => (
          <button key={p.account_id} style={{ all: 'unset', display: 'block', width: '100%' }}
                  onClick={() => { tg.tap('light'); onOpenUser(p.account_id); }}>
            <PersonCard person={p} />
          </button>
        ))
      )}

      {filtersOpen ? (
        <Page
          title={t('common.filters')}
          onClose={() => setFiltersOpen(false)}
          action={
            <button className="page-clear" onClick={clearAll}>{t('common.clear')}</button>
          }
        >

        <Field label={t('discover.sort')}>
          <ChipPick
            options={[t('discover.sort.active'), t('discover.sort.new'), t('discover.sort.court'), t('discover.sort.nearby')]}
            value={
              sort === 'active' ? t('discover.sort.active')
              : sort === 'new' ? t('discover.sort.new')
              : sort === 'court' ? t('discover.sort.court')
              : t('discover.sort.nearby')
            }
            onChange={(label) => {
              setSort(
                label === t('discover.sort.new') ? 'new'
                : label === t('discover.sort.court') ? 'court'
                : label === t('discover.sort.nearby') ? 'nearby'
                : 'active',
              );
            }}
          />
        </Field>

        <Field label={t('discover.gender')}>
          <ChipPick options={GENDERS} value={gender} onChange={setGender} />
        </Field>
        <Field label={t('discover.age')}>
          <ChipPick options={AGES} value={ageBand} onChange={setAgeBand} />
        </Field>
        <Field label={t('discover.lookingFor')}>
          <ChipGroup options={LOOKING} selected={looking} onChange={setLooking} />
        </Field>
        <Field label={t('discover.languages')}>
          <ChipGroup options={LANGS} selected={languages} onChange={setLanguages} />
        </Field>
        <Field label={t('discover.interests')}>
          <ChipGroup options={INTERESTS} selected={interests} onChange={setInterests} max={6} />
        </Field>
        <Field label={`${t('discover.distance')} (km)`}>
          <ChipPick options={DISTANCES} value={maxKm} onChange={setMaxKm} />
        </Field>

        <div className="chips" style={{ marginBottom: 18 }}>
          <button type="button" className="chip" aria-pressed={verifiedOnly}
                  onClick={() => { tg.select(); setVerifiedOnly((v) => !v); }}>
            {t('discover.verified')}
          </button>
          <button type="button" className="chip" aria-pressed={onlineOnly}
                  onClick={() => { tg.select(); setOnlineOnly((v) => !v); }}>
            {t('discover.online')}
          </button>
        </div>

          <div style={{ height: 12 }} />
          <Button onClick={() => setFiltersOpen(false)}>{t('common.apply')}</Button>
        </Page>
      ) : null}
    </div>
  );
}
