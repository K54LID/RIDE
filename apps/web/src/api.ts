const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

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

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    throw new ApiError(
      res.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? res.statusText,
    );
  }

  return (await res.json()) as T;
}
