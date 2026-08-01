import { useEffect, useState } from 'react';
import { apiFetch, type Me, type OwnedGift, type ProfilePhoto, type RankEntryMini , type CourtInfo } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import PhotoManager from '../components/PhotoManager';
import PhotoCarousel from '../components/PhotoCarousel';
import RankStandings from '../components/RankStandings';
import Media from '../components/Media';
import Avatar from '../components/Avatar';
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
export default function Profile({ me, onEdit, onWallet, onSettings, onSaved, onFollows, onOpenUser }: {
  me: Me;
  onEdit: () => void;
  onWallet: () => void;
  onSettings: () => void;
  onSaved: () => void;
  onFollows: (mode: 'followers' | 'following') => void;
  /** Opens whoever is courting you — their panel is a link, not a label. */
  onOpenUser: (accountId: string) => void;
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
  const [court, setCourt] = useState<CourtInfo | null>(null);
  const [courtInfo, setCourtInfo] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

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
    // Your own standing: who is holding it and how long you have before
    // it lapses to zero. Knowing it expires is the only way the
    // "keep being courted" mechanic can mean anything to the person it
    // happens to.
    apiFetch<CourtInfo>(`/v1/users/${me.account_id}/court`)
      .then(setCourt).catch(() => undefined);
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
        <button className="pro-avatar"
                onClick={() => { tg.tap('light');
                                 if (primary) setAvatarOpen(true); else setEditingPhotos((v) => !v); }}>
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

      {/* Username in the header, display name here above the bio.
          They are two different things — @k54lid is how people address
          you, "Khalid" is what you are called — so both belong on the
          profile, in that order. */}
      {/* Who is holding your standing, and how long is left before it
          lapses back to 2. Sits directly under the counts row: that
          strip is already empty, and who is courting you belongs with
          the other numbers about you rather than below the photos. */}
      {court?.courter ? (
        <button className="courted-by" style={{ marginBottom: 4 }}
                onClick={() => { tg.tap('light'); onOpenUser(court.courter!.account_id); }}>
          <Avatar name={court.courter.display_name ?? '?'}
                  mediaId={court.courter.avatar_media_id} size={38} radius={12} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="courted-by-label">♛ {t('court.courtedBy')}</div>
            <div className="courted-by-name">
              {court.courter.handle
                ? <span className="num">@{court.courter.handle}</span>
                : court.courter.display_name}
            </div>
            {court.courter.expires_at ? (
              <div className="courted-by-days num">
                {Math.max(0, Math.ceil(
                  (new Date(court.courter.expires_at).getTime() - Date.now()) / 86400000,
                ))} {t('court.daysLeft')} · {t('court.thenZero')}
              </div>
            ) : null}
          </div>
          <span style={{ color: 'var(--faint)' }}>›</span>
        </button>
      ) : court && court.court_value > 0 ? (
        <p className="hint" style={{ marginBottom: 4 }}>{t('court.lapsed')}</p>
      ) : null}

      {/* Directly under the panel, where the question arises. */}
      <button className="court-info" onClick={() => { tg.tap('light'); setCourtInfo(true); }}>
        {t('court.howTitle')}
      </button>

      <div className="pro-name">
        {me.display_name}
        {age !== null ? <span className="pro-age num">{age}</span> : null}
      </div>
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

      <Sheet center open={courtInfo} onClose={() => setCourtInfo(false)}>
        <div className="sheet-head">
          <h2 style={{ margin: 0 }}>♛ {t('court.howTitle')}</h2>
          <button className="sheet-close" aria-label={t('common.close')}
                  onClick={() => setCourtInfo(false)}>✕</button>
        </div>
        <p className="faq-a">{t('court.how.what')}</p>
        <p className="faq-a">{t('court.how.cost')}</p>
        <p className="faq-a">{t('court.how.expiry')}</p>
        <p className="faq-a">{t('court.how.rank')}</p>
      </Sheet>

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

      {/* Tapping a profile photo opens it full screen. The thumbnail is
          a crop; the photo is the thing people actually want to look
          at. Closed with the X or the back button. */}
      {avatarOpen && primary ? (
        <div className="lightbox" onClick={() => setAvatarOpen(false)}>
          <button className="lightbox-close" aria-label={t('common.close')}
                  onClick={() => setAvatarOpen(false)}>✕</button>
          <Media id={primary.media_id} kind="image" />
        </div>
      ) : null}
    </div>
  );
}
