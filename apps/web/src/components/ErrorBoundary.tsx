import { TABLES, LOCALES, type Locale } from '../i18n/strings';

/**
 * Crash-screen copy, read straight from storage.
 *
 * This renders when the React tree has already failed, so it cannot use
 * the i18n hook — the provider may be part of what broke. Reading the
 * saved locale directly means someone still sees their own language at
 * the one moment the app has nothing else to offer them.
 */
function crashText(which: 'title' | 'body'): string {
  let locale: Locale = 'en';
  try {
    const saved = localStorage.getItem('ride.locale');
    if (saved && saved in LOCALES) locale = saved as Locale;
  } catch { /* storage unavailable */ }
  return TABLES[locale][which === 'title' ? 'error.title' : 'error.body'];
}

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence.
 *
 * React unmounts the entire tree when a render throws and nothing
 * catches it. Inside a Telegram webview that is a black screen with no
 * pull-to-refresh and no address bar — the app is simply dead until the
 * person works out they have to close and reopen it. Every "the screen
 * froze until I reloaded" report ends here if it isn't caught.
 *
 * Catching gives them a button instead. It does not excuse the bug: the
 * error is logged so it still shows up in the webview console.
 */
interface State { failed: boolean }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <div className="empty">
          <h2>{crashText('title')}</h2>
          <p>{crashText('body')}</p>
          <div style={{ marginTop: 20 }}>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload RIDE
            </button>
          </div>
        </div>
      </div>
    );
  }
}
