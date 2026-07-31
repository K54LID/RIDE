import { useEffect, type ReactNode } from 'react';
import { tg } from '../lib/tg';

/**
 * Dialog sheet. Anchored to the top of the visible viewport by default
 * (so its buttons are always reachable), vertically centred with the
 * `center` prop for content like the composer. Telegram's own back
 * button closes it, matching what the platform does everywhere else —
 * an in-app close chevron would be a second, competing affordance.
 */
export default function Sheet({
  open, onClose, children, center = false,
}: { open: boolean; onClose: () => void; children: ReactNode; center?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const restore = tg.backButton(onClose);
    // Block background scroll while the sheet owns the screen.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      restore();
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  /**
   * The panel lives inside a fixed flex wrapper sized to Telegram's
   * stable viewport, rather than positioning itself with top/transform.
   * `top: 50%` resolves against the *layout* viewport, which on several
   * Telegram clients is taller than what's actually on screen — so a
   * "centred" sheet sat low, and a menu opened from near the bottom of
   * a chat could put its buttons off the fold entirely. Centring with
   * flexbox inside a correctly-sized box can't drift.
   */
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className={`sheet-wrap ${center ? 'center' : ''}`}>
        <div className="sheet" role="dialog" aria-modal="true"
             onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grip" />
          {children}
        </div>
      </div>
    </>
  );
}
