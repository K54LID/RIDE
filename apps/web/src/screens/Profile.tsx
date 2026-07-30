import { useEffect, useState } from 'react';
import { apiFetch, type Me, type OwnedGift, type ProfilePhoto } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import CourtCrest, { courtTier } from '../components/CourtCrest';
import PhotoManager from '../components/PhotoManager';
import Media from '../components/Media';
import { VerifiedMark } from '../components/VerifiedMark';
import { Button } from '../components/ui';

function ageFrom(birth: string): number | null {
  const b = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

/**
 * Profile, restructured around a single header block.
 *
 * The previous version stacked four separate cards — crest, name,
 * stats, actions — which pushed the actual content below the fold. One
 * header carrying avatar + counts side by side is the pattern every
 * social app converged on because it answers "who is this and how do
 * they rate" in one glance.
 */
export default function Profile({ me, onEdit, onWallet, onSettings, onSaved }: {
  me: Me;
  onEdit: () => void;
  onWallet: () => void;
  onSettings: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const age = ageFrom(me.birth_date);
  const tier = courtTier(me.court_value);
  const isVip = me.vip_until !== null && new Date(me.vip_until) > new Date();

  const [gifts, setGifts] = useState<OwnedGift[]>([]);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [editingPhotos, setEditingPhotos] = useState(false);

  useEffect(() => {
    apiFetch<{ collection: OwnedGift[] }>('/v1/users/me/gifts')
      .then((r) => setGifts(r.collection)).catch(() => undefined);
    apiFetch<{ photos: ProfilePhoto[] }>('/v1/me/photos')
      .then((r) => setPhotos(r.photos)).catch(() => undefined);
  }, [editingPhotos]);

  const primary = photos.find((p) => p.position === 0) ?? photos[0];
  const list = (v: string[] | null) => (v && v.length ? v.join(', ') : null);

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
  ];
  const shown = details.filter(([, v]) => v);

  return (
    <div className="screen">
      {/* Header is the handle alone — the title said nothing the tab
          bar wasn't already saying. */}
      <div className="head">
        <h1 className="handle-title">
          {me.handle ? `@${me.handle}` : me.display_name}
          {me.verification === 'approved' ? <VerifiedMark size={17} /> : null}
          {isVip ? <span className="vip-chip">VIP</span> : null}
        </h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="icon-btn sm" aria-label={t('wallet.title')}
                  onClick={() => { tg.tap('light'); onWallet(); }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
              <path d="M16 12.5h3" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-btn sm" aria-label={t('settings.title')}
                  onClick={() => { tg.tap('light'); onSettings(); }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8M4.6 9a1.7 1.7 0 0 0-.3-1.8M15 4.6a1.7 1.7 0 0 0-1.8-.3M9 19.4a1.7 1.7 0 0 0 1.8.3M19.4 9a1.7 1.7 0 0 1 .3-1.8M4.6 15a1.7 1.7 0 0 1-.3 1.8M15 19.4a1.7 1.7 0 0 1-1.8.3M9 4.6a1.7 1.7 0 0 1 1.8-.3"
                    strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Avatar and counts on one row — the unified header. */}
      <div className="pro-head">
        <button className="pro-avatar" onClick={() => { tg.tap('light'); setEditingPhotos((v) => !v); }}>
          {primary
            ? <Media id={primary.media_id} kind="image" thumb />
            : <span className="pro-initial">{me.display_name.trim().charAt(0).toUpperCase() || '?'}</span>}
          <span className="pro-avatar-edit">✎</span>
        </button>

        <div className="pro-counts">
          <div><b className="num">{me.followers}</b><span>{t('profile.followers')}</span></div>
          <div><b className="num">{me.woofs_received}</b><span>{t('profile.woofs')}</span></div>
          <div><b className="num">{me.gifts_received}</b><span>{t('profile.gifts')}</span></div>
        </div>
      </div>

      <div className="pro-name">
        {me.display_name}
        {age !== null ? <span className="pro-age">{age}</span> : null}
      </div>
      {me.bio ? <p className="pro-bio">{me.bio}</p> : null}

      <div className="pro-actions">
        <Button variant="ghost" onClick={onEdit}>{t('profile.edit')}</Button>
        <Button variant="ghost" onClick={onSaved}>{t('saved.title')}</Button>
      </div>

      {/* Court standing stays visible but compact — it's the app's
          signature metric, not a whole card's worth of screen. */}
      <div className="pro-court">
        <CourtCrest value={me.court_value} size={54} />
        <div>
          <div className="eyebrow">{t('profile.courtValue')} · {t('profile.tier')} {tier}</div>
          <div className="num pro-court-val">{me.court_value}</div>
        </div>
        <div className="pro-court-next num">
          {me.court_value * 2} {t('profile.toNextTier')} {tier + 1}
        </div>
      </div>

      {editingPhotos ? (
        <>
          <div className="eyebrow tight">{t('profile.photos')}</div>
          <PhotoManager />
        </>
      ) : photos.length > 1 ? (
        <div className="pro-strip">
          {photos.map((p) => (
            <div key={p.id} className="pro-strip-cell">
              <Media id={p.media_id} kind="image" thumb />
            </div>
          ))}
        </div>
      ) : null}

      {gifts.length > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.gifts')}</div>
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

      {shown.length > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.details')}</div>
          <div className="card compact">
            {shown.map(([k, v]) => (
              <div key={k} className="detail-row">
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
