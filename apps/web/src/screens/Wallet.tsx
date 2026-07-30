import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError, type WalletState } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';

export default function Wallet({ onBack, onBalanceChange }: {
  onBack: () => void;
  onBalanceChange: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<WalletState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyPack, setBusyPack] = useState<string | null>(null);

  useEffect(() => tg.backButton(onBack), [onBack]);

  const load = useCallback(() => {
    setFailed(false);
    apiFetch<WalletState>('/v1/wallet')
      .then(setState)
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  /**
   * Coins are credited by the Telegram webhook, never by this handler —
   * anything the client can call, the client can forge. On a paid status
   * we just re-read the balance.
   */
  const buy = async (packId: string) => {
    setBusyPack(packId);
    try {
      const { invoice_url } = await apiFetch<{ invoice_url: string }>(
        '/v1/wallet/topup',
        { method: 'POST', body: JSON.stringify({ pack_id: packId }) },
      );
      const openInvoice = (window as unknown as {
        Telegram?: { WebApp?: { openInvoice?: (url: string, cb: (s: string) => void) => void } };
      }).Telegram?.WebApp?.openInvoice;

      if (!openInvoice) {
        // Outside Telegram (dev browser) there is no invoice UI.
        window.open(invoice_url, '_blank');
        return;
      }

      openInvoice(invoice_url, (status) => {
        if (status === 'paid') {
          tg.notify('success');
          // The webhook may land a moment after the callback.
          setTimeout(() => { load(); onBalanceChange(); }, 1200);
        } else if (status === 'failed') {
          tg.notify('error');
        }
      });
    } catch (err) {
      tg.notify('error');
      if (err instanceof ApiError) setFailed(true);
    } finally {
      setBusyPack(null);
    }
  };

  return (
    <div className="screen">
      <div className="head"><h1>{t('wallet.title')}</h1></div>

      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : state === null ? (
        <>
          <Skeleton h={88} mb={16} />
          <Skeleton h={62} mb={10} />
          <Skeleton h={62} />
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="eyebrow">{t('wallet.balance')}</div>
            <div className="num" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--court-lit)' }}>
              {state.balance}
            </div>
            <p style={{ fontSize: '0.85rem' }}>{t('wallet.coins')}</p>
          </div>

          <div className="eyebrow" style={{ marginBottom: 10 }}>{t('wallet.topUp')}</div>
          {state.packs.map((pack) => (
            <button key={pack.id} className="pack" disabled={busyPack !== null}
                    onClick={() => { tg.tap('medium'); buy(pack.id); }}>
              <span className="pack-coins">{pack.coins} {t('wallet.coins')}</span>
              <span className="pack-stars">
                {pack.stars}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m12 2 2.9 6.3 6.8.8-5 4.7 1.3 6.8L12 17.3 6 20.6l1.3-6.8-5-4.7 6.8-.8L12 2z" />
                </svg>
              </span>
            </button>
          ))}
          <p className="hint" style={{ marginTop: 6 }}>{t('wallet.withStars')}</p>

          <div className="eyebrow" style={{ margin: '26px 0 10px' }}>{t('wallet.history')}</div>
          {state.history.length === 0 ? (
            <p style={{ fontSize: '0.88rem' }}>{t('wallet.noHistory')}</p>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {state.history.map((h, i) => (
                <div key={i} className="rank" style={{ padding: '11px 14px' }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                    {h.reason.replace(/_/g, ' ')}
                  </span>
                  <span className="rank-score num"
                        style={{ color: h.delta > 0 ? 'var(--court-lit)' : 'var(--muted)' }}>
                    {h.delta > 0 ? `+${h.delta}` : h.delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
