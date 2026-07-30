import { useEffect, useState } from 'react';
import { apiFetch, ApiError, type Gift } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Skeleton } from './ui';

const RARITY_COLOR: Record<string, string> = {
  common: 'var(--hairline)',
  rare: 'var(--violet)',
  premium: 'var(--court)',
  limited: 'var(--pulse)',
  unique: 'var(--court-lit)',
};

/**
 * Gift shop. Grouped by category, sorted by cost within each, with the
 * rarity carried in the tile border rather than a label — the price
 * already says "expensive", the colour says "rare", and the two are not
 * the same thing.
 */
export default function GiftShop({
  targetId, balance, onSent,
}: { targetId: string; balance: number; onSent: (spent: number) => void }) {
  const t = useT();
  const [gifts, setGifts] = useState<Gift[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ gifts: Gift[] }>('/v1/gifts')
      .then((r) => setGifts(r.gifts))
      .catch(() => setGifts([]));
  }, []);

  const send = async (g: Gift) => {
    if (g.coin_cost > balance) {
      setError(t('gifts.notEnough'));
      tg.notify('error');
      return;
    }
    setSending(g.slug);
    setError(null);
    try {
      await apiFetch(`/v1/users/${targetId}/gifts`, {
        method: 'POST',
        body: JSON.stringify({ gift_slug: g.slug }),
      });
      tg.notify('success');
      onSent(g.coin_cost);
    } catch (err) {
      tg.notify('error');
      setError(err instanceof ApiError && err.code === 'INSUFFICIENT_COINS'
        ? t('gifts.notEnough') : t('gifts.failed'));
    } finally {
      setSending(null);
    }
  };

  if (!gifts) return <><Skeleton h={90} mb={10} /><Skeleton h={90} /></>;

  const categories = [...new Set(gifts.map((g) => g.category))];

  return (
    <>
      {error ? <p className="error">{error}</p> : null}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{cat}</div>
          <div className="gift-grid">
            {gifts.filter((g) => g.category === cat).map((g) => (
              <button
                key={g.slug}
                className="gift-tile"
                style={{ borderColor: RARITY_COLOR[g.rarity] ?? 'var(--hairline)' }}
                disabled={sending !== null}
                onClick={() => { tg.tap('medium'); send(g); }}
              >
                <span className="gift-glyph">{g.asset_key}</span>
                <span className="gift-name">{g.name}</span>
                <span className="gift-cost num">
                  {sending === g.slug ? '…' : g.coin_cost}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
