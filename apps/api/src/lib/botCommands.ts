import { config } from '../config.js';
import { sql } from './db.js';
import { snapToGrid } from './geo.js';

/**
 * Bot chat commands.
 *
 * The bot is not a chat interface for RIDE — everything happens in the
 * Mini App. Its job is to explain what this is to someone who arrived
 * from a link, and give them one button that opens it. So /start is
 * short: what it is, what you can do, one button.
 */

const API = () => `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

const WELCOME: Record<string, string> = {
  en: [
    '*Welcome to RIDE* 🏳️‍🌈',
    '',
    'RIDE is a social space to meet people nearby, share moments, and be seen.',
    '',
    '• *Discover* — find people around you, filtered how you like',
    '• *Stories & posts* — share photos and video that disappear or stay',
    '• *Woof, gift, court* — say something without saying anything',
    '• *Chat* — private messages, photos and reactions',
    '• *Ranks & awards* — climb the leaderboards, unlock badges',
    '',
    'You must be 18 or older to use RIDE.',
    '',
    'Tap below to open the app.',
  ].join('\n'),
  ru: [
    '*Добро пожаловать в RIDE* 🏳️‍🌈',
    '',
    'RIDE — это пространство, чтобы знакомиться с людьми рядом, делиться моментами и быть замеченным.',
    '',
    '• *Поиск* — люди поблизости с нужными фильтрами',
    '• *Истории и посты* — фото и видео, временные или навсегда',
    '• *Вуф, подарок, ухаживание* — сказать, не говоря',
    '• *Чаты* — личные сообщения, фото и реакции',
    '• *Рейтинг и награды* — поднимайтесь в таблице, открывайте значки',
    '',
    'Пользоваться RIDE можно с 18 лет.',
    '',
    'Нажмите кнопку ниже, чтобы открыть приложение.',
  ].join('\n'),
  tr: [
    "*RIDE'a hoş geldin* 🏳️‍🌈",
    '',
    'RIDE; yakınındaki insanlarla tanışmak, anlarını paylaşmak ve görünür olmak için bir sosyal alan.',
    '',
    '• *Keşfet* — çevrendeki insanlar, istediğin filtrelerle',
    '• *Hikâyeler ve gönderiler* — kaybolan ya da kalan foto ve video',
    '• *Woof, hediye, kur* — konuşmadan bir şey söyle',
    '• *Sohbet* — özel mesaj, fotoğraf ve tepkiler',
    '• *Sıralama ve ödüller* — listelerde yüksel, rozet kazan',
    '',
    "RIDE'ı kullanmak için 18 yaşından büyük olmalısın.",
    '',
    'Uygulamayı açmak için aşağıdaki düğmeye dokun.',
  ].join('\n'),
};

const OPEN_LABEL: Record<string, string> = { en: 'Open RIDE', ru: 'Открыть RIDE', tr: "RIDE'ı aç" };

export async function handleBotCommand(
  chatId: number | string,
  text: string,
  languageCode: string | null,
): Promise<boolean> {
  const command = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (command !== '/start' && command !== '/help' && command !== '/app') return false;

  const lang = (languageCode ?? 'en').split('-')[0]!;
  const body = WELCOME[lang] ?? WELCOME.en!;
  const label = OPEN_LABEL[lang] ?? OPEN_LABEL.en!;

  await fetch(`${API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: body,
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[{ text: label, web_app: { url: config.MINI_APP_URL } }]],
      },
    }),
  }).catch(() => undefined);

  // Follow up with the location offer — separate message so the
  // inline "Open RIDE" button above keeps its own tap target.
  if (command === '/start') {
    await sendLocationPrompt(chatId, languageCode);
  }
  return true;
}

// ---------------------------------------------------------------------
// Location via the bot chat.
//
// The Mini App cannot ask the OS for GPS on every platform, but the bot
// chat can: a reply-keyboard button with request_location hands us one
// fix with explicit consent. The raw point is snapped to the ~500m grid
// before it ever reaches the database (lib/geo.ts) — precise
// coordinates are never persisted.
// ---------------------------------------------------------------------

const SHARE_PROMPT: Record<string, string> = {
  en: 'Want to see people near you on Discover? Share your location once — it is blurred to about 500 m and you can stop any time with /stoplocation.',
  ru: 'Хотите видеть людей рядом в разделе «Поиск»? Поделитесь геопозицией один раз — она округляется примерно до 500 м. Отключить: /stoplocation.',
  tr: 'Keşfet bölümünde yakınındakileri görmek ister misin? Konumunu bir kez paylaş — yaklaşık 500 metreye yuvarlanır. Kapatmak için: /stoplocation.',
};
const SHARE_BUTTON: Record<string, string> = {
  en: '📍 Share my location', ru: '📍 Поделиться геопозицией', tr: '📍 Konumumu paylaş',
};
const SHARE_DONE: Record<string, string> = {
  en: '📍 Location saved. Open Discover to see who is around — distances are always shown as ranges, never exact.',
  ru: '📍 Геопозиция сохранена. Откройте «Поиск», чтобы увидеть, кто рядом — расстояния всегда показываются диапазонами.',
  tr: '📍 Konum kaydedildi. Yakınındakileri görmek için Keşfet bölümünü aç — mesafeler her zaman aralık olarak gösterilir.',
};
const SHARE_STOPPED: Record<string, string> = {
  en: 'Location removed. You will no longer appear in nearby results.',
  ru: 'Геопозиция удалена. Вы больше не появляетесь в результатах поблизости.',
  tr: 'Konum silindi. Artık yakındaki sonuçlarda görünmeyeceksin.',
};

/** One inline button back into the Mini App. */
export async function sendOpenApp(
  chatId: number | string, languageCode: string | null, text?: string,
): Promise<void> {
  const lang = (languageCode ?? 'en').split('-')[0]!;
  await send(chatId, text ?? (OPEN_PROMPT[lang] ?? OPEN_PROMPT.en!), undefined, {
    inline_keyboard: [[{
      text: OPEN_LABEL[lang] ?? OPEN_LABEL.en!,
      web_app: { url: config.MINI_APP_URL },
    }]],
  });
}

const OPEN_PROMPT: Record<string, string> = {
  en: 'Tap below to open RIDE.',
  ru: 'Нажмите ниже, чтобы открыть RIDE.',
  tr: "RIDE'ı açmak için aşağıya dokun.",
};

async function send(
  chatId: number | string,
  text: string,
  replyMarkup?: unknown,
  inlineMarkup?: unknown,
): Promise<void> {
  await fetch(`${API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, text,
      ...(inlineMarkup ? { reply_markup: inlineMarkup }
          : replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  }).catch(() => undefined);
}

/** Second /start message: one button that shares a single location fix. */
export async function sendLocationPrompt(
  chatId: number | string, languageCode: string | null,
): Promise<void> {
  const lang = (languageCode ?? 'en').split('-')[0]!;
  await send(chatId, SHARE_PROMPT[lang] ?? SHARE_PROMPT.en!, {
    keyboard: [[{ text: SHARE_BUTTON[lang] ?? SHARE_BUTTON.en!, request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  });
}

/**
 * A location message arrived. Grid-snap, upsert, confirm. Returns false
 * when the sender has no RIDE account yet — they get pointed at the app
 * instead of a silent nothing.
 */
export async function handleLocationMessage(
  telegramUserId: number,
  chatId: number | string,
  latitude: number,
  longitude: number,
  languageCode: string | null,
): Promise<void> {
  const lang = (languageCode ?? 'en').split('-')[0]!;
  const [identity] = await sql<Array<{ account_id: string }>>`
    SELECT account_id FROM telegram_identities WHERE telegram_id = ${telegramUserId}
  `;
  if (!identity) {
    await send(chatId, WELCOME[lang] ?? WELCOME.en!);
    return;
  }

  const snapped = snapToGrid(latitude, longitude);
  await sql`
    INSERT INTO user_locations (account_id, cell, updated_at)
    VALUES (${identity.account_id},
            ST_SetSRID(ST_MakePoint(${snapped.lng}, ${snapped.lat}), 4326)::geography,
            now())
    ON CONFLICT (account_id) DO UPDATE
      SET cell = ST_SetSRID(ST_MakePoint(${snapped.lng}, ${snapped.lat}), 4326)::geography,
          updated_at = now()
  `;
  // Drop the location keyboard, then offer a way straight back into the
  // app — the whole point of sharing was to go look at Discover, and
  // without a button that meant hunting for the app again.
  await send(chatId, SHARE_DONE[lang] ?? SHARE_DONE.en!, { remove_keyboard: true });
  await sendOpenApp(chatId, languageCode);
}

export async function handleStopLocation(
  telegramUserId: number, chatId: number | string, languageCode: string | null,
): Promise<void> {
  const lang = (languageCode ?? 'en').split('-')[0]!;
  await sql`
    DELETE FROM user_locations ul USING telegram_identities ti
    WHERE ti.account_id = ul.account_id AND ti.telegram_id = ${telegramUserId}
  `;
  await send(chatId, SHARE_STOPPED[lang] ?? SHARE_STOPPED.en!, { remove_keyboard: true });
}
