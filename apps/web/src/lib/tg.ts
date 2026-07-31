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

  /**
   * Returns a cleanup function, so callers can use it directly in useEffect.
   *
   * Handlers form a stack and only the top one runs. Telegram's own
   * `onClick` is additive — every registered callback fires on a single
   * press — so with a profile over a follower list over a profile, one
   * back press used to close all three. Worse, each cleanup called
   * `BackButton.hide()` unconditionally, so closing an inner overlay
   * hid the button for the screen still underneath it: that is why the
   * back arrow vanished from Settings after opening and closing the
   * blocked list.
   *
   * One dispatcher is bound to Telegram for the life of the app. Push
   * and pop only change which handler it calls, and visibility follows
   * the stack: shown while anything is registered, hidden when empty.
   */
  backButton(onBack: (() => void) | null): () => void {
    if (!onBack) {
      // Explicit "nothing to go back to" — e.g. the first onboarding
      // step. Leaves any deeper handlers alone.
      syncBackButton();
      return () => undefined;
    }

    backStack.push(onBack);
    syncBackButton();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const i = backStack.lastIndexOf(onBack);
      if (i !== -1) backStack.splice(i, 1);
      syncBackButton();
    };
  },
};

const backStack: Array<() => void> = [];
let dispatcherBound = false;

/** Runs the topmost handler only. Bound to Telegram exactly once. */
function dispatchBack(): void {
  backStack[backStack.length - 1]?.();
}

function syncBackButton(): void {
  const b = app()?.BackButton;
  if (!b) return;
  if (!dispatcherBound) {
    b.onClick(dispatchBack);
    dispatcherBound = true;
  }
  if (backStack.length > 0) b.show(); else b.hide();
}
