import { config } from '../config.js';

/**
 * Media storage backed by Telegram.
 *
 * Rather than provisioning object storage, we upload to a private
 * channel through the Bot API and keep the returned file_id. Telegram
 * stores the bytes; we store a reference.
 *
 * Trade-offs, stated plainly:
 *  - Free, no vendor, no credentials beyond a channel id.
 *  - Bot API caps uploads at 50 MB and downloads at 20 MB.
 *  - Download URLs embed the bot token, so they must never reach a
 *    client — everything is served through our own proxy.
 *  - No CDN. Fine at current scale, not at a million users.
 *
 * The `storage` column on `media` exists so swapping to S3/R2 later is a
 * new implementation behind this same interface, not a migration.
 */

const API = () => `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

export interface StoredFile {
  fileId: string;
  thumbId: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  bytes: number | null;
}

interface PhotoSize { file_id: string; width: number; height: number; file_size?: number }

/**
 * Uploads a buffer and returns the reference. `kind` picks the Bot API
 * method: photos get compressed and thumbnailed by Telegram, videos keep
 * duration metadata.
 */
export async function uploadToTelegram(
  buffer: Buffer,
  filename: string,
  mime: string,
  kind: 'image' | 'video',
): Promise<StoredFile> {
  const method = kind === 'image' ? 'sendPhoto' : 'sendVideo';
  const field = kind === 'image' ? 'photo' : 'video';

  const form = new FormData();
  form.append('chat_id', config.TELEGRAM_STORAGE_CHAT_ID);
  form.append(field, new Blob([buffer], { type: mime }), filename);
  form.append('disable_notification', 'true');

  const res = await fetch(`${API()}/${method}`, { method: 'POST', body: form });
  const json = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: {
      photo?: PhotoSize[];
      video?: { file_id: string; width: number; height: number; duration: number; file_size?: number;
                thumbnail?: { file_id: string } };
    };
  };

  if (!json.ok || !json.result) {
    throw new Error(`Telegram upload failed: ${json.description ?? 'unknown'}`);
  }

  if (kind === 'image') {
    const sizes = json.result.photo ?? [];
    if (sizes.length === 0) throw new Error('Telegram returned no photo sizes');
    // Telegram returns ascending sizes; largest last, smallest is the thumb.
    const largest = sizes[sizes.length - 1]!;
    const smallest = sizes[0]!;
    return {
      fileId: largest.file_id,
      thumbId: sizes.length > 1 ? smallest.file_id : null,
      width: largest.width,
      height: largest.height,
      durationMs: null,
      bytes: largest.file_size ?? null,
    };
  }

  const v = json.result.video;
  if (!v) throw new Error('Telegram returned no video');
  return {
    fileId: v.file_id,
    thumbId: v.thumbnail?.file_id ?? null,
    width: v.width,
    height: v.height,
    durationMs: v.duration * 1000,
    bytes: v.file_size ?? null,
  };
}

/**
 * Resolves a file_id to a temporary download URL.
 *
 * Telegram's file paths expire after roughly an hour, so results are
 * cached for well under that. The cache also spares us a getFile round
 * trip on every image in a feed.
 */
const pathCache = new Map<string, { path: string; expires: number }>();
const CACHE_MS = 30 * 60 * 1000;

export async function resolveFileUrl(fileId: string): Promise<string> {
  const hit = pathCache.get(fileId);
  if (hit && hit.expires > Date.now()) {
    return `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${hit.path}`;
  }

  const res = await fetch(`${API()}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = (await res.json()) as {
    ok: boolean; description?: string; result?: { file_path: string };
  };
  if (!json.ok || !json.result) {
    throw new Error(`getFile failed: ${json.description ?? 'unknown'}`);
  }

  // Bound the cache; this is a long-lived process.
  if (pathCache.size > 5000) pathCache.clear();
  pathCache.set(fileId, { path: json.result.file_path, expires: Date.now() + CACHE_MS });

  return `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${json.result.file_path}`;
}
