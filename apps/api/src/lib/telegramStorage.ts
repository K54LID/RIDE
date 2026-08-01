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
/** Ceilings on outbound calls to Telegram. See the note at the fetch. */
const UPLOAD_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;

export async function uploadToTelegram(
  buffer: Buffer,
  filename: string,
  mime: string,
  kind: 'image' | 'video',
  /** Optional poster frame, used as the document thumbnail for video. */
  poster?: Buffer | null,
): Promise<StoredFile> {
  /**
   * Video goes through sendDocument, not sendVideo.
   *
   * sendVideo hands the file to Telegram's transcoder: it re-encodes,
   * may re-scale, and returns a different file from the one that was
   * uploaded — which is why clips came back with changed dimensions and
   * sizes in the storage channel. sendDocument stores the bytes exactly
   * as given and returns them byte-for-byte on download.
   *
   * Photos still use sendPhoto deliberately: its compression is what
   * gives us the multiple sizes the avatar and grid thumbnails rely on
   * (see the size-picking below), and an original-quality photo is not
   * worth a separate full-size fetch on every tile.
   */
  const method = kind === 'image' ? 'sendPhoto' : 'sendDocument';
  const field = kind === 'image' ? 'photo' : 'document';

  const form = new FormData();
  form.append('chat_id', config.TELEGRAM_STORAGE_CHAT_ID);
  // Buffer is typed Buffer<ArrayBufferLike> under @types/node 22, which the
  // DOM BlobPart union rejects. A Uint8Array view over the same memory is
  // accepted and copies nothing.
  form.append(field, new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  form.append('disable_notification', 'true');
  /**
   * sendDocument does not generate its own thumbnail, so the frame the
   * client captured is attached here. Without it a video stored as a
   * document has no poster at all.
   */
  if (poster && kind === 'video') {
    form.append('thumbnail', new Blob([new Uint8Array(poster)], { type: 'image/jpeg' }),
                'poster.jpg');
  }

  /**
   * A deadline, because without one this request can hang indefinitely.
   * That is not theoretical: `fetch` has no default timeout, so a
   * stalled connection to Telegram left the client's upload XHR open
   * forever, `media.uploading` stuck true, and Publish permanently
   * disabled — a compose sheet that looked frozen until the app was
   * reloaded. Failing at 60s gives the person an error they can retry.
   */
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  const json = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: {
      photo?: PhotoSize[];
      document?: { file_id: string; file_size?: number; mime_type?: string;
                   thumbnail?: { file_id: string; width?: number; height?: number };
                   thumb?: { file_id: string; width?: number; height?: number } };
      video?: { file_id: string; width: number; height: number; duration: number; file_size?: number;
                /**
                 * Bot API 7.0 renamed `thumb` to `thumbnail`. Which one
                 * comes back depends on the Telegram server answering,
                 * and reading only the new name silently produced a
                 * null thumb — which is exactly how a video ends up
                 * with no poster in the feed. Accept both.
                 */
                thumbnail?: { file_id: string };
                thumb?: { file_id: string } };
    };
  };

  if (!json.ok || !json.result) {
    throw new Error(`Telegram upload failed: ${json.description ?? 'unknown'}`);
  }

  if (kind === 'image') {
    const sizes = json.result.photo ?? [];
    if (sizes.length === 0) throw new Error('Telegram returned no photo sizes');
    // Telegram returns ascending sizes — typically 90, 320, 800, 1280.
    const largest = sizes[sizes.length - 1]!;
    /**
     * The thumb used to be sizes[0], i.e. the ~90px preview. Every
     * avatar, every discover tile and every photo-strip cell asks for
     * ?thumb=1, so a 90px image was being upscaled into a 56–64px slot
     * on a 3x display — which is exactly why photos looked soft
     * everywhere. Pick the smallest size that is still big enough to
     * render sharp (>= 640px on its long edge), and fall back to the
     * largest available rather than to the tiny one.
     */
    const MIN_THUMB_EDGE = 640;
    const thumb = sizes.find((s) => Math.max(s.width, s.height) >= MIN_THUMB_EDGE) ?? largest;
    return {
      fileId: largest.file_id,
      thumbId: thumb.file_id === largest.file_id ? null : thumb.file_id,
      width: largest.width,
      height: largest.height,
      durationMs: null,
      bytes: largest.file_size ?? null,
    };
  }

  // sendDocument answers with `document`; sendVideo (older rows, and
  // any client still using it) answers with `video`. Accept either.
  const d = json.result.document;
  if (d) {
    return {
      fileId: d.file_id,
      thumbId: d.thumbnail?.file_id ?? d.thumb?.file_id ?? null,
      // A document carries no dimensions. The client already knows them
      // and the player reads them from the file itself.
      width: d.thumbnail?.width ?? 0,
      height: d.thumbnail?.height ?? 0,
      durationMs: null,
      bytes: d.file_size ?? null,
    };
  }

  const v = json.result.video;
  if (!v) throw new Error('Telegram returned no video');
  return {
    fileId: v.file_id,
    thumbId: v.thumbnail?.file_id ?? v.thumb?.file_id ?? null,
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

  const res = await fetch(`${API()}/getFile?file_id=${encodeURIComponent(fileId)}`,
                          { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

/**
 * Step-by-step storage diagnostic for the admin panel.
 *
 * "Uploads don't work" has four distinct causes with identical symptoms:
 * bad token, wrong chat id, bot not admin of the channel, or Telegram
 * refusing the file. This runs each step and reports the exact failure,
 * so the fix is readable instead of guessed.
 */
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface StorageCheckStep {
  step: string;
  ok: boolean;
  detail: string;
}

export async function diagnoseStorage(): Promise<StorageCheckStep[]> {
  const steps: StorageCheckStep[] = [];
  const call = async (method: string, body?: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`${API()}/${method}`, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : undefined);
    return (await res.json()) as Record<string, unknown>;
  };

  try {
    const me = await call('getMe');
    steps.push(me.ok
      ? { step: 'bot token', ok: true, detail: `@${(me.result as { username?: string })?.username ?? '?'}` }
      : { step: 'bot token', ok: false, detail: String(me.description ?? 'getMe failed') });
    if (!me.ok) return steps;

    const rawEnv = process.env.TELEGRAM_STORAGE_CHAT_ID ?? '';
    const chat = await call('getChat', { chat_id: config.TELEGRAM_STORAGE_CHAT_ID });
    steps.push(chat.ok
      ? { step: 'storage channel', ok: true, detail: (chat.result as { title?: string })?.title ?? 'found' }
      : { step: 'storage channel', ok: false,
          detail: `${String(chat.description ?? '')} | env raw: ${JSON.stringify(rawEnv)} `
                + `| sent: ${config.TELEGRAM_STORAGE_CHAT_ID} `
                + `| If "sent" looks right, the bot is not an administrator of that channel.` });
    if (!chat.ok) return steps;

    try {
      const up = await uploadToTelegram(TEST_PNG, 'storage-check.png', 'image/png', 'image');
      steps.push({ step: 'test upload', ok: true, detail: `file_id ${up.fileId.slice(0, 18)}…` });
      await resolveFileUrl(up.fileId);
      steps.push({ step: 'download url', ok: true, detail: 'resolves' });
    } catch (err) {
      steps.push({ step: 'test upload', ok: false,
        detail: err instanceof Error
          ? `${err.message} — if this mentions rights, promote the bot to admin of the channel`
          : 'failed' });
    }
  } catch (err) {
    steps.push({ step: 'network', ok: false,
      detail: err instanceof Error ? err.message : 'unreachable' });
  }
  return steps;
}
