import { useEffect, type ReactNode } from 'react';
import { tg } from '../lib/tg';

/**
 * Full-screen overlay page.
 *
 * A bottom sheet is right for a short choice and wrong for anything you
 * scroll — the gift catalogue, a filter set, someone's whole profile.
 * Those get the screen. Telegram's back button closes, matching the
 * platform, and the page owns scroll while open.
 */
export default function Page({
  title, onClose, action, children,
}: {
  title: string;
  onClose: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const restore = tg.backButton(onClose);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { restore(); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="page">
      <header className="page-head">
        <button className="page-back" aria-label="Back"
                onClick={() => { tg.tap('light'); onClose(); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="page-title">{title}</span>
        <div className="page-action">{action}</div>
      </header>
      <div className="page-body">{children}</div>
    </div>
  );
}
