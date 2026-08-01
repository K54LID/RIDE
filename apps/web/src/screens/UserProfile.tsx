import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError, type PublicUser, type ProfilePhoto, type CourtInfo, type RankEntryMini } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Page from '../components/Page';
import Media from '../components/Media';
import Avatar from '../components/Avatar';
import PhotoCarousel from '../components/PhotoCarousel';
import PersonActions from '../components/PersonActions';
import { VerifiedMark } from '../components/VerifiedMark';
import { Button, Skeleton } from '../components/ui';
import Sheet from '../components/Sheet';
import RankStandings from '../components/RankStandings';

interface Payload {
  user: PublicUser;
  gifts: Array<{ slug: string; name: string; asset_key: string; quantity: number }>;
}

export default function UserProfile({
  accountId, balance, onClose, onBalanceChange, onOpenChat, onOpenUser, onFollows,
}: {
  accountId: string;
  balance: number;
  onClose: () => void;
  onBalanceChange: () => void;
  onOpenChat: (conversationId: string) => void;
  onOpenUser: (accountId: string) => void;
  onFollows: (mode: 'followers' | 'following') => void;
}) {
  const t = useT();
  const [data, setData] = useState<Payload | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [court, setCourt] = useState<CourtInfo | null>(null);
  const [ranks, setRanks] = useState<RankEntryMini[]>([]);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [blockDone, setBlockDone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [courtInfo, setCourtInfo] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);

  const load = useCallback(() => {
    apiFetch<Payload>(`/v1/users/${accountId}`).then(setData).catch(() => setFailed(true));
    apiFetch<CourtInfo>(`/v1/users/${accountId}/court`).then(setCourt).catch(() => undefined);
    apiFetch<{ ranks: RankEntryMini[] }>(`/v1/users/${accountId}/ranks`)
      .then((r) => setRanks(r.ranks)).catch(() => undefined);
    apiFetch<{ photos: ProfilePhoto[]; locked_count: number }>(`/v1/users/${accountId}/photos`)
      .then((r) => { setPhotos(r.photos); setLockedCount(r.locked_count); })
      .catch(() => undefined);
  }, [accountId]);
  useEffect(load, [load]);

  const block = async () => {
    setBlockConfirm(false);
    tg.tap('heavy');
    try {
      await apiFetch(`/v1/users/${accountId}/block`, { method: 'POST' });
      tg.notify('success');
      setActionError(null);
      // "Blocked" on its own leaves people wondering whether it stuck
      // and whether it can be undone. Say where they went and how to
      // reverse it, then reload so the profile shows its blocked state.
      setBlockDone(true);
      load();
    } catch (err) {
      // A silent failure is indistinguishable from a button that does
      // nothing, which is exactly what it looked like. Say so.
      tg.notify('error');
      setActionError(err instanceof ApiError ? err.message : t('common.offline'));
    }
  };

  const unblock = async () => {
    tg.tap('medium');
    try {
      await apiFetch('/v1/settings/unblock', {
        method: 'POST', body: JSON.stringify({ account_id: accountId }),
      });
      tg.notify('success');
      setActionError(null);
      load();
    } catch (err) {
      tg.notify('error');
      setActionError(err instanceof ApiError ? err.message : t('common.offline'));
    }
  };

  const openChat = async () => {
    tg.tap('light');
    try {
      const r = await apiFetch<{ conversation_id: string }>('/v1/chats/open', {
        method: 'POST', body: JSON.stringify({ account_id: accountId }),
      });
      onOpenChat(r.conversation_id);
    } catch { tg.notify('error'); }
  };

  if (failed) {
    return (
      <Page title="" onClose={onClose}>
        <p style={{ textAlign: 'center', padding: 40 }}>{t('common.offline.body')}</p>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page title="" onClose={onClose}>
        <Skeleton h={90} mb={14} /><Skeleton h={60} mb={10} /><Skeleton h={140} />
      </Page>
    );
  }

  const u = data.user;
  const list = (v: string[] | null) => (v && v.length ? v.join(', ') : null);
  const details: Array<[string, string | null]> = [
    [t('profile.age'), u.age !== null ? String(u.age) : null],
    [t('profile.gender'), u.gender],
    [t('profile.pronouns'), u.pronouns],
    [t('profile.orientation'), u.orientation],
    [t('profile.relationship'), u.relationship_status],
    [t('profile.lookingFor'), list(u.looking_for)],
    [t('profile.languages'), list(u.languages)],
    [t('profile.interests'), list(u.interests)],
    [t('profile.tribes'), list(u.tribes)],
    [t('profile.height'), u.height_cm ? `${u.height_cm} cm` : null],
    [t('profile.weight'), u.weight_kg ? `${u.weight_kg} kg` : null],
  ].filter(([, v]) => v) as Array<[string, string]>;

  const primary = photos.find((p) => !p.is_private) ?? photos[0];

  return (
    <Page title={`@${u.handle}`} onClose={onClose}>
      <div className="pro-head">
        <button className="pro-avatar" disabled={!primary}
                onClick={() => { tg.tap('light'); setAvatarOpen(true); }}>
          {primary
            ? <Media id={primary.media_id} kind="image" thumb />
            : <span className="pro-initial">{u.display_name.trim().charAt(0).toUpperCase()}</span>}
        </button>
        {/* Gifts is a tab beside the other counts and opens the
            collection, rather than a loose showcase down the page. */}
        <div className="pro-counts">
          <button className="pro-count-btn"
                  onClick={() => { tg.tap('light'); onFollows('followers'); }}>
            <b className="num">{u.followers}</b><span>{t('profile.followers')}</span>
          </button>
          <div><b className="num">{u.woofs_received}</b><span>{t('profile.woofs')}</span></div>
          <button className="pro-count-btn" disabled={data.gifts.length === 0}
                  onClick={() => { tg.tap('light'); setGiftsOpen(true); }}>
            <b className="num">{u.gifts_received}</b><span>{t('profile.gifts')}</span>
          </button>
        </div>
          {court?.courter ? (
            <button className="courted-mini"
                    onClick={() => { tg.tap('light'); onOpenUser(court.courter!.account_id); }}>
              <Avatar name={court.courter.display_name ?? '?'}
                      mediaId={court.courter.avatar_media_id} size={22} radius={11} />
              <span className="courted-mini-text">
                <span className="courted-mini-label">♛ {t('court.courtedBy')}</span>
                <span className="num courted-mini-who">
                  {court.courter.handle ? `@${court.courter.handle}` : court.courter.display_name}
                  {court.courter.expires_at ? (
                    <span className="courted-mini-days">
                      {' · '}
                      {Math.max(0, Math.ceil(
                        (new Date(court.courter.expires_at).getTime() - Date.now()) / 86400000,
                      ))}d
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ) : null}
      </div>

      <div className="pro-name">
        {u.display_name}
        {u.age !== null && u.age !== undefined
          ? <span className="pro-age num">{u.age}</span> : null}
        {u.verified ? <VerifiedMark size={15} /> : null}
        {u.vip ? <span className="vip-chip">VIP</span> : null}
        {u.online ? <span className="online-dot" /> : null}
      </div>
      {u.bio ? <p className="pro-bio">{u.bio}</p> : null}

      {u.i_blocked ? (
        <>
          <p style={{ margin: '18px 0 12px', color: 'var(--muted)', fontSize: '0.9rem' }}>
            {t('profile.blockedNote')}
          </p>
          <Button onClick={unblock}>{t('settings.unblock')}</Button>
        </>
      ) : (
      <>
      <PersonActions
        targetId={u.account_id}
        courtValue={court?.court_value ?? u.court_value}
        balance={balance}
        initialFollowing={u.i_follow}
        initialWoofed={u.woofed_today}
        onChange={() => { load(); onBalanceChange(); }}
      />

      <button className="court-info" onClick={() => { tg.tap('light'); setCourtInfo(true); }}>
        {t('court.howTitle')}
      </button>

      <Button variant="ghost" onClick={openChat}>{t('chats.title')}</Button>

      <button className="block-row" onClick={() => { tg.tap('light'); setBlockConfirm(true); }}>
        {t('profile.block')}
      </button>
      {actionError ? <p className="error">{actionError}</p> : null}

      {/* Who paid for this person's standing — with their face, and a
          tap opens their profile. The title lapses 30 days after the
          court unless someone pays again. */}
      {/* The album is the last cell of the same strip. Granted → it
          opens; not granted → it shows the count of what is behind the
          lock. Either way it lines up with the public photos instead of
          sitting beside them as a differently-sized tile. */}
      <PhotoCarousel
        photos={photos.filter((p) => !p.is_private)}
        lockedCount={lockedCount}
        albumOpenCount={photos.filter((p) => p.is_private).length}
        onLockedClick={() => setAlbumOpen(true)} />

      <div className="eyebrow tight">{t('profile.standingOther')}</div>
      <RankStandings ranks={ranks} />

      {details.length > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.details')}</div>
          <div className="card compact">
            {details.map(([k, v]) => (
              <div key={k} className="detail-row"><span>{k}</span><span>{v}</span></div>
            ))}
          </div>
        </>
      ) : null}

      </>
      )}

      <Sheet center open={albumOpen} onClose={() => setAlbumOpen(false)}>
        <h2 style={{ marginBottom: 4 }}>🔒 {t('profile.privateAlbum')}</h2>
        {lockedCount > 0 ? (
          <p className="hint" style={{ marginBottom: 12 }}>{t('album.lockedHint')}</p>
        ) : null}
        <PhotoCarousel photos={photos.filter((p) => p.is_private)}
                       lockedCount={lockedCount} hideLocks />
      </Sheet>

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

      <Sheet center open={giftsOpen} onClose={() => setGiftsOpen(false)}>
        <h2 style={{ marginBottom: 12 }}>{t('profile.gifts')}</h2>
        <div className="showcase">
          {data.gifts.map((g) => (
            <div key={g.slug} className="showcase-item" title={g.name}>
              <span className="showcase-glyph">{g.asset_key}</span>
              {g.quantity > 1 ? <span className="showcase-count num">{g.quantity}</span> : null}
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet center open={blockDone} onClose={() => setBlockDone(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('profile.blocked')}</h2>
        <p style={{ marginBottom: 16 }}>{t('profile.blocked.body')}</p>
        <Button variant="ghost" onClick={() => setBlockDone(false)}>{t('common.done')}</Button>
      </Sheet>

      <Sheet center open={blockConfirm} onClose={() => setBlockConfirm(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('profile.block')} {u.display_name}?</h2>
        <p style={{ marginBottom: 16 }}>{t('profile.block.body')}</p>
        <Button onClick={block}>{t('profile.block')}</Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" onClick={() => setBlockConfirm(false)}>{t('common.cancel')}</Button>
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
    </Page>
  );
}
