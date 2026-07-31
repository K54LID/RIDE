import { useEffect, useState } from 'react';
import type { ProfilePhoto } from '../lib/api';
import Media from './Media';
import { tg } from '../lib/tg';
import { useT } from '../i18n';

/**
 * Profile photo strip.
 *
 * Small square thumbnails in a horizontal scroll row, not full-width
 * slides — a profile is a page to skim, and a viewport-sized square per
 * photo pushed everything else below the fold. Native overflow scroll
 * with snap keeps momentum and accessibility from the platform and
 * doesn't fight Telegram's own horizontal gestures.
 *
 * Tapping a thumbnail opens it full-screen; tap again (or the ✕, or
 * Telegram's back button) to close.
 */
export default function PhotoCarousel({ photos, lockedCount = 0, onDeleted }: {
  photos: ProfilePhoto[];
  lockedCount?: number;
  /**
   * Present only on your own profile. Given it, the lightbox offers
   * Delete — going through Edit profile to remove a photo you are
   * already looking at is a detour with no purpose.
   */
  onDeleted?: (photoId: string) => Promise<void> | void;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Telegram's back button closes the lightbox, same as every other
  // overlay in the app.
  useEffect(() => {
    if (!openId) return;
    return tg.backButton(() => { setConfirming(false); setOpenId(null); });
  }, [openId]);

  if (photos.length === 0 && lockedCount === 0) return null;

  const open = photos.find((p) => p.id === openId) ?? null;

  return (
    <>
      <div className="pstrip" role="list" aria-label={t('profile.photos')}>
        {photos.map((p) => (
          <button key={p.id} className="pstrip-cell" role="listitem"
                  onClick={() => { tg.tap('light'); setOpenId(p.id); }}>
            <Media id={p.media_id} kind="image" thumb />
            {p.is_private ? <span className="pstrip-lock">🔒</span> : null}
          </button>
        ))}
        {lockedCount > 0 ? (
          <div className="pstrip-cell locked" aria-hidden="true">
            <span>🔒</span>
            <span className="num">{lockedCount}</span>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="lightbox" role="dialog" aria-modal="true"
             onClick={() => setOpenId(null)}>
          <button className="lightbox-close" aria-label={t('common.close')}
                  onClick={() => setOpenId(null)}>✕</button>
          <Media key={open.id} id={open.media_id} kind="image" />

          {onDeleted ? (
            <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
              {confirming ? (
                <>
                  <span className="lightbox-ask">{t('photo.deleteConfirm')}</span>
                  <button className="chip" disabled={busy}
                          onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
                  <button className="chip danger" disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await onDeleted(open.id);
                              tg.notify('success');
                              setOpenId(null);
                            } catch { tg.notify('error'); }
                            setBusy(false);
                            setConfirming(false);
                          }}>{t('common.delete')}</button>
                </>
              ) : (
                <button className="chip danger"
                        onClick={() => { tg.tap('light'); setConfirming(true); }}>
                  {t('common.delete')}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
