import { useEffect, useState } from 'react';
import { apiFetch, type Me, type OwnedGift } from '../lib/api';
import { tg } from '../lib/tg';
import { useI18n, LOCALES, type Locale } from '../i18n';
import CourtCrest, { courtTier } from '../components/CourtCrest';
import ComingSoon from '../components/ComingSoon';
import { VerifiedMark } from '../components/VerifiedMark';
import { Button } from '../components/ui';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="num" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div className="eyebrow" style={{ fontSize: '0.6rem' }}>{label}</div>
    </div>
  );
}

function ageFrom(birth: string): number | null {
  const b = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

export default function Profile({ me, onEdit, onWallet, onSettings }: {
  me: Me;
  onEdit: () => void;
  onWallet: () => void;
  onSettings: () => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const age = ageFrom(me.birth_date);
  const tier = courtTier(me.court_value);
  const isVip = me.vip_until !== null && new Date(me.vip_until) > new Date();

  const list = (v: string[] | null) => (v && v.length ? v.join(', ') : null);

  const [gifts, setGifts] = useState<OwnedGift[]>([]);
  useEffect(() => {
    apiFetch<{ collection: OwnedGift[] }>('/v1/users/me/gifts')
      .then((r) => setGifts(r.collection))
      .catch(() => undefined);
  }, []);

  /**
   * Everything personal lives in one Details block. Scattering the same
   * facts across chip rows and a stats card made people read the profile
   * three times to answer one question.
   */
  const details: Array<[string, string | null]> = [
    [t('profile.age'), age !== null ? String(age) : null],
    [t('profile.gender'), me.gender],
    [t('profile.pronouns'), me.pronouns],
    [t('profile.orientation'), me.orientation],
    [t('profile.relationship'), me.relationship_status],
    [t('profile.lookingFor'), list(me.looking_for)],
    [t('profile.languages'), list(me.languages)],
    [t('profile.interests'), list(me.interests)],
    [t('profile.tribes'), list(me.tribes)],
    [t('profile.height'), me.height_cm ? `${me.height_cm} cm` : null],
    [t('profile.weight'), me.weight_kg ? `${me.weight_kg} kg` : null],
    [t('profile.bio'), me.bio],
  ];
  const shown = details.filter(([, v]) => v);

  return (
    <div className="screen">
      <div className="head">
        <h1>{t('profile.title')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
        <button className="icon-btn" aria-label={t('settings.title')}
                onClick={() => { tg.tap('light'); onSettings(); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3 8.6a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.7z" />
          </svg>
        </button>
        <button className="icon-btn" aria-label={t('wallet.title')}
                onClick={() => { tg.tap('light'); onWallet(); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            <path d="M16 12.5h3" strokeLinecap="round" />
          </svg>
        </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <CourtCrest value={me.court_value} size={104} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{t('profile.courtValue')}</div>
          <h2 style={{ margin: '2px 0 6px' }}>{t('profile.tier')} {tier}</h2>
          <p style={{ fontSize: '0.85rem' }}>
            <span className="num">{me.court_value * 2}</span> {t('profile.toNextTier')} {tier + 1}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1>{me.display_name}</h1>
          {me.verification === 'approved' ? <VerifiedMark /> : null}
          {isVip ? (
            <span className="chip" style={{
              pointerEvents: 'none', padding: '3px 10px', fontSize: '0.7rem',
              borderColor: 'var(--court)', color: 'var(--court-lit)',
              background: 'rgba(201,162,39,0.12)',
            }}>VIP</span>
          ) : null}
        </div>
        {me.handle ? <p className="num" style={{ fontSize: '0.9rem' }}>@{me.handle}</p> : null}
      </div>

      <div className="card" style={{
        marginTop: 18, display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '16px 12px',
      }}>
        <Stat label={t('profile.woofs')} value={me.woofs_received} />
        <Stat label={t('profile.gifts')} value={me.gifts_received} />
        <Stat label={t('profile.followers')} value={me.followers} />
        <Stat label={t('profile.following')} value={me.following} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={onEdit}>{t('profile.edit')}</Button>
      </div>

      {gifts.length > 0 ? (
        <>
          <div className="eyebrow" style={{ margin: '26px 0 10px' }}>{t('profile.gifts')}</div>
          <div className="showcase">
            {gifts.map((g) => (
              <div key={g.slug} className="showcase-item" title={g.name}>
                <span className="showcase-glyph">{g.asset_key}</span>
                {g.quantity > 1 ? <span className="showcase-count num">{g.quantity}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="eyebrow" style={{ margin: '26px 0 10px' }}>{t('profile.photos')}</div>
      <ComingSoon title={t('soon.media')} body={t('soon.media.body')} />

      {shown.length > 0 ? (
        <>
          <div className="eyebrow" style={{ margin: '26px 0 10px' }}>{t('profile.details')}</div>
          <div className="card" style={{ display: 'grid', gap: 11, fontSize: '0.9rem' }}>
            {shown.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 16, justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)', flex: 'none' }}>{k}</span>
                <span style={{ textAlign: 'end' }}>{v}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

    </div>
  );
}
