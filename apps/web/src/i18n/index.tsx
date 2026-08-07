import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, TABLES, type Locale, type T } from './strings';
import { tg } from '../lib/tg';

export { LOCALES, type Locale };

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof T) => string;
}

const I18nContext = createContext<Ctx | null>(null);

const STORAGE_KEY = 'ride.locale';

/**
 * Initial locale: an explicit past choice wins, then Telegram's own
 * language_code, then English. Telegram sends codes like "pt-BR", so we
 * match on the primary subtag.
 */
function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LOCALES) return saved as Locale;
  } catch {
    // Private mode or a webview with storage disabled. Fall through.
  }
  const tgLang = (window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
  }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const primary = (tgLang ?? navigator.language ?? 'en').split('-')[0]!;
  return (primary in LOCALES ? primary : 'en') as Locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detect);

  /**
   * Adopt the language chosen on the server.
   *
   * `detect` can only see this device — localStorage, then Telegram's
   * hint. Someone who picked a language in the bot chat would open the
   * Mini App and find it in a different one. This asks the server what
   * they actually chose; the endpoint answers before registration too,
   * so it works on the very first screen.
   *
   * Runs once at mount. A later in-app change writes through to the
   * server, so re-fetching would only ever confirm what is already set.
   */
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun'}/v1/locale`, {
      headers: { Authorization: `tma ${tg.initData()}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { locale?: string | null } | null) => {
        const server = body?.locale;
        if (!alive || !server || !(server in LOCALES)) return;
        setLocaleState(server as Locale);
        try { localStorage.setItem(STORAGE_KEY, server); } catch { /* storage off */ }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // Switching language must update direction too, or Arabic renders
  // left-to-right with mirrored punctuation.
  useEffect(() => {
    document.documentElement.lang = locale;
    /**
     * Language changes the words, not the layout.
     *
     * Setting dir=rtl mirrors the entire interface — nav order, icon
     * sides, every inset-inline — which is a different app, not a
     * translated one. Arabic and Persian text still renders
     * right-to-left inside its own box because the browser applies the
     * Unicode bidi algorithm per run; only the page-level mirroring is
     * suppressed. `lang` is still set so hyphenation, fonts and
     * screen readers behave.
     */
    document.documentElement.dir = 'ltr';
  }, [locale]);

  const value = useMemo<Ctx>(() => {
    const table = TABLES[locale];
    return {
      locale,
      setLocale: (l) => {
        try {
          localStorage.setItem(STORAGE_KEY, l);
        } catch {
          // Preference just won't persist; the switch still applies.
        }
        setLocaleState(l);
      },
      // Falls back to English rather than rendering a raw key, so a
      // missing translation degrades to readable text.
      t: (key) => table[key] ?? TABLES.en[key] ?? key,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Shorthand for the common case of only needing the translate function. */
export function useT(): (key: keyof T) => string {
  return useI18n().t;
}
