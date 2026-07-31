import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Person } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, ChipGroup, ChipPick, EmptyState, Field, Skeleton } from '../components/ui';
import PersonCard from '../components/PersonCard';
import Page from '../components/Page';

// The map never worked — it was a "coming soon" placeholder behind a
// toggle. Global replaces it: same photo grid, but it drops location
// entirely and shows random online people instead.
type View = 'grid' | 'global';
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
  const [view, setView] = useState<View>('grid');
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
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSent, setLocationSent] = useState(false);

  const requestLocation = async () => {
    tg.tap('medium');
    setLocating(true);
    setLocationError(null);
    try {
      await apiFetch('/v1/discover/request-location', { method: 'POST' });
      tg.notify('success');
      // The share button is now waiting in the bot chat. We stay open
      // and say so, rather than closing the app out from under the
      // person — Telegram has no minimise, so closing would mean a full
      // relaunch just to get back to where they already were.
      setLocationSent(true);
    } catch {
      tg.notify('error');
      setLocationError(t('discover.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const activeFilters =
    (gender ? 1 : 0) + (ageBand ? 1 : 0) + (looking.length ? 1 : 0) +
    (languages.length ? 1 : 0) + (interests.length ? 1 : 0) +
    (maxKm ? 1 : 0) + (verifiedOnly ? 1 : 0) + (onlineOnly ? 1 : 0);

  const load = useCallback(() => {
    setPeople(null);
    setFailed(false);
    // The tab decides *who* you see — Grid is people near you, Global is
    // random people anywhere. The sort chip decides the order within
    // that, and is never changed on the person's behalf.
    const p = new URLSearchParams({ sort: view === 'global' ? 'global' : sort });
    if (view === 'grid') p.set('nearby_only', '1');
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
  }, [q, sort, view, gender, ageBand, looking, languages, interests, maxKm, verifiedOnly, onlineOnly]);

  // Debounced so typing in the search box doesn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
  }, [load]);

  /**
   * The location is shared in the bot chat, which means it lands while
   * this screen is backgrounded. Refetch when we come back into view so
   * distances and "nearby" sort reflect the fix that was just sent,
   * instead of showing stale results until the next filter change.
   */
  useEffect(() => {
    if (!locationSent) return;
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [locationSent, load]);

  const clearAll = () => {
    tg.tap('light');
    setGender(null); setAgeBand(null); setLooking([]); setLanguages([]);
    setInterests([]); setMaxKm(null); setVerifiedOnly(false); setOnlineOnly(false);
  };

  return (
    <div className="screen">
      <div className="head">
        <h1>{t('discover.title')}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Telegram clients don't reliably expose GPS to a Mini App,
              but the bot chat does. This asks the bot to put the
              share-location keyboard in the chat, then closes the app
              so that button is the first thing behind it. */}
          <button className="icon-btn" aria-label={t('discover.updateLocation')}
                  disabled={locating}
                  onClick={requestLocation}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
          </button>
          <button className="icon-btn" aria-label={t('common.filters')}
                  onClick={() => { tg.tap('light'); setFiltersOpen(true); }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {activeFilters > 0 ? <span className="badge num">{activeFilters}</span> : null}
          </button>
        </div>
      </div>

      {locationError ? <p className="error">{locationError}</p> : null}

      {/* Sharing happens in the chat, so the result lands while this
          screen is in the background. Reloading on the way back is what
          makes the new distances appear without a manual refresh. */}
      {locationSent ? (
        <div className="notice">
          <span className="notice-glyph" aria-hidden="true">📍</span>
          <span className="notice-text">{t('discover.locationSent')}</span>
          <button className="notice-close" aria-label={t('common.close')}
                  onClick={() => { tg.tap('light'); setLocationSent(false); load(); }}>✕</button>
        </div>
      ) : null}

      <label className="field">
        <input
          value={q}
          placeholder={t('discover.searchPlaceholder')}
          autoCapitalize="none"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="seg">
        <button aria-pressed={view === 'grid'} onClick={() => { tg.select(); setView('grid'); }}>
          {t('discover.grid')}
        </button>
        <button aria-pressed={view === 'global'} onClick={() => { tg.select(); setView('global'); }}>
          {t('discover.global')}
        </button>
      </div>

      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : people === null ? (
        <div className="tile-grid">
          <Skeleton h={172} /><Skeleton h={172} /><Skeleton h={172} /><Skeleton h={172} />
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          title={t('discover.empty')}
          body={t('discover.empty.body')}
          action={activeFilters > 0
            ? <Button variant="ghost" onClick={clearAll}>{t('common.clear')}</Button>
            : undefined}
        />
      ) : (
        <div className="tile-grid">
          {people.map((p) => (
            <button key={p.account_id} className="tile-btn"
                    onClick={() => { tg.tap('light'); onOpenUser(p.account_id); }}>
              <PersonCard person={p} />
            </button>
          ))}
        </div>
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
            options={[t('discover.sort.active'), t('discover.sort.new'), t('discover.sort.nearby')]}
            value={
              sort === 'active' ? t('discover.sort.active')
              : sort === 'new' ? t('discover.sort.new')
              : t('discover.sort.nearby')
            }
            onChange={(label) => {
              setSort(
                label === t('discover.sort.new') ? 'new'
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
