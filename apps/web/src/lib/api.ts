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

export interface Post {
  id: string;
  body: string | null;
  kind: string;
  place_name: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_name: string;
  author_handle: string | null;
  author_court_value: number;
  author_verified: boolean;
  liked: boolean;
  media: unknown[];
}

export interface Person {
  account_id: string;
  display_name: string;
  handle: string | null;
  bio: string | null;
  age: number | null;
  gender: string | null;
  court_value: number;
  verified: boolean;
  online: boolean;
  interests: string[] | null;
  distance: string | null;
}

export interface RankEntry {
  rank: number;
  account_id: string;
  display_name: string;
  handle: string | null;
  court_value: number;
  verified: boolean;
  score: number;
}

export interface CoinPack {
  id: string;
  stars: number;
  coins: number;
  label: string;
}

export interface WalletState {
  balance: number;
  packs: CoinPack[];
  history: Array<{ delta: number; reason: string; created_at: string }>;
}
