import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, RTL, TABLES, type Locale, type T } from './strings';

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

  // Switching language must update direction too, or Arabic renders
  // left-to-right with mirrored punctuation.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL.has(locale) ? 'rtl' : 'ltr';
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
