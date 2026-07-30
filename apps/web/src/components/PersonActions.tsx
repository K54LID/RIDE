import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Sheet from './Sheet';
import GiftShop from './GiftShop';

/**
 * The four things you can do to another person. Woof and follow are free
 * and optimistic; court and gift move coins, so they confirm against the
 * server before the UI changes.
 */
export default function PersonActions({
  targetId, courtValue, balance, onChange,
}: {
  targetId: string;
  courtValue: number;
  balance: number;
  onChange: () => void;
}) {
  const t = useT();
  const [woofed, setWoofed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courtCost = courtValue * 2;

  const woof = async () => {
    tg.tap('medium');
    setWoofed(true);
    try {
      await apiFetch(`/v1/users/${targetId}/woof`, { method: 'POST' });
      tg.notify('success');
    } catch {
      setWoofed(false);
      tg.notify('error');
    }
  };

  const follow = async () => {
    tg.tap('light');
    const next = !following;
    setFollowing(next);
    try {
      const r = await apiFetch<{ following: boolean }>(
        `/v1/users/${targetId}/follow`, { method: 'POST' });
      setFollowing(r.following);
    } catch {
      setFollowing(!next);
      tg.notify('error');
    }
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="actions">
        <button className={`act ${woofed ? 'on' : ''}`} onClick={woof} disabled={woofed}>
          <span className="act-glyph">🐾</span>
          {t('action.woof')}
        </button>
        <button className={`act ${following ? 'on' : ''}`} onClick={follow}>
          <span className="act-glyph">{following ? '✓' : '+'}</span>
          {following ? t('action.following') : t('action.follow')}
        </button>
        <button className="act" onClick={() => { tg.tap('light'); setGiftOpen(true); }}>
          <span className="act-glyph">🎁</span>
          {t('action.gift')}
        </button>
        <button className="act act-court" onClick={() => { tg.tap('heavy'); court(); }} disabled={busy}>
          <span className="act-glyph">♛</span>
          {t('action.court')} <span className="num">{courtCost}</span>
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <Sheet open={giftOpen} onClose={() => setGiftOpen(false)}>
        <GiftShop
          targetId={targetId}
          balance={balance}
          onSent={() => { setGiftOpen(false); onChange(); }}
        />
      </Sheet>
    </>
  );
}
