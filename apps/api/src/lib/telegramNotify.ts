import { sql } from './db.js';
import { config } from '../config.js';

/**
 * Telegram push delivery.
 *
 * An outbox worker rather than an inline send. Three reasons:
 *
 *  - notify() runs inside the transaction that caused the event. A
 *    network call there would hold a database transaction open for the
 *    length of an HTTP round trip, and would fire a push for work that
 *    later rolled back.
 *  - Telegram rate-limits aggressively (~30 messages/second overall).
 *    A queue lets us pace; inline sends cannot.
 *  - If Telegram is down, messages are delayed rather than lost, and
 *    the user action that triggered them still succeeds.
 */

const API = () => `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;
const BATCH = 40;
const INTERVAL_MS = 8000;
const MAX_AGE_HOURS = 6;   // older than this, don't bother — it's stale

/** Maps a notification kind to the settings key that gates it. */
const SETTING_FOR_KIND: Record<string, string> = {
  woof: 'woofs',
  gift: 'gifts',
  court: 'woofs',
  follow: 'woofs',
  friend_request: 'woofs',
  friend_accepted: 'woofs',
  comment: 'comments',
  post_like: 'comments',
  message: 'chats',
  story_reply: 'stories',
  achievement: 'woofs',
  referral: 'woofs',
  featured: 'woofs',
  verification: 'woofs',
  verification_request: 'woofs',
};

interface PendingRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  telegram_id: string;
  language_code: string | null;
  actor_name: string | null;
  notifications: Record<string, boolean> | null;
}

/**
 * Message text per kind, per language. Only the languages the app
 * supports; anything else falls back to English. Kept deliberately
 * short — these arrive as phone notifications, not emails.
 */
function compose(kind: string, actor: string, lang: string, payload: Record<string, unknown>): string {
  const L = (en: string, ru: string, tr: string) =>
    lang === 'ru' ? ru : lang === 'tr' ? tr : en;

  switch (kind) {
    case 'woof':
      return L(`🐾 ${actor} woofed you on RIDE`,
               `🐾 ${actor} отправил вам вуф в RIDE`,
               `🐾 ${actor} sana RIDE'da woof gönderdi`);
    case 'gift':
      return L(`🎁 ${actor} sent you a gift`,
               `🎁 ${actor} отправил вам подарок`,
               `🎁 ${actor} sana bir hediye gönderdi`);
    case 'court': {
      const v = payload.value_after;
      return L(`♛ ${actor} courted you — your value is now ${v}`,
               `♛ ${actor} поухаживал за вами — ваша ценность теперь ${v}`,
               `♛ ${actor} sana kur yaptı — değerin şimdi ${v}`);
    }
    case 'follow':
      return L(`👤 ${actor} started following you`,
               `👤 ${actor} подписался на вас`,
               `👤 ${actor} seni takip etmeye başladı`);
    case 'friend_request':
      return L(`🤝 ${actor} sent you a friend request`,
               `🤝 ${actor} отправил заявку в друзья`,
               `🤝 ${actor} sana arkadaşlık isteği gönderdi`);
    case 'friend_accepted':
      return L(`🤝 ${actor} accepted your friend request`,
               `🤝 ${actor} принял вашу заявку в друзья`,
               `🤝 ${actor} arkadaşlık isteğini kabul etti`);
    case 'comment':
      return L(`💬 ${actor} commented on your post`,
               `💬 ${actor} прокомментировал ваш пост`,
               `💬 ${actor} gönderine yorum yaptı`);
    case 'message':
      return L(`✉️ New message from ${actor}`,
               `✉️ Новое сообщение от ${actor}`,
               `✉️ ${actor} kişisinden yeni mesaj`);
    case 'story_reply':
      return L(`💬 ${actor} replied to your story`,
               `💬 ${actor} ответил на вашу историю`,
               `💬 ${actor} hikâyene yanıt verdi`);
    case 'referral':
      return L(`🎟️ ${actor} joined with your invite code`,
               `🎟️ ${actor} присоединился по вашему коду`,
               `🎟️ ${actor} davet kodunla katıldı`);
    case 'verification':
      return payload.approved
        ? L('✅ Your profile is verified', '✅ Ваш профиль подтверждён', '✅ Profilin doğrulandı')
        : L('Your verification request was not approved',
            'Заявка на верификацию отклонена',
            'Doğrulama talebin onaylanmadı');
    case 'verification_request':
      return L(`🔎 ${actor} requested verification — review it in the admin panel`,
               `🔎 ${actor} запросил верификацию — проверьте в админ-панели`,
               `🔎 ${actor} doğrulama talep etti — yönetim panelinden incele`);
    case 'achievement':
      return L('🏆 You unlocked a new award on RIDE',
               '🏆 Вы получили новую награду в RIDE',
               "🏆 RIDE'da yeni bir ödül kazandın");
    case 'featured':
      return L('⭐ You are featured on RIDE right now',
               '⭐ Вы сейчас в избранных RIDE',
               '⭐ Şu anda RIDE\'da öne çıkıyorsun');
    default:
      return L('You have a new notification on RIDE',
               'У вас новое уведомление в RIDE',
               "RIDE'da yeni bir bildirimin var");
  }
}

async function send(telegramId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${API()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        // web_app opens the Mini App inside Telegram. A plain `url`
        // would kick the user out to a browser, losing their session
        // and the whole point of a Mini App.
        reply_markup: {
          inline_keyboard: [[{
            text: 'Open RIDE',
            web_app: { url: config.MINI_APP_URL },
          }]],
        },
      }),
    });
    const json = (await res.json()) as { ok: boolean; error_code?: number };
    // 403 = user blocked the bot. Treat as delivered so we stop retrying.
    return json.ok || json.error_code === 403;
  } catch {
    return false;
  }
}

/** One pass of the outbox. Exported so it can be triggered in tests. */
export async function deliverPending(): Promise<number> {
  const rows = await sql<PendingRow[]>`
    SELECT n.id::text AS id, n.kind, n.payload,
           ti.telegram_id::text AS telegram_id,
           ti.language_code,
           p.display_name AS actor_name,
           st.notifications
    FROM notifications n
    JOIN telegram_identities ti ON ti.account_id = n.account_id
    JOIN accounts a            ON a.id = n.account_id AND a.status = 'active'
    LEFT JOIN profiles p       ON p.account_id = n.actor_id
    LEFT JOIN user_settings st ON st.account_id = n.account_id
    WHERE n.pushed_at IS NULL
      AND n.created_at > now() - ${`${MAX_AGE_HOURS} hours`}::interval
    ORDER BY n.id
    LIMIT ${BATCH}
  `;

  if (rows.length === 0) return 0;

  const delivered: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const prefs = row.notifications ?? {};
    const key = SETTING_FOR_KIND[row.kind] ?? 'woofs';
    // `all` is the master switch; per-kind keys refine it. Undefined
    // means "not configured", which we treat as enabled.
    const enabled = prefs.all !== false && prefs[key] !== false;

    if (!enabled) { skipped.push(row.id); continue; }

    const text = compose(row.kind, row.actor_name ?? 'Someone',
                         (row.language_code ?? 'en').split('-')[0]!, row.payload ?? {});
    if (await send(row.telegram_id, text)) delivered.push(row.id);
  }

  const done = [...delivered, ...skipped];
  if (done.length > 0) {
    await sql`
      UPDATE notifications SET pushed_at = now() WHERE id = ANY(${done}::bigint[])
    `;
  }
  return delivered.length;
}

let timer: NodeJS.Timeout | null = null;

export function startNotificationWorker(log: (m: string) => void = console.log): void {
  if (timer) return;
  log(`Notification worker started (every ${INTERVAL_MS / 1000}s)`);
  timer = setInterval(() => {
    deliverPending().catch((err) => {
      log(`notification worker error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, INTERVAL_MS);
  // Never hold the process open on shutdown.
  timer.unref();
}

export function stopNotificationWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
