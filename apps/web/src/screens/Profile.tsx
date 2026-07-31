import { useEffect, useState } from 'react';
import { apiFetch, type Me, type OwnedGift, type ProfilePhoto, type RankEntryMini } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import PhotoManager from '../components/PhotoManager';
import PhotoCarousel from '../components/PhotoCarousel';
import RankStandings from '../components/RankStandings';
import Media from '../components/Media';
import { VerifiedMark } from '../components/VerifiedMark';
import { Button } from '../components/ui';
import Sheet from '../components/Sheet';

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
export default function Profile({ me, onEdit, onWallet, onSettings, onSaved, onFollows }: {
  me: Me;
  onEdit: () => void;
  onWallet: () => void;
  onSettings: () => void;
  onSaved: () => void;
  onFollows: (mode: 'followers' | 'following') => void;
}) {
  const t = useT();
  const age = ageFrom(me.birth_date);
  const isVip = me.vip_until !== null && new Date(me.vip_until) > new Date();

  const [gifts, setGifts] = useState<OwnedGift[]>([]);
  const [ranks, setRanks] = useState<RankEntryMini[]>([]);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);

  /** Remove a photo from the lightbox, without a trip through Edit profile. */
  const deletePhoto = async (photoId: string) => {
    await apiFetch(`/v1/me/photos/${photoId}`, { method: 'DELETE' });
    setPhotos((cur) => cur.filter((p) => p.id !== photoId));
  };

  useEffect(() => {
    apiFetch<{ collection: OwnedGift[] }>('/v1/users/me/gifts')
      .then((r) => setGifts(r.collection)).catch(() => undefined);
    apiFetch<{ ranks: RankEntryMini[] }>('/v1/users/me/ranks')
      .then((r) => setRanks(r.ranks)).catch(() => undefined);
    apiFetch<{ photos: ProfilePhoto[] }>('/v1/me/photos')
      .then((r) => setPhotos(r.photos)).catch(() => undefined);
  }, [editingPhotos]);

  const primary = photos.find((p) => p.position === 0 && !p.is_private) ?? photos.find((p) => !p.is_private);
  const privateCount = photos.filter((p) => p.is_private).length;
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
          @{me.handle}
          {me.verification === 'approved' ? <VerifiedMark size={17} /> : null}
          {isVip ? <span className="vip-chip">VIP</span> : null}
        </h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* A wallet icon alone said nothing about what was in it.
              The balance is the reason anyone opens this screen, so it
              rides on the button itself. */}
          <button className="wallet-chip" aria-label={t('wallet.title')}
                  onClick={() => { tg.tap('light'); onWallet(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
              <path d="M16 12.5h3" strokeLinecap="round" />
            </svg>
            <b className="num">{me.coin_balance}</b>
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
        </button>

        {/* Gifts is a tab here now, not a loose showcase further down
            the page — it sits with the other two counts and opens the
            collection. */}
        <div className="pro-counts">
          <button className="pro-count-btn"
                  onClick={() => { tg.tap('light'); onFollows('followers'); }}>
            <b className="num">{me.followers}</b><span>{t('profile.followers')}</span>
          </button>
          <div><b className="num">{me.woofs_received}</b><span>{t('profile.woofs')}</span></div>
          <button className="pro-count-btn" disabled={gifts.length === 0}
                  onClick={() => { tg.tap('light'); setGiftsOpen(true); }}>
            <b className="num">{me.gifts_received}</b><span>{t('profile.gifts')}</span>
          </button>
        </div>
      </div>

      {/* The handle is already in the header; repeating the display
          name here was the duplicate. Only age and bio remain. */}
      {age !== null ? <div className="pro-age-row num">{age}</div> : null}
      {me.bio ? <p className="pro-bio">{me.bio}</p> : null}

      <div className="pro-actions">
        <Button variant="ghost" onClick={onEdit}>{t('profile.edit')}</Button>
        <Button variant="ghost" onClick={onSaved}>{t('saved.title')}</Button>
      </div>

      {editingPhotos ? (
        <>
          <div className="eyebrow tight">{t('profile.photos')}</div>
          <PhotoManager />
        </>
      ) : (
        /* The album is the last cell of the public strip, not a tile
           beside it — same row, same square, same baseline, so the
           lock reads as "there is more behind this" rather than as a
           separate widget that happens to sit nearby. */
        <PhotoCarousel photos={photos.filter((p) => !p.is_private)}
                       lockedCount={privateCount}
                       onLockedClick={() => setAlbumOpen(true)}
                       onDeleted={deletePhoto} />
      )}

      {shown.length > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.standing')}</div>
          <RankStandings ranks={ranks} />

          <div className="eyebrow tight">{t('profile.details')}</div>
          <div className="card compact">
            {shown.map(([k, v]) => (
              <div key={k} className="detail-row">
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="eyebrow tight">{t('profile.standing')}</div>
          <RankStandings ranks={ranks} />
        </>
      )}

      <Sheet center open={albumOpen} onClose={() => setAlbumOpen(false)}>
        <h2 style={{ marginBottom: 4 }}>🔒 {t('profile.privateAlbum')}</h2>
        <p className="hint" style={{ marginBottom: 12 }}>{t('album.ownerHint')}</p>
        <PhotoCarousel photos={photos.filter((p) => p.is_private)} hideLocks
                       onDeleted={deletePhoto} />
      </Sheet>

      <Sheet center open={giftsOpen} onClose={() => setGiftsOpen(false)}>
        <h2 style={{ marginBottom: 12 }}>{t('profile.gifts')}</h2>
        <div className="showcase">
          {gifts.map((g) => (
            <div key={g.slug} className="showcase-item" title={g.name}>
              <span className="showcase-glyph">{g.asset_key}</span>
              {g.quantity > 1 ? <span className="showcase-count num">{g.quantity}</span> : null}
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
