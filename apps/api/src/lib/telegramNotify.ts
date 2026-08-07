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
  support_message: 'woofs',
  support_handled: 'woofs',
};

/**
 * Kinds that ignore the recipient's notification preferences.
 *
 * These are operational, not social: a moderator who muted "woofs"
 * would otherwise silently stop receiving verification requests and
 * support messages, and nobody would find out until a queue had been
 * sitting unread for a week. They only ever go to staff, and staff
 * asked for the job.
 */
// A person who wrote in is waiting on an answer; that push is the
// answer, so it is never subject to notification preferences.
const ALWAYS_DELIVER = new Set([
  'support_message', 'verification_request', 'support_handled',
]);

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
/**
 * Verb phrases per notification kind, in every language the app ships.
 *
 * Kept as one table rather than inline per case: a push that arrives in
 * English to someone who chose Persian is the most visible way the
 * language setting can look broken, and a table makes a missing
 * language obvious at a glance instead of hiding in a switch.
 */
const VERBS: Record<string, Record<string, string>> = {
  woof:        { en: 'woofed you on RIDE', ru: 'отправил вам вуф в RIDE', tr: "sana RIDE'da woof gönderdi", az: "sənə RIDE-da woof göndərdi", ar: 'أرسل لك ووف في RIDE', fa: 'در RIDE به شما ووف داد', es: 'te ha enviado un woof en RIDE', de: 'hat dir auf RIDE ein Woof geschickt', fr: "t'a envoyé un woof sur RIDE", it: 'ti ha mandato un woof su RIDE', pt: 'mandou um woof pra você no RIDE' },
  gift:        { en: 'sent you a gift on RIDE', ru: 'отправил вам подарок в RIDE', tr: "sana RIDE'da hediye gönderdi", az: 'sənə RIDE-da hədiyyə göndərdi', ar: 'أرسل لك هدية في RIDE', fa: 'در RIDE برای شما هدیه فرستاد', es: 'te ha enviado un regalo en RIDE', de: 'hat dir auf RIDE ein Geschenk geschickt', fr: "t'a envoyé un cadeau sur RIDE", it: 'ti ha mandato un regalo su RIDE', pt: 'enviou um presente pra você no RIDE' },
  follow:      { en: 'started following you on RIDE', ru: 'подписался на вас в RIDE', tr: "seni RIDE'da takip etmeye başladı", az: 'səni RIDE-da izləməyə başladı', ar: 'بدأ يتابعك في RIDE', fa: 'در RIDE شما را دنبال کرد', es: 'ha empezado a seguirte en RIDE', de: 'folgt dir jetzt auf RIDE', fr: "s'est abonné à toi sur RIDE", it: 'ha iniziato a seguirti su RIDE', pt: 'começou a seguir você no RIDE' },
  like:        { en: 'liked your post on RIDE', ru: 'оценил ваш пост в RIDE', tr: "RIDE'da gönderini beğendi", az: 'RIDE-da paylaşımını bəyəndi', ar: 'أعجب بمنشورك في RIDE', fa: 'پست شما را در RIDE پسندید', es: 'le ha gustado tu publicación en RIDE', de: 'gefällt dein Beitrag auf RIDE', fr: "a aimé ta publication sur RIDE", it: 'ha messo mi piace al tuo post su RIDE', pt: 'curtiu sua publicação no RIDE' },
  comment:     { en: 'commented on your post on RIDE', ru: 'прокомментировал ваш пост в RIDE', tr: "RIDE'da gönderine yorum yaptı", az: 'RIDE-da paylaşımına şərh yazdı', ar: 'علّق على منشورك في RIDE', fa: 'روی پست شما در RIDE نظر داد', es: 'ha comentado tu publicación en RIDE', de: 'hat deinen Beitrag auf RIDE kommentiert', fr: 'a commenté ta publication sur RIDE', it: 'ha commentato il tuo post su RIDE', pt: 'comentou sua publicação no RIDE' },
  story_reply: { en: 'replied to your story on RIDE', ru: 'ответил на вашу историю в RIDE', tr: "RIDE'da hikâyene yanıt verdi", az: 'RIDE-da hekayənə cavab verdi', ar: 'رد على قصتك في RIDE', fa: 'به استوری شما در RIDE پاسخ داد', es: 'ha respondido a tu historia en RIDE', de: 'hat auf deine Story auf RIDE geantwortet', fr: 'a répondu à ta story sur RIDE', it: 'ha risposto alla tua storia su RIDE', pt: 'respondeu ao seu story no RIDE' },
  message:     { en: 'sent you a message on RIDE', ru: 'написал вам в RIDE', tr: "sana RIDE'da mesaj gönderdi", az: 'sənə RIDE-da mesaj yazdı', ar: 'أرسل لك رسالة في RIDE', fa: 'در RIDE به شما پیام داد', es: 'te ha enviado un mensaje en RIDE', de: 'hat dir auf RIDE geschrieben', fr: "t'a envoyé un message sur RIDE", it: 'ti ha scritto su RIDE', pt: 'mandou uma mensagem pra você no RIDE' },
  friend_request:  { en: 'wants to be friends on RIDE', ru: 'хочет добавить вас в друзья в RIDE', tr: "RIDE'da arkadaş olmak istiyor", az: 'RIDE-da dost olmaq istəyir', ar: 'يريد أن يكون صديقك في RIDE', fa: 'می‌خواهد در RIDE با شما دوست شود', es: 'quiere ser tu amigo en RIDE', de: 'möchte auf RIDE mit dir befreundet sein', fr: 'veut être ton ami sur RIDE', it: 'vuole essere tuo amico su RIDE', pt: 'quer ser seu amigo no RIDE' },
  friend_accepted: { en: 'accepted your friend request on RIDE', ru: 'принял вашу заявку в друзья в RIDE', tr: "RIDE'da arkadaşlık isteğini kabul etti", az: 'RIDE-da dostluq istəyini qəbul etdi', ar: 'قبل طلب صداقتك في RIDE', fa: 'درخواست دوستی شما را در RIDE پذیرفت', es: 'ha aceptado tu solicitud de amistad en RIDE', de: 'hat deine Freundschaftsanfrage auf RIDE angenommen', fr: 'a accepté ta demande d’ami sur RIDE', it: 'ha accettato la tua richiesta di amicizia su RIDE', pt: 'aceitou seu pedido de amizade no RIDE' },
  referral:        { en: 'joined RIDE with your code', ru: 'присоединился к RIDE по вашему коду', tr: "senin kodunla RIDE'a katıldı", az: 'sənin kodunla RIDE-a qoşuldu', ar: 'انضم إلى RIDE برمزك', fa: 'با کد شما به RIDE پیوست', es: 'se ha unido a RIDE con tu código', de: 'ist mit deinem Code zu RIDE gekommen', fr: 'a rejoint RIDE avec ton code', it: 'si è unito a RIDE con il tuo codice', pt: 'entrou no RIDE com o seu código' },
  verified_ok:     { en: '✅ Your profile is verified', ru: '✅ Ваш профиль подтверждён', tr: '✅ Profilin doğrulandı', az: '✅ Profilin təsdiqləndi', ar: '✅ تم توثيق ملفك', fa: '✅ پروفایل شما تأیید شد', es: '✅ Tu perfil está verificado', de: '✅ Dein Profil ist verifiziert', fr: '✅ Ton profil est vérifié', it: '✅ Il tuo profilo è verificato', pt: '✅ Seu perfil foi verificado' },
  verified_no:     { en: 'Your verification request was not approved', ru: 'Ваша заявка на подтверждение отклонена', tr: 'Doğrulama isteğin onaylanmadı', az: 'Təsdiq sorğun qəbul edilmədi', ar: 'لم تتم الموافقة على طلب التوثيق', fa: 'درخواست تأیید شما پذیرفته نشد', es: 'Tu solicitud de verificación no fue aprobada', de: 'Deine Verifizierungsanfrage wurde nicht genehmigt', fr: "Ta demande de vérification n'a pas été approuvée", it: 'La tua richiesta di verifica non è stata approvata', pt: 'Seu pedido de verificação não foi aprovado' },
  achievement:     { en: '🏆 You unlocked a new award on RIDE', ru: '🏆 Вы открыли новую награду в RIDE', tr: "🏆 RIDE'da yeni bir ödül kazandın", az: '🏆 RIDE-da yeni mükafat qazandın', ar: '🏆 حصلت على جائزة جديدة في RIDE', fa: '🏆 در RIDE جایزه تازه‌ای گرفتید', es: '🏆 Has desbloqueado un logro en RIDE', de: '🏆 Du hast auf RIDE eine neue Auszeichnung freigeschaltet', fr: '🏆 Tu as débloqué une récompense sur RIDE', it: '🏆 Hai sbloccato un premio su RIDE', pt: '🏆 Você desbloqueou uma conquista no RIDE' },
  featured:        { en: '⭐ You are featured on RIDE right now', ru: '⭐ Вы сейчас в подборке RIDE', tr: '⭐ Şu anda RIDE\'da öne çıkıyorsun', az: '⭐ Hazırda RIDE-da öne çıxırsan', ar: '⭐ أنت مميّز في RIDE الآن', fa: '⭐ همین حالا در RIDE ویژه هستید', es: '⭐ Ahora mismo estás destacado en RIDE', de: '⭐ Du bist gerade auf RIDE hervorgehoben', fr: '⭐ Tu es mis en avant sur RIDE en ce moment', it: '⭐ In questo momento sei in evidenza su RIDE', pt: '⭐ Você está em destaque no RIDE agora' },
  generic:         { en: 'You have a new notification on RIDE', ru: 'У вас новое уведомление в RIDE', tr: "RIDE'da yeni bir bildirimin var", az: 'RIDE-da yeni bildirişin var', ar: 'لديك إشعار جديد في RIDE', fa: 'شما در RIDE اعلان تازه‌ای دارید', es: 'Tienes una notificación nueva en RIDE', de: 'Du hast eine neue Benachrichtigung auf RIDE', fr: 'Tu as une nouvelle notification sur RIDE', it: 'Hai una nuova notifica su RIDE', pt: 'Você tem uma nova notificação no RIDE' },
  court_head:      { en: 'courted you', ru: 'поухаживал за вами', tr: 'sana kur yaptı', az: 'sənə dərgah qurdu', ar: 'تودد إليك', fa: 'به شما دربار کرد', es: 'te ha cortejado', de: 'hat dich umworben', fr: 't’a fait la cour', it: 'ti ha corteggiato', pt: 'cortejou você' },
};

/** Sentence fragments that need a number interpolated. */
const PHRASES: Record<string, Record<string, (n: number) => string>> = {
  court_value: {
    en: (n) => ` — your value is now ${n} coins`, ru: (n) => ` — ваша ценность теперь ${n} монет`,
    tr: (n) => ` — değerin şimdi ${n} coin`, az: (n) => ` — dəyərin indi ${n} coin`,
    ar: (n) => ` — قيمتك الآن ${n} عملة`, fa: (n) => ` — ارزش شما اکنون ${n} سکه است`,
    es: (n) => ` — tu valor ahora es ${n} monedas`, de: (n) => ` — dein Wert ist jetzt ${n} Coins`,
    fr: (n) => ` — ta valeur est maintenant de ${n} pièces`,
    it: (n) => ` — il tuo valore ora è ${n} monete`, pt: (n) => ` — seu valor agora é ${n} moedas`,
  },
  court_share: {
    en: (n) => ` and ${n} coins went to your balance`, ru: (n) => ` и ${n} монет зачислено на ваш баланс`,
    tr: (n) => ` ve bakiyene ${n} coin eklendi`, az: (n) => ` və balansına ${n} coin əlavə olundu`,
    ar: (n) => ` وأُضيفت ${n} عملة إلى رصيدك`, fa: (n) => ` و ${n} سکه به موجودی شما اضافه شد`,
    es: (n) => ` y ${n} monedas fueron a tu saldo`, de: (n) => ` und ${n} Coins gingen auf dein Guthaben`,
    fr: (n) => ` et ${n} pièces ont été créditées sur ton solde`,
    it: (n) => ` e ${n} monete sono andate sul tuo saldo`, pt: (n) => ` e ${n} moedas foram para o seu saldo`,
  },
};

const SUPPORT_HANDLED: Record<string, string> = {
  en: '✅ Thanks for reaching out — your message has been handled.',
  ru: '✅ Спасибо за обращение — ваше сообщение обработано.',
  tr: '✅ Bize yazdığın için teşekkürler — mesajın ele alındı.',
  az: '✅ Bizə yazdığın üçün təşəkkürlər — mesajın həll olundu.',
  ar: '✅ شكرًا لتواصلك — تمت معالجة رسالتك.',
  fa: '✅ ممنون که تماس گرفتید — پیام شما رسیدگی شد.',
  es: '✅ Gracias por escribirnos: tu mensaje ha sido atendido.',
  de: '✅ Danke für deine Nachricht — sie wurde bearbeitet.',
  fr: '✅ Merci de nous avoir écrit — ton message a été traité.',
  it: '✅ Grazie per averci scritto: il tuo messaggio è stato gestito.',
  pt: '✅ Obrigado por entrar em contato — sua mensagem foi resolvida.',
};

function compose(kind: string, actor: string, lang: string, payload: Record<string, unknown>): string {
  const L = (en: string, ru: string, tr: string) =>
    lang === 'ru' ? ru : lang === 'tr' ? tr : en;
  /** Verb for this kind in the person's language, English as fallback. */
  const V = (k: string) => VERBS[k]?.[lang] ?? VERBS[k]?.en ?? '';

  switch (kind) {
    case 'woof':
      return `🐾 ${actor} ${V('woof')}`;
    case 'gift':
      return `🎁 ${actor} ${V('gift')}`;
    case 'court': {
      /**
       * Every part of this is conditional, because a missing number
       * must produce a shorter sentence rather than the word
       * "undefined" in a push notification. `value_after` has been in
       * the payload since courting shipped, but a notification written
       * by an older build still has to read correctly today.
       */
      const v = typeof payload.value_after === 'number' ? payload.value_after : null;
      const paid = typeof payload.payout === 'number' ? payload.payout : null;
      const head = `👑 ${actor} ${V('court_head')}`;
      const P = (k: string, n: number) =>
        (PHRASES[k]?.[lang] ?? PHRASES[k]?.en!)(n);
      const value = v === null ? '' : P('court_value', v);
      const share = paid === null || paid <= 0 ? '' : P('court_share', paid);
      return `${head}${value}${share}`;
    }
    case 'support_handled': {
      const reply = typeof payload.reply === 'string' && payload.reply.trim() ? payload.reply.trim() : null;
      const head = SUPPORT_HANDLED[lang] ?? SUPPORT_HANDLED.en!;
      return reply ? `${head}\n\n${reply}` : head;
    }
    case 'support_message': {
      const which = payload.support_kind === 'bug' ? 'Bug report' : 'Support message';
      const who = typeof payload.handle === 'string' && payload.handle
        ? `@${payload.handle}`
        : (typeof payload.name === 'string' && payload.name ? payload.name : actor);
      const body = typeof payload.excerpt === 'string' ? payload.excerpt : '';
      // Staff-facing, so English only: this is an operational message,
      // not something a member ever receives.
      return `🛠 ${which} from ${who}:\n\n${body}\n\nReview it in the admin panel.`;
    }
    case 'follow':
      return `👤 ${actor} ${V('follow')}`;
    case 'friend_request':
      return `🤝 ${actor} ${V('friend_request')}`;
    case 'friend_accepted':
      return `🤝 ${actor} ${V('friend_accepted')}`;
    case 'comment':
      return `💬 ${actor} ${V('comment')}`;
    case 'message':
      return `✉️ ${actor} ${V('message')}`;
    case 'story_reply':
      return `↩️ ${actor} ${V('story_reply')}`;
    case 'referral':
      return `🎉 ${actor} ${V('referral')}`;
    case 'verification':
      return payload.approved
        ? V('verified_ok')
        : V('verified_no');
    case 'verification_request':
      return L(`🔎 ${actor} requested verification — review it in the admin panel`,
               `🔎 ${actor} запросил верификацию — проверьте в админ-панели`,
               `🔎 ${actor} doğrulama talep etti — yönetim panelinden incele`);
    case 'achievement':
      return V('achievement');
    case 'featured':
      return V('featured');
    default:
      return V('generic');
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
           COALESCE(bp.locale, ti.language_code) AS language_code,
           p.display_name AS actor_name,
           st.notifications
    FROM notifications n
    JOIN telegram_identities ti ON ti.account_id = n.account_id
    -- The language they picked in the bot chat beats the phone hint.
    LEFT JOIN bot_preferences bp ON bp.telegram_id = ti.telegram_id
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
    const enabled = ALWAYS_DELIVER.has(row.kind)
      || (prefs.all !== false && prefs[key] !== false);

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
