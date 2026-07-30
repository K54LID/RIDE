/**
 * Thin wrapper over the Telegram WebApp global.
 *
 * Deliberately not the @telegram-apps/sdk package: everything used here
 * is on window.Telegram.WebApp, which the script tag in index.html
 * already provides. One fewer dependency to keep in the lockfile.
 *
 * Every call is optional-chained — the app must still run in a plain
 * browser tab during development, where the global is absent.
 */

type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type Notify = 'error' | 'success' | 'warning';

interface WebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: {
    impactOccurred: (s: Impact) => void;
    notificationOccurred: (t: Notify) => void;
    selectionChanged: () => void;
  };
}

function app(): WebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
}

export const tg = {
  init() {
    const a = app();
    a?.ready();
    a?.expand();
    // Match the chrome to the app ground so there's no seam at the top.
    a?.setHeaderColor?.('#0B0714');
    a?.setBackgroundColor?.('#0B0714');
  },

  initData(): string {
    return app()?.initData ?? '';
  },

  /** Physical feedback on discrete actions. Silent where unsupported. */
  tap(style: Impact = 'light') {
    app()?.HapticFeedback?.impactOccurred(style);
  },
  select() {
    app()?.HapticFeedback?.selectionChanged();
  },
  notify(type: Notify) {
    app()?.HapticFeedback?.notificationOccurred(type);
  },

  /** Returns a cleanup function, so callers can use it directly in useEffect. */
  backButton(onBack: (() => void) | null): () => void {
    const b = app()?.BackButton;
    if (!b) return () => undefined;
    if (!onBack) {
      b.hide();
      return () => undefined;
    }
    b.onClick(onBack);
    b.show();
    return () => {
      b.offClick(onBack);
      b.hide();
    };
  },
};
