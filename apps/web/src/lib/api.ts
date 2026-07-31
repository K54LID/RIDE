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
    // Content-Type is only declared when a body is actually sent.
    // Bodyless DELETEs and POSTs used to carry the JSON header anyway,
    // and Fastify (correctly) rejects "application/json with an empty
    // body" as a 400 — which is why every delete button appeared to
    // fail and deleted posts "came back" after the error-path refetch.
    const headers: Record<string, string> = {
      Authorization: `tma ${tg.initData()}`,
      ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    res = await fetch(`${BASE}${path}`, { ...init, headers });
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
  account_id: string;
  display_name: string;
  handle: string;
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
  avatar_media_id: string | null;
}

export interface Post {
  id: string;
  author_id: string;
  body: string | null;
  kind: string;
  place_name: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_name: string;
  author_handle: string;
  author_court_value: number;
  author_verified: boolean;
  author_avatar_media_id: string | null;
  liked: boolean;
  saved: boolean;
  edited?: boolean;
  media: Array<{ id: string; kind: string; url: string }>;
}

export interface Person {
  account_id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  age: number | null;
  gender: string | null;
  court_value: number;
  verified: boolean;
  online: boolean;
  interests: string[] | null;
  distance: string | null;
  avatar_media_id: string | null;
}

export interface RankEntry {
  rank: number;
  account_id: string;
  display_name: string;
  handle: string;
  court_value: number;
  verified: boolean;
  score: number;
  avatar_media_id: string | null;
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

export interface Gift {
  id: string; slug: string; name: string; category: string;
  rarity: 'common' | 'rare' | 'premium' | 'limited' | 'unique';
  coin_cost: number; asset_key: string;
  total_supply: number | null; available_to: string | null;
}

export interface OwnedGift {
  slug: string; name: string; asset_key: string; rarity: string;
  quantity: number; last_at: string;
}

export interface NotificationItem {
  id: string; kind: string; payload: Record<string, unknown>;
  read_at: string | null; created_at: string;
  actor_id: string | null;
  actor_name: string | null; actor_handle: string | null; actor_verified: boolean;
  post_id: string | null; post_excerpt: string | null; post_media_id: string | null;
}

export interface DailyState {
  streak: number; claimed_today: boolean; next_reward: number;
}

export interface ReferralState {
  code: string; reward: number; invited: number; earned: number;
}

export interface StoryAuthor {
  author_id: string; display_name: string; handle: string;
  story_count: number; unseen_count: number; latest_at: string;
  avatar_media_id: string | null;
}

export interface Story {
  id: string; kind: 'image' | 'video'; media_id: string; created_at: string;
  seen: boolean; view_count: number; reaction_count: number; reply_count: number;
}

export interface ChatSummary {
  id: string; last_message_at: string; pinned: boolean;
  peer_id: string; peer_name: string; peer_handle: string;
  peer_verified: boolean; peer_avatar_media_id: string | null;
  peer_online: boolean | null; peer_last_seen: string | null;
  last_body: string | null; last_kind: string | null;
  last_sender_id: string | null; last_deleted: boolean;
  unread: number;
}

export interface ChatMessage {
  id: number; sender_id: string; kind: string; body: string | null;
  media_id: string | null; reply_to_id: number | null;
  edited_at: string | null; deleted_at: string | null; created_at: string;
  reply_body: string | null; reply_author: string | null;
  reactions: Record<string, number> | null; my_reaction: string | null;
  story_id: string | null; story_media_id: string | null; story_alive: boolean | null;
}

export interface ProfilePhoto {
  id: string; media_id: string; position: number; is_private: boolean;
}

export interface Comment {
  id: string; body: string; created_at: string; author_id: string;
  author_name: string; author_handle: string; author_verified: boolean;
  author_avatar_media_id: string | null;
}

export interface PublicUser {
  account_id: string; display_name: string; handle: string;
  bio: string | null; court_value: number;
  gender: string | null; pronouns: string | null; orientation: string | null;
  relationship_status: string | null;
  looking_for: string[] | null; interests: string[] | null;
  languages: string[] | null; tribes: string[] | null;
  height_cm: number | null; weight_kg: number | null;
  verified: boolean; vip: boolean; age: number | null;
  online: boolean | null;
  woofs_received: number; followers: number; gifts_received: number;
  i_follow: boolean; woofed_today: boolean; i_blocked: boolean;
}

export interface AlbumGrant {
  viewer_id: string; granted_at: string;
  display_name: string; handle: string;
  avatar_media_id: string | null;
}

export interface FollowPerson {
  account_id: string;
  display_name: string;
  handle: string;
  verified: boolean;
  avatar_media_id: string | null;
  i_follow: boolean;
}

export interface RankEntryMini {
  board: 'court' | 'woofs' | 'likes' | 'gifts' | 'followers';
  rank: number;
  score: number;
}

export interface CourtInfo {
  court_value: number;
  next_cost: number;
  courter: {
    account_id: string; display_name: string | null; handle: string;
    at: string; expires_at: string | null; avatar_media_id: string | null;
  } | null;
}
