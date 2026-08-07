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

/** Every language the app ships, in the order the picker lists them. */
export const BOT_LOCALES = ['en','ru','tr','az','ar','fa','es','de','fr','it','pt'] as const;

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Русский",
  tr: "Türkçe",
  az: "Azərbaycan",
  ar: "العربية",
  fa: "فارسی",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
};
const ASK_LANGUAGE: Record<string, string> = {
  en: "Please choose your language:",
  ru: "Выберите язык:",
  tr: "Lütfen dilini seç:",
  az: "Zəhmət olmasa dilini seç:",
  ar: "اختر لغتك من فضلك:",
  fa: "لطفاً زبان خود را انتخاب کنید:",
  es: "Elige tu idioma:",
  de: "Bitte wähle deine Sprache:",
  fr: "Choisis ta langue :",
  it: "Scegli la tua lingua:",
  pt: "Escolha seu idioma:",
};
const LANGUAGE_SET: Record<string, string> = {
  en: "Language set to English.",
  ru: "Язык переключён на русский.",
  tr: "Dil Türkçe olarak ayarlandı.",
  az: "Dil Azərbaycan dili olaraq təyin edildi.",
  ar: "تم ضبط اللغة على العربية.",
  fa: "زبان روی فارسی تنظیم شد.",
  es: "Idioma configurado en español.",
  de: "Sprache auf Deutsch gestellt.",
  fr: "Langue définie sur le français.",
  it: "Lingua impostata su italiano.",
  pt: "Idioma definido como português.",
};

const isLocale = (v: string): boolean => (BOT_LOCALES as readonly string[]).includes(v);

/**
 * Which language to speak to this person in.
 *
 * A stored choice always wins. Telegram's `language_code` is only the
 * fallback for the very first message, before anyone has been asked —
 * it reports the phone's UI language, which is often not the language
 * someone wants to read a dating app in.
 */
export async function resolveLocale(
  telegramId: number | string | null | undefined,
  languageCode: string | null,
): Promise<string> {
  if (telegramId !== null && telegramId !== undefined) {
    const [row] = await sql<Array<{ locale: string }>>`
      SELECT locale FROM bot_preferences WHERE telegram_id = ${String(telegramId)}
    `;
    if (row && isLocale(row.locale)) return row.locale;
  }
  const hinted = (languageCode ?? 'en').split('-')[0]!;
  return isLocale(hinted) ? hinted : 'en';
}

/** Two columns, so eleven options stay readable on a phone. */
export async function sendLanguagePicker(
  chatId: number | string,
  languageCode: string | null,
): Promise<void> {
  const hinted = (languageCode ?? 'en').split('-')[0]!;
  const lang = isLocale(hinted) ? hinted : 'en';
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < BOT_LOCALES.length; i += 2) {
    rows.push(BOT_LOCALES.slice(i, i + 2).map((l) => ({
      text: LOCALE_NAMES[l]!, callback_data: `lang:${l}`,
    })));
  }
  await send(chatId, ASK_LANGUAGE[lang] ?? ASK_LANGUAGE.en!, undefined,
             { inline_keyboard: rows });
}

/**
 * Store the pick, then run the whole first-run sequence in it:
 * confirmation, welcome with the open button, then the location prompt.
 */
export async function handleLanguageChoice(
  telegramId: number | string,
  chatId: number | string,
  locale: string,
): Promise<void> {
  if (!isLocale(locale)) return;

  await sql`
    INSERT INTO bot_preferences (telegram_id, locale)
    VALUES (${String(telegramId)}, ${locale})
    ON CONFLICT (telegram_id)
      DO UPDATE SET locale = ${locale}, updated_at = now()
  `;

  // Keep the Mini App in step: someone who already has an account
  // should find it in the language they just chose.
  await sql`
    UPDATE settings SET locale = ${locale}
    WHERE account_id = (
      SELECT account_id FROM telegram_identities WHERE telegram_id = ${String(telegramId)}
    )
  `;

  await send(chatId, LANGUAGE_SET[locale] ?? LANGUAGE_SET.en!);
  await sendWelcome(chatId, locale);
  await sendLocationPrompt(chatId, locale);
}

/**
 * Bot copy, in every language the app ships.
 *
 * Keyed by the locale the person picked in the chat, not by
 * Telegram's language_code — see resolveLocale below.
 */
const WELCOME: Record<string, string> = {
  en: "*Welcome to RIDE* 🏳️‍🌈\n\nRIDE is a social space to meet people nearby, share moments, and be seen.\n\n• *Discover* — find people around you, filtered how you like\n• *Stories & posts* — share photos and video that disappear or stay\n• *Woof, gift, court* — say something without saying anything\n• *Chat* — private messages, photos and reactions\n• *Ranks & awards* — climb the leaderboards, unlock badges\n\nYou must be 18 or older to use RIDE.\n\nTap below to open the app.",
  ru: "*Добро пожаловать в RIDE* 🏳️‍🌈\n\nRIDE — это пространство, чтобы знакомиться с людьми рядом, делиться моментами и быть замеченным.\n\n• *Поиск* — люди поблизости с нужными фильтрами\n• *Истории и посты* — фото и видео, временные или навсегда\n• *Вуф, подарок, ухаживание* — сказать, не говоря\n• *Чаты* — личные сообщения, фото и реакции\n• *Рейтинг и награды* — поднимайтесь в таблице, открывайте значки\n\nПользоваться RIDE можно с 18 лет.\n\nНажмите кнопку ниже, чтобы открыть приложение.",
  tr: "*RIDE'a hoş geldin* 🏳️‍🌈\n\nRIDE; yakınındaki insanlarla tanışmak, anlarını paylaşmak ve görünür olmak için bir sosyal alan.\n\n• *Keşfet* — çevrendeki insanlar, istediğin filtrelerle\n• *Hikâyeler ve gönderiler* — kaybolan ya da kalan foto ve video\n• *Woof, hediye, kur* — konuşmadan bir şey söyle\n• *Sohbet* — özel mesaj, fotoğraf ve tepkiler\n• *Sıralama ve ödüller* — listelerde yüksel, rozet kazan\n\nRIDE'ı kullanmak için 18 yaşından büyük olmalısın.\n\nUygulamayı açmak için aşağıdaki düğmeye dokun.",
  az: "*RIDE-a xoş gəldin* 🏳️‍🌈\n\nRIDE; yaxınlığındakı insanlarla tanış olmaq, anlarını paylaşmaq və görünmək üçün sosial məkandır.\n\n• *Kəşf* — ətrafındakı insanlar, istədiyin filtrlərlə\n• *Hekayələr və paylaşımlar* — itən və ya qalan foto və video\n• *Woof, hədiyyə, dərgah* — danışmadan bir şey de\n• *Söhbət* — şəxsi mesaj, şəkil və reaksiyalar\n• *Reytinq və mükafatlar* — cədvəllərdə yüksəl, nişanlar aç\n\nRIDE-dan istifadə üçün 18 yaşdan böyük olmalısan.\n\nTətbiqi açmaq üçün aşağıdakı düyməyə toxun.",
  ar: "*مرحبًا بك في RIDE* 🏳️‍🌈\n\nRIDE مساحة اجتماعية للتعرّف على من حولك، ومشاركة لحظاتك، وأن تكون مرئيًا.\n\n• *اكتشف* — أشخاص قريبون منك، بالفلاتر التي تريدها\n• *القصص والمنشورات* — صور وفيديو تختفي أو تبقى\n• *ووف، هدية، تودد* — قل شيئًا دون أن تتكلم\n• *المحادثات* — رسائل خاصة وصور وتفاعلات\n• *الترتيب والجوائز* — اصعد في الجداول واكسب الأوسمة\n\nيجب أن يكون عمرك ١٨ عامًا أو أكثر لاستخدام RIDE.\n\nاضغط الزر بالأسفل لفتح التطبيق.",
  fa: "*به RIDE خوش آمدید* 🏳️‍🌈\n\nRIDE فضایی اجتماعی برای آشنایی با افراد نزدیک، به اشتراک گذاشتن لحظه‌ها و دیده شدن است.\n\n• *کشف* — افراد اطراف شما، با فیلترهای دلخواه\n• *استوری و پست* — عکس و ویدیویی که می‌ماند یا محو می‌شود\n• *ووف، هدیه، دربار* — بدون حرف زدن چیزی بگویید\n• *گفتگو* — پیام خصوصی، عکس و واکنش\n• *رتبه‌ها و جوایز* — در جدول‌ها بالا بروید و نشان بگیرید\n\nبرای استفاده از RIDE باید ۱۸ سال یا بیشتر داشته باشید.\n\nبرای باز کردن برنامه دکمه زیر را بزنید.",
  es: "*Te damos la bienvenida a RIDE* 🏳️‍🌈\n\nRIDE es un espacio social para conocer gente cerca, compartir momentos y dejarte ver.\n\n• *Descubrir* — gente a tu alrededor, con los filtros que quieras\n• *Historias y publicaciones* — fotos y vídeos que desaparecen o se quedan\n• *Woof, regalo, cortejo* — decir algo sin decir nada\n• *Chat* — mensajes privados, fotos y reacciones\n• *Rankings y logros* — sube en las tablas y desbloquea insignias\n\nDebes tener 18 años o más para usar RIDE.\n\nToca abajo para abrir la app.",
  de: "*Willkommen bei RIDE* 🏳️‍🌈\n\nRIDE ist ein sozialer Raum, um Leute in der Nähe kennenzulernen, Momente zu teilen und gesehen zu werden.\n\n• *Entdecken* — Leute um dich herum, gefiltert wie du magst\n• *Storys & Beiträge* — Fotos und Videos, die verschwinden oder bleiben\n• *Woof, Geschenk, Umwerben* — etwas sagen, ohne zu reden\n• *Chat* — private Nachrichten, Fotos und Reaktionen\n• *Ranglisten & Auszeichnungen* — steig auf und schalte Abzeichen frei\n\nDu musst 18 oder älter sein, um RIDE zu nutzen.\n\nTippe unten, um die App zu öffnen.",
  fr: "*Bienvenue sur RIDE* 🏳️‍🌈\n\nRIDE est un espace social pour rencontrer des gens près de toi, partager des moments et te faire voir.\n\n• *Découvrir* — les gens autour de toi, avec tes filtres\n• *Stories et publications* — photos et vidéos qui disparaissent ou restent\n• *Woof, cadeau, cour* — dire quelque chose sans parler\n• *Discussions* — messages privés, photos et réactions\n• *Classements et récompenses* — grimpe et débloque des badges\n\nTu dois avoir 18 ans ou plus pour utiliser RIDE.\n\nTouche ci-dessous pour ouvrir l'application.",
  it: "*Benvenuto su RIDE* 🏳️‍🌈\n\nRIDE è uno spazio sociale per conoscere persone vicine, condividere momenti e farsi vedere.\n\n• *Scopri* — persone intorno a te, con i filtri che vuoi\n• *Storie e post* — foto e video che spariscono o restano\n• *Woof, regalo, corteggiamento* — dire qualcosa senza parlare\n• *Chat* — messaggi privati, foto e reazioni\n• *Classifiche e premi* — sali in classifica e sblocca distintivi\n\nDevi avere 18 anni o più per usare RIDE.\n\nTocca qui sotto per aprire l'app.",
  pt: "*Boas-vindas ao RIDE* 🏳️‍🌈\n\nO RIDE é um espaço social para conhecer gente por perto, compartilhar momentos e ser visto.\n\n• *Descobrir* — pessoas ao seu redor, com os filtros que quiser\n• *Stories e publicações* — fotos e vídeos que somem ou ficam\n• *Woof, presente, corte* — dizer algo sem falar\n• *Conversas* — mensagens privadas, fotos e reações\n• *Rankings e conquistas* — suba nas tabelas e desbloqueie selos\n\nVocê precisa ter 18 anos ou mais para usar o RIDE.\n\nToque abaixo para abrir o app.",
};

const OPEN_LABEL: Record<string, string> = {
  en: "Open RIDE",
  ru: "Открыть RIDE",
  tr: "RIDE'ı aç",
  az: "RIDE-ı aç",
  ar: "افتح RIDE",
  fa: "باز کردن RIDE",
  es: "Abrir RIDE",
  de: "RIDE öffnen",
  fr: "Ouvrir RIDE",
  it: "Apri RIDE",
  pt: "Abrir o RIDE",
};

const OPEN_PROMPT: Record<string, string> = {
  en: "Tap below to open RIDE.",
  ru: "Нажмите ниже, чтобы открыть RIDE.",
  tr: "RIDE'ı açmak için aşağıya dokun.",
  az: "RIDE-ı açmaq üçün aşağıya toxun.",
  ar: "اضغط بالأسفل لفتح RIDE.",
  fa: "برای باز کردن RIDE دکمه زیر را بزنید.",
  es: "Toca abajo para abrir RIDE.",
  de: "Tippe unten, um RIDE zu öffnen.",
  fr: "Touche ci-dessous pour ouvrir RIDE.",
  it: "Tocca qui sotto per aprire RIDE.",
  pt: "Toque abaixo para abrir o RIDE.",
};

const SHARE_PROMPT: Record<string, string> = {
  en: "Want to see people near you on Discover? Share your location once — it is blurred to about 500 m and you can stop any time with /stoplocation.",
  ru: "Хотите видеть людей рядом в разделе «Поиск»? Поделитесь геопозицией один раз — она округляется примерно до 500 м. Отключить: /stoplocation.",
  tr: "Keşfet bölümünde yakınındakileri görmek ister misin? Konumunu bir kez paylaş — yaklaşık 500 metreye yuvarlanır. Kapatmak için: /stoplocation.",
  az: "Kəşf bölməsində yaxınlıqdakıları görmək istəyirsən? Məkanını bir dəfə paylaş — təxminən 500 metrə yuvarlaqlaşdırılır. Dayandırmaq üçün: /stoplocation.",
  ar: "تريد رؤية من حولك في «اكتشف»؟ شارك موقعك مرة واحدة — يُقرَّب إلى نحو ٥٠٠ متر ويمكنك إيقافه في أي وقت بـ /stoplocation.",
  fa: "می‌خواهید افراد نزدیک را در «کشف» ببینید؟ یک بار موقعیت خود را بفرستید — تا حدود ۵۰۰ متر گرد می‌شود و هر زمان با /stoplocation می‌توانید متوقفش کنید.",
  es: "¿Quieres ver gente cerca en Descubrir? Comparte tu ubicación una vez: se difumina a unos 500 m y puedes desactivarla cuando quieras con /stoplocation.",
  de: "Willst du in Entdecken Leute in deiner Nähe sehen? Teile deinen Standort einmal — er wird auf etwa 500 m gerundet, und du kannst jederzeit mit /stoplocation aufhören.",
  fr: "Tu veux voir des gens près de toi dans Découvrir ? Partage ta position une fois : elle est arrondie à environ 500 m et tu peux arrêter à tout moment avec /stoplocation.",
  it: "Vuoi vedere persone vicine in Scopri? Condividi la posizione una volta: viene arrotondata a circa 500 m e puoi smettere quando vuoi con /stoplocation.",
  pt: "Quer ver gente perto no Descobrir? Compartilhe sua localização uma vez — ela é arredondada para cerca de 500 m e você pode parar quando quiser com /stoplocation.",
};

const SHARE_BUTTON: Record<string, string> = {
  en: "📍 Share my location",
  ru: "📍 Поделиться геопозицией",
  tr: "📍 Konumumu paylaş",
  az: "📍 Məkanımı paylaş",
  ar: "📍 مشاركة موقعي",
  fa: "📍 ارسال موقعیت من",
  es: "📍 Compartir mi ubicación",
  de: "📍 Standort teilen",
  fr: "📍 Partager ma position",
  it: "📍 Condividi la mia posizione",
  pt: "📍 Compartilhar minha localização",
};

const SHARE_DONE: Record<string, string> = {
  en: "📍 Location saved. Open Discover to see who is around — distances are always shown as ranges, never exact.",
  ru: "📍 Геопозиция сохранена. Откройте «Поиск», чтобы увидеть, кто рядом — расстояния всегда показываются диапазонами.",
  tr: "📍 Konum kaydedildi. Yakınındakileri görmek için Keşfet bölümünü aç — mesafeler her zaman aralık olarak gösterilir.",
  az: "📍 Məkan yadda saxlanıldı. Yaxınlıqdakıları görmək üçün Kəşf bölməsini aç — məsafələr həmişə aralıq kimi göstərilir.",
  ar: "📍 تم حفظ الموقع. افتح «اكتشف» لترى من حولك — المسافات تظهر دائمًا كنطاقات، لا أرقام دقيقة.",
  fa: "📍 موقعیت ذخیره شد. برای دیدن افراد اطراف «کشف» را باز کنید — فاصله‌ها همیشه به‌صورت بازه نشان داده می‌شوند.",
  es: "📍 Ubicación guardada. Abre Descubrir para ver quién está cerca: las distancias siempre se muestran como rangos, nunca exactas.",
  de: "📍 Standort gespeichert. Öffne Entdecken, um zu sehen, wer in der Nähe ist — Entfernungen erscheinen immer als Bereich, nie exakt.",
  fr: "📍 Position enregistrée. Ouvre Découvrir pour voir qui est autour : les distances sont toujours affichées en fourchettes, jamais exactes.",
  it: "📍 Posizione salvata. Apri Scopri per vedere chi c’è intorno: le distanze si vedono sempre come intervalli, mai esatte.",
  pt: "📍 Localização salva. Abra o Descobrir para ver quem está por perto — as distâncias sempre aparecem como faixas, nunca exatas.",
};

const SHARE_STOPPED: Record<string, string> = {
  en: "Location removed. You will no longer appear in nearby results.",
  ru: "Геопозиция удалена. Вы больше не появляетесь в результатах поблизости.",
  tr: "Konum silindi. Artık yakındaki sonuçlarda görünmeyeceksin.",
  az: "Məkan silindi. Artıq yaxınlıqdakı nəticələrdə görünməyəcəksən.",
  ar: "تم حذف الموقع. لن تظهر بعد الآن في نتائج القريبين.",
  fa: "موقعیت حذف شد. دیگر در نتایج نزدیک دیده نمی‌شوید.",
  es: "Ubicación eliminada. Ya no aparecerás en los resultados cercanos.",
  de: "Standort entfernt. Du erscheinst nicht mehr in Ergebnissen in der Nähe.",
  fr: "Position supprimée. Tu n’apparaîtras plus dans les résultats à proximité.",
  it: "Posizione rimossa. Non comparirai più nei risultati vicini.",
  pt: "Localização removida. Você não aparecerá mais nos resultados por perto.",
};



/**
 * The welcome, with the button that opens the app.
 *
 * Split out of /start because the language picker now needs to send it
 * too, once a choice has been made.
 */
export async function sendWelcome(
  chatId: number | string,
  locale: string,
): Promise<void> {
  await send(chatId, WELCOME[locale] ?? WELCOME.en!, undefined, {
    inline_keyboard: [[{
      text: OPEN_LABEL[locale] ?? OPEN_LABEL.en!,
      web_app: { url: config.MINI_APP_URL },
    }]],
  }, 'Markdown');
}

/**
 * /start, /help, /app.
 *
 * The very first thing a new person is asked is which language to
 * continue in — everything after that, including the introduction and
 * the location request, goes out in what they chose rather than in
 * whatever Telegram guessed from their phone. Someone who has already
 * chosen skips straight to the welcome; /language re-opens the picker.
 */
export async function handleBotCommand(
  chatId: number | string,
  text: string,
  languageCode: string | null,
  telegramId?: number | string | null,
): Promise<boolean> {
  const command = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (command !== '/start' && command !== '/help'
      && command !== '/app' && command !== '/language') return false;

  if (command === '/language') {
    await sendLanguagePicker(chatId, languageCode);
    return true;
  }

  const [stored] = telegramId != null
    ? await sql<Array<{ locale: string }>>`
        SELECT locale FROM bot_preferences WHERE telegram_id = ${String(telegramId)}
      `
    : [];

  // Not asked yet: ask, and send nothing else. The introduction arrives
  // in the chosen language the moment they pick.
  if (!stored) {
    await sendLanguagePicker(chatId, languageCode);
    return true;
  }

  await sendWelcome(chatId, await resolveLocale(telegramId ?? null, languageCode));
  return true;
}

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


async function send(
  chatId: number | string,
  text: string,
  replyMarkup?: unknown,
  inlineMarkup?: unknown,
  parseMode?: 'Markdown',
): Promise<void> {
  await fetch(`${API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      // The welcome contains a bare URL only inside a button, so the
      // preview would be noise on every /start.
      link_preview_options: { is_disabled: true },
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
