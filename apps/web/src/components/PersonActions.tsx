import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Page from './Page';
import GiftShop from './GiftShop';

/**
 * The four things you can do to another person.
 *
 * Woof and follow are free and optimistic; court and gift move coins,
 * so they wait for the server before the UI changes. Each tile is a
 * square with its glyph and label stacked and centred — previously the
 * contents hugged the top-left of the tile.
 */
export default function PersonActions({
  targetId, courtValue, balance, onChange,
  initialFollowing = false, initialWoofed = false,
}: {
  targetId: string;
  courtValue: number;
  balance: number;
  onChange: () => void;
  initialFollowing?: boolean;
  initialWoofed?: boolean;
}) {
  const t = useT();
  const [woofed, setWoofed] = useState(initialWoofed);
  const [following, setFollowing] = useState(initialFollowing);
  const [giftOpen, setGiftOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courtCost = courtValue * 2;

  const woof = async () => {
    tg.tap('medium');
    setWoofed(true);
    try { await apiFetch(`/v1/users/${targetId}/woof`, { method: 'POST' }); tg.notify('success'); }
    catch { setWoofed(false); tg.notify('error'); }
  };

  const follow = async () => {
    tg.tap('light');
    const next = !following;
    setFollowing(next);
    try {
      const r = await apiFetch<{ following: boolean }>(`/v1/users/${targetId}/follow`, { method: 'POST' });
      setFollowing(r.following);
      onChange();
    } catch { setFollowing(!next); tg.notify('error'); }
  };

  const court = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/users/${targetId}/court`, { method: 'POST' });
      tg.notify('success');
      onChange();
    } catch (err) {
      tg.notify('error');
      setError(err instanceof ApiError && err.code === 'INSUFFICIENT_COINS'
        ? t('court.notEnough') : t('court.failed'));
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="actions">
        <button className={`act ${woofed ? 'on' : ''}`} onClick={woof} disabled={woofed}>
          <span className="act-glyph">🐾</span>
          <span className="act-label">{t('action.woof')}</span>
        </button>
        <button className={`act ${following ? 'on' : ''}`} onClick={follow}>
          <span className="act-glyph">{following ? '✓' : '+'}</span>
          <span className="act-label">{following ? t('action.following') : t('action.follow')}</span>
        </button>
        <button className="act" onClick={() => { tg.tap('light'); setGiftOpen(true); }}>
          <span className="act-glyph">🎁</span>
          <span className="act-label">{t('action.gift')}</span>
        </button>
        <button className="act act-court" onClick={() => { tg.tap('heavy'); court(); }} disabled={busy}>
          <span className="act-glyph">♛</span>
          <span className="act-label">{t('action.court')} <b className="num">{courtCost}</b></span>
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {giftOpen ? (
        <Page
          title={t('gifts.title')}
          onClose={() => setGiftOpen(false)}
          action={<span className="num page-balance">{balance}</span>}
        >
          <GiftShop
            targetId={targetId}
            balance={balance}
            onSent={() => { setGiftOpen(false); onChange(); }}
          />
        </Page>
      ) : null}
    </>
  );
}
