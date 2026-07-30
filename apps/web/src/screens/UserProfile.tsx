import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type PublicUser, type ProfilePhoto } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Page from '../components/Page';
import Media from '../components/Media';
import PersonActions from '../components/PersonActions';
import { VerifiedMark } from '../components/VerifiedMark';
import { Button, Skeleton } from '../components/ui';
import CourtCrest from '../components/CourtCrest';

interface Payload {
  user: PublicUser;
  gifts: Array<{ slug: string; name: string; asset_key: string; quantity: number }>;
}

export default function UserProfile({ accountId, balance, onClose, onBalanceChange, onOpenChat }: {
  accountId: string;
  balance: number;
  onClose: () => void;
  onBalanceChange: () => void;
  onOpenChat: (conversationId: string) => void;
}) {
  const t = useT();
  const [data, setData] = useState<Payload | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    apiFetch<Payload>(`/v1/users/${accountId}`).then(setData).catch(() => setFailed(true));
    apiFetch<{ photos: ProfilePhoto[]; locked_count: number }>(`/v1/users/${accountId}/photos`)
      .then((r) => { setPhotos(r.photos); setLockedCount(r.locked_count); })
      .catch(() => undefined);
  }, [accountId]);
  useEffect(load, [load]);

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
        {u.age !== null ? <span className="pro-age">{u.age}</span> : null}
      </div>
      {u.bio ? <p className="pro-bio">{u.bio}</p> : null}

      <PersonActions
        targetId={u.account_id}
        courtValue={u.court_value}
        balance={balance}
        initialFollowing={u.i_follow}
        initialWoofed={u.woofed_today}
        onChange={() => { load(); onBalanceChange(); }}
      />

      <Button variant="ghost" onClick={openChat}>{t('chats.title')}</Button>

      <div className="pro-court" style={{ marginTop: 14 }}>
        <CourtCrest value={u.court_value} size={46} />
        <div>
          <div className="eyebrow">{t('profile.courtValue')}</div>
          <div className="num pro-court-val">{u.court_value}</div>
        </div>
      </div>

      {photos.length > 0 || lockedCount > 0 ? (
        <>
          <div className="eyebrow tight">{t('profile.photos')}</div>
          <div className="photo-grid">
            {photos.map((p) => (
              <div key={p.id} className="photo-cell">
                <Media id={p.media_id} kind="image" thumb />
                {p.is_private ? <span className="photo-tag">🔒</span> : null}
              </div>
            ))}
            {lockedCount > 0 ? (
              <div className="photo-cell locked">
                <span>🔒</span>
                <span className="num">{lockedCount}</span>
              </div>
            ) : null}
          </div>
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
    </Page>
  );
}
