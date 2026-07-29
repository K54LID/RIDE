const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';

/**
 * Every request carries the raw initData. The server re-verifies the
 * HMAC on each call, so there is no session token to steal and no
 * refresh flow to get wrong.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = window.Telegram?.WebApp?.initData ?? '';
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `tma ${initData}`,
      ...init.headers,
    },
  });

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body?.message === 'ONBOARDING_REQUIRED') {
      throw new Error('ONBOARDING_REQUIRED');
    }
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
