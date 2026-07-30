import { tg } from './tg';

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
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `tma ${tg.initData()}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No connection');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    throw new ApiError(res.status, body?.code ?? 'UNKNOWN', body?.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Me {
  display_name: string;
  handle: string | null;
  bio: string | null;
  court_value: number;
  gender: string | null;
  pronouns: string | null;
  orientation: string | null;
  relationship_status: string | null;
  body_type: string | null;
  looking_for: string[] | null;
  interests: string[] | null;
  languages: string[] | null;
  tribes: string[] | null;
  height_cm: number | null;
  weight_kg: number | null;
  birth_date: string;
  verification: 'none' | 'pending' | 'approved' | 'rejected';
  vip_until: string | null;
  coin_balance: number;
  woofs_received: number;
  followers: number;
  following: number;
  gifts_received: number;
}
