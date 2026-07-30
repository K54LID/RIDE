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

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className={center ? 'sheet sheet-center' : 'sheet'} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        {children}
      </div>
    </>
  );
}
