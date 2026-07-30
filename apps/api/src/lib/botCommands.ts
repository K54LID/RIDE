import { config } from '../config.js';

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

  return true;
}
