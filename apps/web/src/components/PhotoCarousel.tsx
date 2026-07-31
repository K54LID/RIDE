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
export default function PhotoCarousel({
  photos, lockedCount = 0, hideLocks = false, onLockedClick, onDeleted,
}: {
  photos: ProfilePhoto[];
  /**
   * Photos behind the lock. Rendered as the last cell of this same
   * strip — the album is one of the photos, not a separate block beside
   * them with its own size and baseline.
   */
  lockedCount?: number;
  /**
   * Suppress the per-thumbnail 🔒 badge. Inside the private album sheet
   * every photo is private and the sheet's title already says so, so a
   * lock on each thumbnail is the same word said twice.
   */
  hideLocks?: boolean;
  /** Makes the album cell a button. Without it the cell is inert. */
  onLockedClick?: () => void;
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
            {p.is_private && !hideLocks ? <span className="pstrip-lock">🔒</span> : null}
          </button>
        ))}

        {/* The album is a cell of this strip, so it lines up with the
            photos exactly: same square, same radius, same baseline. As a
            sibling of the strip it sat a few pixels high and a size
            apart, which read as a different kind of thing entirely. */}
        {lockedCount > 0 ? (
          onLockedClick ? (
            <button className="pstrip-cell locked" role="listitem"
                    aria-label={t('profile.privateAlbum')}
                    onClick={() => { tg.tap('light'); onLockedClick(); }}>
              <span>🔒</span>
              <span className="num">{lockedCount}</span>
            </button>
          ) : (
            <div className="pstrip-cell locked" aria-hidden="true">
              <span>🔒</span>
              <span className="num">{lockedCount}</span>
            </div>
          )
        ) : null}
      </div>

      {open ? (
        <div className="lightbox" role="dialog" aria-modal="true"
             onClick={() => setOpenId(null)}>
          {/* Controls live in one bar at the top, the way the story
              viewer does it: delete sits next to the exit, both under
              the thumb, neither at the far bottom of the screen. */}
          <div className="lightbox-top" onClick={(e) => e.stopPropagation()}>
            {onDeleted ? (
              confirming ? (
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
                <button className="lightbox-del" aria-label={t('common.delete')}
                        onClick={() => { tg.tap('light'); setConfirming(true); }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                       strokeLinejoin="round">
                    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                  </svg>
                </button>
              )
            ) : null}
            <button className="lightbox-close" aria-label={t('common.close')}
                    onClick={() => setOpenId(null)}>✕</button>
          </div>

          <Media key={open.id} id={open.media_id} kind="image" />
        </div>
      ) : null}
    </>
  );
}
