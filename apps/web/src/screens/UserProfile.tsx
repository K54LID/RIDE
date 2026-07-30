import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type PublicUser, type ProfilePhoto, type CourtInfo, type RankEntryMini } from '../lib/api';
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
import RankChips from '../components/RankChips';

interface Payload {
  user: PublicUser;
  gifts: Array<{ slug: string; name: string; asset_key: string; quantity: number }>;
}

export default function UserProfile({
  accountId, balance, onClose, onBalanceChange, onOpenChat, onOpenUser,
}: {
  accountId: string;
  balance: number;
  onClose: () => void;
  onBalanceChange: () => void;
  onOpenChat: (conversationId: string) => void;
  onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [data, setData] = useState<Payload | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [court, setCourt] = useState<CourtInfo | null>(null);
  const [ranks, setRanks] = useState<RankEntryMini[]>([]);
  const [blockConfirm, setBlockConfirm] = useState(false);

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
      load();
    } catch { tg.notify('error'); }
  };

  const unblock = async () => {
    tg.tap('medium');
    try {
      await apiFetch('/v1/settings/unblock', {
        method: 'POST', body: JSON.stringify({ account_id: accountId }),
      });
      tg.notify('success');
      load();
    } catch { tg.notify('error'); }
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
    <Page title={u.handle ? `@${u.handle}` : u.display_name} onClose={onClose}>
      <div className="pro-head">
        <div className="pro-avatar" style={{ pointerEvents: 'none' }}>
          {primary
            ? <Media id={primary.media_id} kind="image" thumb />
            : <span className="pro-initial">{u.display_name.trim().charAt(0).toUpperCase()}</span>}
        </div>
        <div className="pro-counts">
          <div><b className="num">{u.followers}</b><span>{t('profile.followers')}</span></div>
          <div><b className="num">{u.woofs_received}</b><span>{t('profile.woofs')}</span></div>
          <div><b className="num">{u.gifts_received}</b><span>{t('profile.gifts')}</span></div>
        </div>
      </div>

      <div className="pro-name">
        {u.display_name}
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

      <Button variant="ghost" onClick={openChat}>{t('chats.title')}</Button>

      <RankChips ranks={ranks} />

      {/* Who paid for this person's standing — with their face, and a
          tap opens their profile. The title lapses 30 days after the
          court unless someone pays again. */}
      {court?.courter ? (
        <button className="courted-by"
                onClick={() => {
                  tg.tap('light');
                  onOpenUser(court.courter!.account_id);
                }}>
          <Avatar name={court.courter.display_name ?? '?'}
                  mediaId={court.courter.avatar_media_id} size={38} radius={12} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="courted-by-label">♛ {t('court.courtedBy')}</div>
            <div className="courted-by-name">
              {court.courter.display_name}
              {court.courter.handle ? (
                <span className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  {' '}@{court.courter.handle}
                </span>
              ) : null}
            </div>
            {court.courter.expires_at ? (
              <div className="courted-by-days num">
                {Math.max(0, Math.ceil(
                  (new Date(court.courter.expires_at).getTime() - Date.now()) / 86400000,
                ))} {t('court.daysLeft')}
              </div>
            ) : null}
          </div>
          <span style={{ color: 'var(--faint)' }}>›</span>
        </button>
      ) : null}

      {photos.length > 0 || lockedCount > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.photos')}</div>
          <PhotoCarousel photos={photos} lockedCount={lockedCount} />
          {lockedCount > 0 ? <p className="hint">{t('album.lockedHint')}</p> : null}
        </>
      ) : null}

      {data.gifts.length > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.gifts')}</div>
          <div className="showcase">
            {data.gifts.map((g) => (
              <div key={g.slug} className="showcase-item" title={g.name}>
                <span className="showcase-glyph">{g.asset_key}</span>
                {g.quantity > 1 ? <span className="showcase-count num">{g.quantity}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

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

      <button className="block-row" onClick={() => { tg.tap('light'); setBlockConfirm(true); }}>
        {t('profile.block')}
      </button>
      </>
      )}

      <Sheet open={blockConfirm} onClose={() => setBlockConfirm(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('profile.block')} {u.display_name}?</h2>
        <p style={{ marginBottom: 16 }}>{t('profile.block.body')}</p>
        <Button onClick={block}>{t('profile.block')}</Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" onClick={() => setBlockConfirm(false)}>{t('common.cancel')}</Button>
      </Sheet>
    </Page>
  );
}
