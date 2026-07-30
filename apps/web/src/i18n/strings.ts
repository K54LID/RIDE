/**
 * Translation table.
 *
 * One flat object per locale rather than nested namespaces — the key set
 * is small enough that nesting adds ceremony without helping, and a flat
 * shape makes a missing key obvious at a glance.
 *
 * English is the source of truth; `T` is derived from it, so adding a key
 * to `en` makes TypeScript demand it in all ten locales.
 */

export const LOCALES = {
  en: 'English',
  tr: 'Türkçe',
  ru: 'Русский',
  ar: 'العربية',
  az: 'Azərbaycan',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
} as const;

export type Locale = keyof typeof LOCALES;

/** Locales written right-to-left; drives the dir attribute. */
export const RTL: ReadonlySet<Locale> = new Set<Locale>(['ar']);

const en = {
  'nav.you': 'You',
  'nav.chats': 'Chats',
  'nav.create': 'Create',
  'nav.discover': 'Discover',
  'nav.leaderboard': 'Ranks',
  'nav.home': 'Home',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.retry': 'Try again',
  'common.close': 'Close',
  'common.loading': 'Loading',
  'common.search': 'Search',
  'common.filters': 'Filters',
  'common.apply': 'Apply',
  'common.clear': 'Clear',
  'common.post': 'Post',
  'common.done': 'Done',
  'common.optional': 'Optional',
  'common.soon': 'Coming soon',
  'common.offline': "Can't reach RIDE",
  'common.offline.body': 'The connection dropped. Check your network and try again.',

  'home.title': 'Home',
  'home.empty': 'Your feed is quiet',
  'home.empty.body': 'Follow people in Discover and their posts land here.',
  'home.stories': 'Stories',
  'home.first': 'Write the first post',

  'compose.title': 'New post',
  'compose.placeholder': "What's happening?",
  'compose.visibility': 'Who can see this',
  'compose.public': 'Everyone',
  'compose.followers': 'Followers',
  'compose.friends': 'Friends',
  'compose.private': 'Only me',
  'compose.media': 'Photo or video',
  'compose.publish': 'Publish',
  'compose.publishing': 'Publishing',

  'discover.title': 'Discover',
  'discover.map': 'Map',
  'discover.grid': 'Grid',
  'discover.list': 'List',
  'discover.searchPlaceholder': 'Search by name or handle',
  'discover.empty': 'Nobody matches that',
  'discover.empty.body': 'Loosen a filter or two and try again.',
  'discover.online': 'Online now',
  'discover.verified': 'Verified only',
  'discover.gender': 'Gender',
  'discover.age': 'Age',
  'discover.lookingFor': 'Looking for',
  'discover.languages': 'Languages',
  'discover.interests': 'Interests',
  'discover.distance': 'Distance',
  'discover.sort': 'Sort by',
  'discover.sort.active': 'Recently active',
  'discover.sort.new': 'New here',
  'discover.sort.court': 'Court value',
  'discover.sort.nearby': 'Nearest',

  'ranks.title': 'Ranks',
  'ranks.court': 'Court value',
  'ranks.woofs': 'Woofs',
  'ranks.gifts': 'Gifts',
  'ranks.followers': 'Followers',
  'ranks.day': 'Today',
  'ranks.week': 'Week',
  'ranks.month': 'Month',
  'ranks.all': 'All time',
  'ranks.empty': 'No ranking yet',
  'ranks.empty.body': 'Once people start woofing and courting, this fills up.',

  'profile.title': 'You',
  'profile.edit': 'Edit profile',
  'profile.details': 'Details',
  'profile.age': 'Age',
  'profile.gender': 'Gender',
  'profile.pronouns': 'Pronouns',
  'profile.orientation': 'Orientation',
  'profile.lookingFor': 'Looking for',
  'profile.languages': 'Languages',
  'profile.location': 'Location',
  'profile.height': 'Height',
  'profile.weight': 'Weight',
  'profile.bio': 'Bio',
  'profile.interests': 'Interests',
  'profile.relationship': 'Relationship',
  'profile.tribes': 'Tribes',
  'profile.photos': 'Photos',
  'profile.courtValue': 'Court value',
  'profile.tier': 'Tier',
  'profile.toNextTier': 'coins to reach tier',
  'profile.woofs': 'Woofs',
  'profile.gifts': 'Gifts',
  'profile.followers': 'Followers',
  'profile.following': 'Following',
  'profile.displayName': 'Display name',
  'profile.handle': 'Handle',
  'profile.saved': 'Profile updated',

  'wallet.title': 'Wallet',
  'wallet.balance': 'Balance',
  'wallet.coins': 'coins',
  'wallet.topUp': 'Add coins',
  'wallet.withStars': 'Pay with Telegram Stars',
  'wallet.history': 'Recent activity',
  'wallet.noHistory': 'Nothing here yet',
  'wallet.stars': 'Stars',

  'alerts.title': 'Alerts',
  'alerts.empty': 'Nothing new',
  'alerts.empty.body': 'Woofs, gifts, courts and friend requests show up here.',

  'chats.title': 'Chats',
  'chats.empty': 'No conversations yet',

  'gifts.title': 'Gifts',
  'gifts.send': 'Send a gift',

  'settings.language': 'Language',

  'soon.stories': 'Stories are on the way',
  'soon.stories.body': 'Photos and video that vanish after 24 hours, with viewers and replies.',
  'soon.media': 'Photo and video uploads',
  'soon.media.body': 'Media storage is being set up. Text posts work today.',
  'soon.map': 'The map is on the way',
  'soon.map.body': "You'll see people by approximate area — never an exact position.",
  'soon.chats': 'Messaging is on the way',
  'soon.chats.body': 'Text, voice notes and photos, with reactions and replies.',
  'soon.gifts': 'The gift shop is on the way',
  'soon.gifts.body': 'Send and collect gifts, paid for with Telegram Stars.',
} as const;

export type T = Record<keyof typeof en, string>;

const tr: T = {
  'nav.you': 'Sen', 'nav.chats': 'Sohbet', 'nav.create': 'Oluştur', 'nav.discover': 'Keşfet', 'nav.leaderboard': 'Sıralama', 'nav.home': 'Ana Sayfa',
  'common.save': 'Kaydet', 'common.cancel': 'İptal', 'common.retry': 'Tekrar dene', 'common.close': 'Kapat', 'common.loading': 'Yükleniyor', 'common.search': 'Ara', 'common.filters': 'Filtreler', 'common.apply': 'Uygula', 'common.clear': 'Temizle', 'common.post': 'Gönderi', 'common.done': 'Tamam', 'common.optional': 'İsteğe bağlı', 'common.soon': 'Yakında', 'common.offline': "RIDE'a ulaşılamıyor", 'common.offline.body': 'Bağlantı koptu. Ağını kontrol edip tekrar dene.',
  'home.title': 'Ana Sayfa', 'home.empty': 'Akışın sessiz', 'home.empty.body': 'Keşfet’ten insanları takip et, gönderileri burada görünsün.', 'home.stories': 'Hikâyeler', 'home.first': 'İlk gönderiyi yaz',
  'compose.title': 'Yeni gönderi', 'compose.placeholder': 'Ne oluyor?', 'compose.visibility': 'Bunu kim görebilir', 'compose.public': 'Herkes', 'compose.followers': 'Takipçiler', 'compose.friends': 'Arkadaşlar', 'compose.private': 'Sadece ben', 'compose.media': 'Fotoğraf veya video', 'compose.publish': 'Paylaş', 'compose.publishing': 'Paylaşılıyor',
  'discover.title': 'Keşfet', 'discover.map': 'Harita', 'discover.grid': 'Izgara', 'discover.list': 'Liste', 'discover.searchPlaceholder': 'İsim veya kullanıcı adı ara', 'discover.empty': 'Eşleşen kimse yok', 'discover.empty.body': 'Birkaç filtreyi gevşetip tekrar dene.', 'discover.online': 'Çevrimiçi', 'discover.verified': 'Sadece doğrulanmış', 'discover.gender': 'Cinsiyet', 'discover.age': 'Yaş', 'discover.lookingFor': 'Aradığı', 'discover.languages': 'Diller', 'discover.interests': 'İlgi alanları', 'discover.distance': 'Mesafe', 'discover.sort': 'Sırala', 'discover.sort.active': 'Son aktif', 'discover.sort.new': 'Yeni katılan', 'discover.sort.court': 'Kur değeri', 'discover.sort.nearby': 'En yakın',
  'ranks.title': 'Sıralama', 'ranks.court': 'Kur değeri', 'ranks.woofs': 'Woof', 'ranks.gifts': 'Hediyeler', 'ranks.followers': 'Takipçiler', 'ranks.day': 'Bugün', 'ranks.week': 'Hafta', 'ranks.month': 'Ay', 'ranks.all': 'Tüm zamanlar', 'ranks.empty': 'Henüz sıralama yok', 'ranks.empty.body': 'İnsanlar woof ve kur yapmaya başlayınca burası dolar.',
  'profile.title': 'Sen', 'profile.edit': 'Profili düzenle', 'profile.details': 'Bilgiler', 'profile.age': 'Yaş', 'profile.gender': 'Cinsiyet', 'profile.pronouns': 'Zamirler', 'profile.orientation': 'Yönelim', 'profile.lookingFor': 'Aradığı', 'profile.languages': 'Diller', 'profile.location': 'Konum', 'profile.height': 'Boy', 'profile.weight': 'Kilo', 'profile.bio': 'Hakkında', 'profile.interests': 'İlgi alanları', 'profile.relationship': 'İlişki', 'profile.tribes': 'Gruplar', 'profile.photos': 'Fotoğraflar', 'profile.courtValue': 'Kur değeri', 'profile.tier': 'Kademe', 'profile.toNextTier': 'jeton ile kademe', 'profile.woofs': 'Woof', 'profile.gifts': 'Hediye', 'profile.followers': 'Takipçi', 'profile.following': 'Takip', 'profile.displayName': 'Görünen ad', 'profile.handle': 'Kullanıcı adı', 'profile.saved': 'Profil güncellendi',
  'wallet.title': 'Cüzdan', 'wallet.balance': 'Bakiye', 'wallet.coins': 'jeton', 'wallet.topUp': 'Jeton ekle', 'wallet.withStars': 'Telegram Stars ile öde', 'wallet.history': 'Son hareketler', 'wallet.noHistory': 'Henüz bir şey yok', 'wallet.stars': 'Stars',
  'alerts.title': 'Bildirimler', 'alerts.empty': 'Yeni bir şey yok', 'alerts.empty.body': 'Woof, hediye, kur ve arkadaşlık istekleri burada görünür.',
  'chats.title': 'Sohbetler', 'chats.empty': 'Henüz sohbet yok',
  'gifts.title': 'Hediyeler', 'gifts.send': 'Hediye gönder',
  'settings.language': 'Dil',
  'soon.stories': 'Hikâyeler yolda', 'soon.stories.body': '24 saatte kaybolan fotoğraf ve videolar, görüntüleyen ve yanıtlarla.', 'soon.media': 'Fotoğraf ve video yükleme', 'soon.media.body': 'Medya deposu kuruluyor. Metin gönderileri şu an çalışıyor.', 'soon.map': 'Harita yolda', 'soon.map.body': 'İnsanları yaklaşık bölgeyle göreceksin — asla tam konumla değil.', 'soon.chats': 'Mesajlaşma yolda', 'soon.chats.body': 'Metin, sesli not ve fotoğraf; tepkiler ve yanıtlarla.', 'soon.gifts': 'Hediye dükkânı yolda', 'soon.gifts.body': 'Telegram Stars ile hediye gönder ve topla.',
};

const ru: T = {
  'nav.you': 'Профиль', 'nav.chats': 'Чаты', 'nav.create': 'Создать', 'nav.discover': 'Поиск', 'nav.leaderboard': 'Рейтинг', 'nav.home': 'Главная',
  'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.retry': 'Повторить', 'common.close': 'Закрыть', 'common.loading': 'Загрузка', 'common.search': 'Поиск', 'common.filters': 'Фильтры', 'common.apply': 'Применить', 'common.clear': 'Сбросить', 'common.post': 'Пост', 'common.done': 'Готово', 'common.optional': 'Необязательно', 'common.soon': 'Скоро', 'common.offline': 'RIDE недоступен', 'common.offline.body': 'Соединение прервано. Проверьте сеть и попробуйте снова.',
  'home.title': 'Главная', 'home.empty': 'В ленте пусто', 'home.empty.body': 'Подпишитесь на людей в разделе «Поиск», и их посты появятся здесь.', 'home.stories': 'Истории', 'home.first': 'Написать первый пост',
  'compose.title': 'Новый пост', 'compose.placeholder': 'Что происходит?', 'compose.visibility': 'Кто это увидит', 'compose.public': 'Все', 'compose.followers': 'Подписчики', 'compose.friends': 'Друзья', 'compose.private': 'Только я', 'compose.media': 'Фото или видео', 'compose.publish': 'Опубликовать', 'compose.publishing': 'Публикуем',
  'discover.title': 'Поиск', 'discover.map': 'Карта', 'discover.grid': 'Сетка', 'discover.list': 'Список', 'discover.searchPlaceholder': 'Имя или юзернейм', 'discover.empty': 'Никто не подошёл', 'discover.empty.body': 'Ослабьте пару фильтров и попробуйте снова.', 'discover.online': 'Сейчас онлайн', 'discover.verified': 'Только проверенные', 'discover.gender': 'Пол', 'discover.age': 'Возраст', 'discover.lookingFor': 'Ищет', 'discover.languages': 'Языки', 'discover.interests': 'Интересы', 'discover.distance': 'Расстояние', 'discover.sort': 'Сортировка', 'discover.sort.active': 'Недавно активны', 'discover.sort.new': 'Новенькие', 'discover.sort.court': 'Ценность', 'discover.sort.nearby': 'Ближайшие',
  'ranks.title': 'Рейтинг', 'ranks.court': 'Ценность', 'ranks.woofs': 'Вуфы', 'ranks.gifts': 'Подарки', 'ranks.followers': 'Подписчики', 'ranks.day': 'Сегодня', 'ranks.week': 'Неделя', 'ranks.month': 'Месяц', 'ranks.all': 'Всё время', 'ranks.empty': 'Рейтинга пока нет', 'ranks.empty.body': 'Когда начнутся вуфы и ухаживания, здесь появятся имена.',
  'profile.title': 'Профиль', 'profile.edit': 'Редактировать', 'profile.details': 'Информация', 'profile.age': 'Возраст', 'profile.gender': 'Пол', 'profile.pronouns': 'Местоимения', 'profile.orientation': 'Ориентация', 'profile.lookingFor': 'Ищет', 'profile.languages': 'Языки', 'profile.location': 'Локация', 'profile.height': 'Рост', 'profile.weight': 'Вес', 'profile.bio': 'О себе', 'profile.interests': 'Интересы', 'profile.relationship': 'Отношения', 'profile.tribes': 'Трайбы', 'profile.photos': 'Фото', 'profile.courtValue': 'Ценность', 'profile.tier': 'Уровень', 'profile.toNextTier': 'монет до уровня', 'profile.woofs': 'Вуфы', 'profile.gifts': 'Подарки', 'profile.followers': 'Подписчики', 'profile.following': 'Подписки', 'profile.displayName': 'Имя', 'profile.handle': 'Юзернейм', 'profile.saved': 'Профиль обновлён',
  'wallet.title': 'Кошелёк', 'wallet.balance': 'Баланс', 'wallet.coins': 'монет', 'wallet.topUp': 'Пополнить', 'wallet.withStars': 'Оплатить через Telegram Stars', 'wallet.history': 'Последние операции', 'wallet.noHistory': 'Пока пусто', 'wallet.stars': 'Stars',
  'alerts.title': 'Уведомления', 'alerts.empty': 'Ничего нового', 'alerts.empty.body': 'Вуфы, подарки, ухаживания и заявки в друзья появятся здесь.',
  'chats.title': 'Чаты', 'chats.empty': 'Пока нет переписок',
  'gifts.title': 'Подарки', 'gifts.send': 'Отправить подарок',
  'settings.language': 'Язык',
  'soon.stories': 'Истории скоро', 'soon.stories.body': 'Фото и видео, исчезающие через 24 часа, со списком зрителей и ответами.', 'soon.media': 'Загрузка фото и видео', 'soon.media.body': 'Хранилище медиа настраивается. Текстовые посты уже работают.', 'soon.map': 'Карта скоро', 'soon.map.body': 'Вы увидите людей по приблизительному району — никогда по точной точке.', 'soon.chats': 'Сообщения скоро', 'soon.chats.body': 'Текст, голосовые и фото, с реакциями и ответами.', 'soon.gifts': 'Магазин подарков скоро', 'soon.gifts.body': 'Отправляйте и собирайте подарки за Telegram Stars.',
};

const ar: T = {
  'nav.you': 'أنت', 'nav.chats': 'المحادثات', 'nav.create': 'إنشاء', 'nav.discover': 'استكشاف', 'nav.leaderboard': 'الترتيب', 'nav.home': 'الرئيسية',
  'common.save': 'حفظ', 'common.cancel': 'إلغاء', 'common.retry': 'أعد المحاولة', 'common.close': 'إغلاق', 'common.loading': 'جارٍ التحميل', 'common.search': 'بحث', 'common.filters': 'عوامل التصفية', 'common.apply': 'تطبيق', 'common.clear': 'مسح', 'common.post': 'منشور', 'common.done': 'تم', 'common.optional': 'اختياري', 'common.soon': 'قريباً', 'common.offline': 'تعذّر الوصول إلى RIDE', 'common.offline.body': 'انقطع الاتصال. تحقق من الشبكة وأعد المحاولة.',
  'home.title': 'الرئيسية', 'home.empty': 'لا جديد في موجزك', 'home.empty.body': 'تابع أشخاصاً من الاستكشاف لتظهر منشوراتهم هنا.', 'home.stories': 'القصص', 'home.first': 'اكتب أول منشور',
  'compose.title': 'منشور جديد', 'compose.placeholder': 'بمَ تفكر؟', 'compose.visibility': 'من يمكنه رؤية هذا', 'compose.public': 'الجميع', 'compose.followers': 'المتابعون', 'compose.friends': 'الأصدقاء', 'compose.private': 'أنا فقط', 'compose.media': 'صورة أو فيديو', 'compose.publish': 'نشر', 'compose.publishing': 'جارٍ النشر',
  'discover.title': 'استكشاف', 'discover.map': 'الخريطة', 'discover.grid': 'شبكة', 'discover.list': 'قائمة', 'discover.searchPlaceholder': 'ابحث بالاسم أو المعرّف', 'discover.empty': 'لا أحد يطابق ذلك', 'discover.empty.body': 'خفّف بعض عوامل التصفية وحاول مجدداً.', 'discover.online': 'متصل الآن', 'discover.verified': 'الموثّقون فقط', 'discover.gender': 'الجنس', 'discover.age': 'العمر', 'discover.lookingFor': 'يبحث عن', 'discover.languages': 'اللغات', 'discover.interests': 'الاهتمامات', 'discover.distance': 'المسافة', 'discover.sort': 'ترتيب حسب', 'discover.sort.active': 'النشاط الأخير', 'discover.sort.new': 'جديد هنا', 'discover.sort.court': 'قيمة المغازلة', 'discover.sort.nearby': 'الأقرب',
  'ranks.title': 'الترتيب', 'ranks.court': 'قيمة المغازلة', 'ranks.woofs': 'ووف', 'ranks.gifts': 'الهدايا', 'ranks.followers': 'المتابعون', 'ranks.day': 'اليوم', 'ranks.week': 'الأسبوع', 'ranks.month': 'الشهر', 'ranks.all': 'كل الأوقات', 'ranks.empty': 'لا ترتيب بعد', 'ranks.empty.body': 'عندما يبدأ الناس بالووف والمغازلة سيمتلئ هذا.',
  'profile.title': 'أنت', 'profile.edit': 'تعديل الملف', 'profile.details': 'التفاصيل', 'profile.age': 'العمر', 'profile.gender': 'الجنس', 'profile.pronouns': 'الضمائر', 'profile.orientation': 'الميول', 'profile.lookingFor': 'يبحث عن', 'profile.languages': 'اللغات', 'profile.location': 'الموقع', 'profile.height': 'الطول', 'profile.weight': 'الوزن', 'profile.bio': 'نبذة', 'profile.interests': 'الاهتمامات', 'profile.relationship': 'الحالة', 'profile.tribes': 'الفئات', 'profile.photos': 'الصور', 'profile.courtValue': 'قيمة المغازلة', 'profile.tier': 'المستوى', 'profile.toNextTier': 'عملة للوصول إلى المستوى', 'profile.woofs': 'ووف', 'profile.gifts': 'هدايا', 'profile.followers': 'متابعون', 'profile.following': 'يتابع', 'profile.displayName': 'الاسم الظاهر', 'profile.handle': 'المعرّف', 'profile.saved': 'تم تحديث الملف',
  'wallet.title': 'المحفظة', 'wallet.balance': 'الرصيد', 'wallet.coins': 'عملة', 'wallet.topUp': 'إضافة عملات', 'wallet.withStars': 'ادفع بنجوم تيليجرام', 'wallet.history': 'النشاط الأخير', 'wallet.noHistory': 'لا شيء بعد', 'wallet.stars': 'نجوم',
  'alerts.title': 'التنبيهات', 'alerts.empty': 'لا جديد', 'alerts.empty.body': 'الووف والهدايا والمغازلات وطلبات الصداقة تظهر هنا.',
  'chats.title': 'المحادثات', 'chats.empty': 'لا محادثات بعد',
  'gifts.title': 'الهدايا', 'gifts.send': 'أرسل هدية',
  'settings.language': 'اللغة',
  'soon.stories': 'القصص قادمة', 'soon.stories.body': 'صور وفيديو تختفي بعد 24 ساعة، مع المشاهدين والردود.', 'soon.media': 'رفع الصور والفيديو', 'soon.media.body': 'يجري إعداد تخزين الوسائط. المنشورات النصية تعمل الآن.', 'soon.map': 'الخريطة قادمة', 'soon.map.body': 'سترى الأشخاص حسب المنطقة التقريبية — لا الموقع الدقيق أبداً.', 'soon.chats': 'المراسلة قادمة', 'soon.chats.body': 'نصوص ومقاطع صوتية وصور، مع تفاعلات وردود.', 'soon.gifts': 'متجر الهدايا قادم', 'soon.gifts.body': 'أرسل واجمع الهدايا بنجوم تيليجرام.',
};

const az: T = {
  'nav.you': 'Sən', 'nav.chats': 'Söhbətlər', 'nav.create': 'Yarat', 'nav.discover': 'Kəşf et', 'nav.leaderboard': 'Reytinq', 'nav.home': 'Əsas',
  'common.save': 'Yadda saxla', 'common.cancel': 'Ləğv et', 'common.retry': 'Yenidən cəhd et', 'common.close': 'Bağla', 'common.loading': 'Yüklənir', 'common.search': 'Axtar', 'common.filters': 'Filtrlər', 'common.apply': 'Tətbiq et', 'common.clear': 'Təmizlə', 'common.post': 'Paylaşım', 'common.done': 'Hazır', 'common.optional': 'İstəyə bağlı', 'common.soon': 'Tezliklə', 'common.offline': 'RIDE-a çıxış yoxdur', 'common.offline.body': 'Bağlantı kəsildi. Şəbəkəni yoxlayıb yenidən cəhd et.',
  'home.title': 'Əsas', 'home.empty': 'Lentin boşdur', 'home.empty.body': 'Kəşf bölməsindən insanları izlə, paylaşımları burada görünsün.', 'home.stories': 'Hekayələr', 'home.first': 'İlk paylaşımı yaz',
  'compose.title': 'Yeni paylaşım', 'compose.placeholder': 'Nə baş verir?', 'compose.visibility': 'Bunu kim görə bilər', 'compose.public': 'Hamı', 'compose.followers': 'İzləyicilər', 'compose.friends': 'Dostlar', 'compose.private': 'Yalnız mən', 'compose.media': 'Foto və ya video', 'compose.publish': 'Paylaş', 'compose.publishing': 'Paylaşılır',
  'discover.title': 'Kəşf et', 'discover.map': 'Xəritə', 'discover.grid': 'Şəbəkə', 'discover.list': 'Siyahı', 'discover.searchPlaceholder': 'Ad və ya istifadəçi adı', 'discover.empty': 'Uyğun kimsə yoxdur', 'discover.empty.body': 'Bir-iki filtri yumşaldıb yenidən cəhd et.', 'discover.online': 'İndi onlayn', 'discover.verified': 'Yalnız təsdiqlənmiş', 'discover.gender': 'Cins', 'discover.age': 'Yaş', 'discover.lookingFor': 'Axtarır', 'discover.languages': 'Dillər', 'discover.interests': 'Maraqlar', 'discover.distance': 'Məsafə', 'discover.sort': 'Sırala', 'discover.sort.active': 'Son aktiv', 'discover.sort.new': 'Yeni', 'discover.sort.court': 'Dəyər', 'discover.sort.nearby': 'Ən yaxın',
  'ranks.title': 'Reytinq', 'ranks.court': 'Dəyər', 'ranks.woofs': 'Woof', 'ranks.gifts': 'Hədiyyələr', 'ranks.followers': 'İzləyicilər', 'ranks.day': 'Bu gün', 'ranks.week': 'Həftə', 'ranks.month': 'Ay', 'ranks.all': 'Bütün vaxtlar', 'ranks.empty': 'Hələ reytinq yoxdur', 'ranks.empty.body': 'İnsanlar woof və kur etməyə başlayanda bura dolacaq.',
  'profile.title': 'Sən', 'profile.edit': 'Profili redaktə et', 'profile.details': 'Məlumatlar', 'profile.age': 'Yaş', 'profile.gender': 'Cins', 'profile.pronouns': 'Əvəzliklər', 'profile.orientation': 'Oriyentasiya', 'profile.lookingFor': 'Axtarır', 'profile.languages': 'Dillər', 'profile.location': 'Məkan', 'profile.height': 'Boy', 'profile.weight': 'Çəki', 'profile.bio': 'Haqqında', 'profile.interests': 'Maraqlar', 'profile.relationship': 'Münasibət', 'profile.tribes': 'Qruplar', 'profile.photos': 'Şəkillər', 'profile.courtValue': 'Dəyər', 'profile.tier': 'Səviyyə', 'profile.toNextTier': 'sikkə ilə səviyyə', 'profile.woofs': 'Woof', 'profile.gifts': 'Hədiyyə', 'profile.followers': 'İzləyici', 'profile.following': 'İzləyir', 'profile.displayName': 'Görünən ad', 'profile.handle': 'İstifadəçi adı', 'profile.saved': 'Profil yeniləndi',
  'wallet.title': 'Cüzdan', 'wallet.balance': 'Balans', 'wallet.coins': 'sikkə', 'wallet.topUp': 'Sikkə əlavə et', 'wallet.withStars': 'Telegram Stars ilə ödə', 'wallet.history': 'Son əməliyyatlar', 'wallet.noHistory': 'Hələ heç nə yoxdur', 'wallet.stars': 'Stars',
  'alerts.title': 'Bildirişlər', 'alerts.empty': 'Yeni bir şey yoxdur', 'alerts.empty.body': 'Woof, hədiyyə, kur və dostluq istəkləri burada görünür.',
  'chats.title': 'Söhbətlər', 'chats.empty': 'Hələ söhbət yoxdur',
  'gifts.title': 'Hədiyyələr', 'gifts.send': 'Hədiyyə göndər',
  'settings.language': 'Dil',
  'soon.stories': 'Hekayələr yoldadır', 'soon.stories.body': '24 saatdan sonra yox olan foto və videolar, baxanlar və cavablarla.', 'soon.media': 'Foto və video yükləmə', 'soon.media.body': 'Media anbarı qurulur. Mətn paylaşımları indi işləyir.', 'soon.map': 'Xəritə yoldadır', 'soon.map.body': 'İnsanları təxmini ərazi ilə görəcəksən — heç vaxt dəqiq mövqe ilə yox.', 'soon.chats': 'Mesajlaşma yoldadır', 'soon.chats.body': 'Mətn, səsli mesaj və foto; reaksiya və cavablarla.', 'soon.gifts': 'Hədiyyə mağazası yoldadır', 'soon.gifts.body': 'Telegram Stars ilə hədiyyə göndər və topla.',
};

const es: T = {
  'nav.you': 'Tú', 'nav.chats': 'Chats', 'nav.create': 'Crear', 'nav.discover': 'Descubrir', 'nav.leaderboard': 'Ranking', 'nav.home': 'Inicio',
  'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.retry': 'Reintentar', 'common.close': 'Cerrar', 'common.loading': 'Cargando', 'common.search': 'Buscar', 'common.filters': 'Filtros', 'common.apply': 'Aplicar', 'common.clear': 'Limpiar', 'common.post': 'Publicación', 'common.done': 'Listo', 'common.optional': 'Opcional', 'common.soon': 'Próximamente', 'common.offline': 'No se puede conectar con RIDE', 'common.offline.body': 'Se perdió la conexión. Revisa tu red e inténtalo de nuevo.',
  'home.title': 'Inicio', 'home.empty': 'Tu feed está vacío', 'home.empty.body': 'Sigue a gente en Descubrir y sus publicaciones aparecerán aquí.', 'home.stories': 'Historias', 'home.first': 'Escribe la primera publicación',
  'compose.title': 'Nueva publicación', 'compose.placeholder': '¿Qué está pasando?', 'compose.visibility': 'Quién puede verlo', 'compose.public': 'Todos', 'compose.followers': 'Seguidores', 'compose.friends': 'Amigos', 'compose.private': 'Solo yo', 'compose.media': 'Foto o vídeo', 'compose.publish': 'Publicar', 'compose.publishing': 'Publicando',
  'discover.title': 'Descubrir', 'discover.map': 'Mapa', 'discover.grid': 'Cuadrícula', 'discover.list': 'Lista', 'discover.searchPlaceholder': 'Busca por nombre o usuario', 'discover.empty': 'Nadie coincide', 'discover.empty.body': 'Afloja algún filtro e inténtalo otra vez.', 'discover.online': 'En línea ahora', 'discover.verified': 'Solo verificados', 'discover.gender': 'Género', 'discover.age': 'Edad', 'discover.lookingFor': 'Busca', 'discover.languages': 'Idiomas', 'discover.interests': 'Intereses', 'discover.distance': 'Distancia', 'discover.sort': 'Ordenar por', 'discover.sort.active': 'Activos hace poco', 'discover.sort.new': 'Nuevos', 'discover.sort.court': 'Valor de cortejo', 'discover.sort.nearby': 'Más cercanos',
  'ranks.title': 'Ranking', 'ranks.court': 'Valor de cortejo', 'ranks.woofs': 'Woofs', 'ranks.gifts': 'Regalos', 'ranks.followers': 'Seguidores', 'ranks.day': 'Hoy', 'ranks.week': 'Semana', 'ranks.month': 'Mes', 'ranks.all': 'Histórico', 'ranks.empty': 'Aún no hay ranking', 'ranks.empty.body': 'Cuando la gente empiece a hacer woof y cortejar, esto se llenará.',
  'profile.title': 'Tú', 'profile.edit': 'Editar perfil', 'profile.details': 'Detalles', 'profile.age': 'Edad', 'profile.gender': 'Género', 'profile.pronouns': 'Pronombres', 'profile.orientation': 'Orientación', 'profile.lookingFor': 'Busca', 'profile.languages': 'Idiomas', 'profile.location': 'Ubicación', 'profile.height': 'Altura', 'profile.weight': 'Peso', 'profile.bio': 'Bio', 'profile.interests': 'Intereses', 'profile.relationship': 'Relación', 'profile.tribes': 'Tribus', 'profile.photos': 'Fotos', 'profile.courtValue': 'Valor de cortejo', 'profile.tier': 'Nivel', 'profile.toNextTier': 'monedas para el nivel', 'profile.woofs': 'Woofs', 'profile.gifts': 'Regalos', 'profile.followers': 'Seguidores', 'profile.following': 'Siguiendo', 'profile.displayName': 'Nombre visible', 'profile.handle': 'Usuario', 'profile.saved': 'Perfil actualizado',
  'wallet.title': 'Cartera', 'wallet.balance': 'Saldo', 'wallet.coins': 'monedas', 'wallet.topUp': 'Añadir monedas', 'wallet.withStars': 'Pagar con Telegram Stars', 'wallet.history': 'Actividad reciente', 'wallet.noHistory': 'Aún no hay nada', 'wallet.stars': 'Stars',
  'alerts.title': 'Avisos', 'alerts.empty': 'Nada nuevo', 'alerts.empty.body': 'Woofs, regalos, cortejos y solicitudes aparecen aquí.',
  'chats.title': 'Chats', 'chats.empty': 'Aún no hay conversaciones',
  'gifts.title': 'Regalos', 'gifts.send': 'Enviar un regalo',
  'settings.language': 'Idioma',
  'soon.stories': 'Las historias están en camino', 'soon.stories.body': 'Fotos y vídeos que desaparecen en 24 horas, con espectadores y respuestas.', 'soon.media': 'Subida de fotos y vídeos', 'soon.media.body': 'Se está configurando el almacenamiento. Las publicaciones de texto ya funcionan.', 'soon.map': 'El mapa está en camino', 'soon.map.body': 'Verás a la gente por zona aproximada, nunca por su posición exacta.', 'soon.chats': 'La mensajería está en camino', 'soon.chats.body': 'Texto, notas de voz y fotos, con reacciones y respuestas.', 'soon.gifts': 'La tienda de regalos está en camino', 'soon.gifts.body': 'Envía y colecciona regalos pagados con Telegram Stars.',
};

const de: T = {
  'nav.you': 'Du', 'nav.chats': 'Chats', 'nav.create': 'Erstellen', 'nav.discover': 'Entdecken', 'nav.leaderboard': 'Rangliste', 'nav.home': 'Start',
  'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.retry': 'Erneut versuchen', 'common.close': 'Schließen', 'common.loading': 'Lädt', 'common.search': 'Suchen', 'common.filters': 'Filter', 'common.apply': 'Anwenden', 'common.clear': 'Zurücksetzen', 'common.post': 'Beitrag', 'common.done': 'Fertig', 'common.optional': 'Optional', 'common.soon': 'Demnächst', 'common.offline': 'RIDE nicht erreichbar', 'common.offline.body': 'Die Verbindung ist abgebrochen. Prüfe dein Netz und versuch es erneut.',
  'home.title': 'Start', 'home.empty': 'Dein Feed ist leer', 'home.empty.body': 'Folge Leuten unter Entdecken, dann landen ihre Beiträge hier.', 'home.stories': 'Stories', 'home.first': 'Schreib den ersten Beitrag',
  'compose.title': 'Neuer Beitrag', 'compose.placeholder': 'Was gibt es Neues?', 'compose.visibility': 'Wer das sehen darf', 'compose.public': 'Alle', 'compose.followers': 'Follower', 'compose.friends': 'Freunde', 'compose.private': 'Nur ich', 'compose.media': 'Foto oder Video', 'compose.publish': 'Veröffentlichen', 'compose.publishing': 'Wird veröffentlicht',
  'discover.title': 'Entdecken', 'discover.map': 'Karte', 'discover.grid': 'Raster', 'discover.list': 'Liste', 'discover.searchPlaceholder': 'Nach Name oder Handle suchen', 'discover.empty': 'Niemand passt dazu', 'discover.empty.body': 'Lockere ein, zwei Filter und versuch es nochmal.', 'discover.online': 'Jetzt online', 'discover.verified': 'Nur verifiziert', 'discover.gender': 'Geschlecht', 'discover.age': 'Alter', 'discover.lookingFor': 'Sucht', 'discover.languages': 'Sprachen', 'discover.interests': 'Interessen', 'discover.distance': 'Entfernung', 'discover.sort': 'Sortieren nach', 'discover.sort.active': 'Zuletzt aktiv', 'discover.sort.new': 'Neu hier', 'discover.sort.court': 'Hofwert', 'discover.sort.nearby': 'Am nächsten',
  'ranks.title': 'Rangliste', 'ranks.court': 'Hofwert', 'ranks.woofs': 'Woofs', 'ranks.gifts': 'Geschenke', 'ranks.followers': 'Follower', 'ranks.day': 'Heute', 'ranks.week': 'Woche', 'ranks.month': 'Monat', 'ranks.all': 'Gesamt', 'ranks.empty': 'Noch keine Rangliste', 'ranks.empty.body': 'Sobald gewooft und geworben wird, füllt sich das hier.',
  'profile.title': 'Du', 'profile.edit': 'Profil bearbeiten', 'profile.details': 'Details', 'profile.age': 'Alter', 'profile.gender': 'Geschlecht', 'profile.pronouns': 'Pronomen', 'profile.orientation': 'Orientierung', 'profile.lookingFor': 'Sucht', 'profile.languages': 'Sprachen', 'profile.location': 'Ort', 'profile.height': 'Größe', 'profile.weight': 'Gewicht', 'profile.bio': 'Über mich', 'profile.interests': 'Interessen', 'profile.relationship': 'Beziehung', 'profile.tribes': 'Tribes', 'profile.photos': 'Fotos', 'profile.courtValue': 'Hofwert', 'profile.tier': 'Stufe', 'profile.toNextTier': 'Münzen bis Stufe', 'profile.woofs': 'Woofs', 'profile.gifts': 'Geschenke', 'profile.followers': 'Follower', 'profile.following': 'Folgt', 'profile.displayName': 'Anzeigename', 'profile.handle': 'Handle', 'profile.saved': 'Profil aktualisiert',
  'wallet.title': 'Wallet', 'wallet.balance': 'Guthaben', 'wallet.coins': 'Münzen', 'wallet.topUp': 'Münzen aufladen', 'wallet.withStars': 'Mit Telegram Stars zahlen', 'wallet.history': 'Letzte Aktivität', 'wallet.noHistory': 'Noch nichts da', 'wallet.stars': 'Stars',
  'alerts.title': 'Hinweise', 'alerts.empty': 'Nichts Neues', 'alerts.empty.body': 'Woofs, Geschenke, Werbungen und Freundschaftsanfragen erscheinen hier.',
  'chats.title': 'Chats', 'chats.empty': 'Noch keine Unterhaltungen',
  'gifts.title': 'Geschenke', 'gifts.send': 'Geschenk senden',
  'settings.language': 'Sprache',
  'soon.stories': 'Stories kommen bald', 'soon.stories.body': 'Fotos und Videos, die nach 24 Stunden verschwinden — mit Zuschauern und Antworten.', 'soon.media': 'Foto- und Video-Uploads', 'soon.media.body': 'Der Medienspeicher wird eingerichtet. Textbeiträge funktionieren bereits.', 'soon.map': 'Die Karte kommt bald', 'soon.map.body': 'Du siehst Leute nach ungefährer Gegend — nie nach genauer Position.', 'soon.chats': 'Nachrichten kommen bald', 'soon.chats.body': 'Text, Sprachnachrichten und Fotos, mit Reaktionen und Antworten.', 'soon.gifts': 'Der Geschenkeshop kommt bald', 'soon.gifts.body': 'Verschicke und sammle Geschenke, bezahlt mit Telegram Stars.',
};

const fr: T = {
  'nav.you': 'Toi', 'nav.chats': 'Discussions', 'nav.create': 'Créer', 'nav.discover': 'Découvrir', 'nav.leaderboard': 'Classement', 'nav.home': 'Accueil',
  'common.save': 'Enregistrer', 'common.cancel': 'Annuler', 'common.retry': 'Réessayer', 'common.close': 'Fermer', 'common.loading': 'Chargement', 'common.search': 'Rechercher', 'common.filters': 'Filtres', 'common.apply': 'Appliquer', 'common.clear': 'Effacer', 'common.post': 'Publication', 'common.done': 'Terminé', 'common.optional': 'Facultatif', 'common.soon': 'Bientôt', 'common.offline': 'Impossible de joindre RIDE', 'common.offline.body': 'La connexion a été perdue. Vérifie ton réseau et réessaie.',
  'home.title': 'Accueil', 'home.empty': 'Ton fil est vide', 'home.empty.body': 'Suis des gens dans Découvrir et leurs publications arriveront ici.', 'home.stories': 'Stories', 'home.first': 'Écris la première publication',
  'compose.title': 'Nouvelle publication', 'compose.placeholder': 'Quoi de neuf ?', 'compose.visibility': 'Qui peut voir ceci', 'compose.public': 'Tout le monde', 'compose.followers': 'Abonnés', 'compose.friends': 'Amis', 'compose.private': 'Moi seulement', 'compose.media': 'Photo ou vidéo', 'compose.publish': 'Publier', 'compose.publishing': 'Publication',
  'discover.title': 'Découvrir', 'discover.map': 'Carte', 'discover.grid': 'Grille', 'discover.list': 'Liste', 'discover.searchPlaceholder': 'Chercher par nom ou identifiant', 'discover.empty': 'Personne ne correspond', 'discover.empty.body': 'Assouplis un ou deux filtres et réessaie.', 'discover.online': 'En ligne', 'discover.verified': 'Vérifiés uniquement', 'discover.gender': 'Genre', 'discover.age': 'Âge', 'discover.lookingFor': 'Recherche', 'discover.languages': 'Langues', 'discover.interests': 'Centres d’intérêt', 'discover.distance': 'Distance', 'discover.sort': 'Trier par', 'discover.sort.active': 'Actifs récemment', 'discover.sort.new': 'Nouveaux', 'discover.sort.court': 'Valeur de cour', 'discover.sort.nearby': 'Les plus proches',
  'ranks.title': 'Classement', 'ranks.court': 'Valeur de cour', 'ranks.woofs': 'Woofs', 'ranks.gifts': 'Cadeaux', 'ranks.followers': 'Abonnés', 'ranks.day': "Aujourd'hui", 'ranks.week': 'Semaine', 'ranks.month': 'Mois', 'ranks.all': 'Depuis toujours', 'ranks.empty': 'Pas encore de classement', 'ranks.empty.body': 'Dès que les woofs et les cours commenceront, ça se remplira.',
  'profile.title': 'Toi', 'profile.edit': 'Modifier le profil', 'profile.details': 'Détails', 'profile.age': 'Âge', 'profile.gender': 'Genre', 'profile.pronouns': 'Pronoms', 'profile.orientation': 'Orientation', 'profile.lookingFor': 'Recherche', 'profile.languages': 'Langues', 'profile.location': 'Lieu', 'profile.height': 'Taille', 'profile.weight': 'Poids', 'profile.bio': 'Bio', 'profile.interests': 'Centres d’intérêt', 'profile.relationship': 'Relation', 'profile.tribes': 'Tribus', 'profile.photos': 'Photos', 'profile.courtValue': 'Valeur de cour', 'profile.tier': 'Palier', 'profile.toNextTier': 'pièces pour le palier', 'profile.woofs': 'Woofs', 'profile.gifts': 'Cadeaux', 'profile.followers': 'Abonnés', 'profile.following': 'Abonnements', 'profile.displayName': 'Nom affiché', 'profile.handle': 'Identifiant', 'profile.saved': 'Profil mis à jour',
  'wallet.title': 'Portefeuille', 'wallet.balance': 'Solde', 'wallet.coins': 'pièces', 'wallet.topUp': 'Ajouter des pièces', 'wallet.withStars': 'Payer avec Telegram Stars', 'wallet.history': 'Activité récente', 'wallet.noHistory': 'Rien pour l’instant', 'wallet.stars': 'Stars',
  'alerts.title': 'Alertes', 'alerts.empty': 'Rien de neuf', 'alerts.empty.body': 'Woofs, cadeaux, cours et demandes d’amis apparaissent ici.',
  'chats.title': 'Discussions', 'chats.empty': 'Pas encore de conversations',
  'gifts.title': 'Cadeaux', 'gifts.send': 'Envoyer un cadeau',
  'settings.language': 'Langue',
  'soon.stories': 'Les stories arrivent', 'soon.stories.body': 'Photos et vidéos qui disparaissent après 24 heures, avec vues et réponses.', 'soon.media': 'Envoi de photos et vidéos', 'soon.media.body': 'Le stockage des médias est en cours d’installation. Les publications texte fonctionnent déjà.', 'soon.map': 'La carte arrive', 'soon.map.body': 'Tu verras les gens par zone approximative, jamais à leur position exacte.', 'soon.chats': 'La messagerie arrive', 'soon.chats.body': 'Texte, notes vocales et photos, avec réactions et réponses.', 'soon.gifts': 'La boutique de cadeaux arrive', 'soon.gifts.body': 'Envoie et collectionne des cadeaux payés en Telegram Stars.',
};

const it: T = {
  'nav.you': 'Tu', 'nav.chats': 'Chat', 'nav.create': 'Crea', 'nav.discover': 'Scopri', 'nav.leaderboard': 'Classifica', 'nav.home': 'Home',
  'common.save': 'Salva', 'common.cancel': 'Annulla', 'common.retry': 'Riprova', 'common.close': 'Chiudi', 'common.loading': 'Caricamento', 'common.search': 'Cerca', 'common.filters': 'Filtri', 'common.apply': 'Applica', 'common.clear': 'Cancella', 'common.post': 'Post', 'common.done': 'Fatto', 'common.optional': 'Facoltativo', 'common.soon': 'In arrivo', 'common.offline': 'RIDE non raggiungibile', 'common.offline.body': 'Connessione persa. Controlla la rete e riprova.',
  'home.title': 'Home', 'home.empty': 'Il tuo feed è vuoto', 'home.empty.body': 'Segui qualcuno in Scopri e i loro post arriveranno qui.', 'home.stories': 'Storie', 'home.first': 'Scrivi il primo post',
  'compose.title': 'Nuovo post', 'compose.placeholder': 'Che succede?', 'compose.visibility': 'Chi può vederlo', 'compose.public': 'Tutti', 'compose.followers': 'Follower', 'compose.friends': 'Amici', 'compose.private': 'Solo io', 'compose.media': 'Foto o video', 'compose.publish': 'Pubblica', 'compose.publishing': 'Pubblicazione',
  'discover.title': 'Scopri', 'discover.map': 'Mappa', 'discover.grid': 'Griglia', 'discover.list': 'Elenco', 'discover.searchPlaceholder': 'Cerca per nome o handle', 'discover.empty': 'Nessuna corrispondenza', 'discover.empty.body': 'Allenta qualche filtro e riprova.', 'discover.online': 'Online ora', 'discover.verified': 'Solo verificati', 'discover.gender': 'Genere', 'discover.age': 'Età', 'discover.lookingFor': 'Cerca', 'discover.languages': 'Lingue', 'discover.interests': 'Interessi', 'discover.distance': 'Distanza', 'discover.sort': 'Ordina per', 'discover.sort.active': 'Attivi di recente', 'discover.sort.new': 'Nuovi', 'discover.sort.court': 'Valore di corte', 'discover.sort.nearby': 'Più vicini',
  'ranks.title': 'Classifica', 'ranks.court': 'Valore di corte', 'ranks.woofs': 'Woof', 'ranks.gifts': 'Regali', 'ranks.followers': 'Follower', 'ranks.day': 'Oggi', 'ranks.week': 'Settimana', 'ranks.month': 'Mese', 'ranks.all': 'Sempre', 'ranks.empty': 'Ancora nessuna classifica', 'ranks.empty.body': 'Quando iniziano woof e corteggiamenti, questa si riempie.',
  'profile.title': 'Tu', 'profile.edit': 'Modifica profilo', 'profile.details': 'Dettagli', 'profile.age': 'Età', 'profile.gender': 'Genere', 'profile.pronouns': 'Pronomi', 'profile.orientation': 'Orientamento', 'profile.lookingFor': 'Cerca', 'profile.languages': 'Lingue', 'profile.location': 'Posizione', 'profile.height': 'Altezza', 'profile.weight': 'Peso', 'profile.bio': 'Bio', 'profile.interests': 'Interessi', 'profile.relationship': 'Relazione', 'profile.tribes': 'Tribù', 'profile.photos': 'Foto', 'profile.courtValue': 'Valore di corte', 'profile.tier': 'Livello', 'profile.toNextTier': 'monete per il livello', 'profile.woofs': 'Woof', 'profile.gifts': 'Regali', 'profile.followers': 'Follower', 'profile.following': 'Seguiti', 'profile.displayName': 'Nome visualizzato', 'profile.handle': 'Handle', 'profile.saved': 'Profilo aggiornato',
  'wallet.title': 'Portafoglio', 'wallet.balance': 'Saldo', 'wallet.coins': 'monete', 'wallet.topUp': 'Aggiungi monete', 'wallet.withStars': 'Paga con Telegram Stars', 'wallet.history': 'Attività recente', 'wallet.noHistory': 'Ancora niente', 'wallet.stars': 'Stars',
  'alerts.title': 'Avvisi', 'alerts.empty': 'Niente di nuovo', 'alerts.empty.body': 'Woof, regali, corteggiamenti e richieste di amicizia appaiono qui.',
  'chats.title': 'Chat', 'chats.empty': 'Ancora nessuna conversazione',
  'gifts.title': 'Regali', 'gifts.send': 'Invia un regalo',
  'settings.language': 'Lingua',
  'soon.stories': 'Le storie stanno arrivando', 'soon.stories.body': 'Foto e video che spariscono dopo 24 ore, con visualizzazioni e risposte.', 'soon.media': 'Caricamento di foto e video', 'soon.media.body': 'Lo storage dei media è in configurazione. I post di testo funzionano già.', 'soon.map': 'La mappa sta arrivando', 'soon.map.body': 'Vedrai le persone per zona approssimativa, mai la posizione esatta.', 'soon.chats': 'La messaggistica sta arrivando', 'soon.chats.body': 'Testo, note vocali e foto, con reazioni e risposte.', 'soon.gifts': 'Il negozio di regali sta arrivando', 'soon.gifts.body': 'Invia e colleziona regali pagati con Telegram Stars.',
};

const pt: T = {
  'nav.you': 'Você', 'nav.chats': 'Conversas', 'nav.create': 'Criar', 'nav.discover': 'Descobrir', 'nav.leaderboard': 'Ranking', 'nav.home': 'Início',
  'common.save': 'Salvar', 'common.cancel': 'Cancelar', 'common.retry': 'Tentar de novo', 'common.close': 'Fechar', 'common.loading': 'Carregando', 'common.search': 'Buscar', 'common.filters': 'Filtros', 'common.apply': 'Aplicar', 'common.clear': 'Limpar', 'common.post': 'Publicação', 'common.done': 'Pronto', 'common.optional': 'Opcional', 'common.soon': 'Em breve', 'common.offline': 'Não foi possível acessar o RIDE', 'common.offline.body': 'A conexão caiu. Verifique sua rede e tente de novo.',
  'home.title': 'Início', 'home.empty': 'Seu feed está vazio', 'home.empty.body': 'Siga pessoas em Descobrir e as publicações delas aparecerão aqui.', 'home.stories': 'Stories', 'home.first': 'Escreva a primeira publicação',
  'compose.title': 'Nova publicação', 'compose.placeholder': 'O que está acontecendo?', 'compose.visibility': 'Quem pode ver isto', 'compose.public': 'Todos', 'compose.followers': 'Seguidores', 'compose.friends': 'Amigos', 'compose.private': 'Só eu', 'compose.media': 'Foto ou vídeo', 'compose.publish': 'Publicar', 'compose.publishing': 'Publicando',
  'discover.title': 'Descobrir', 'discover.map': 'Mapa', 'discover.grid': 'Grade', 'discover.list': 'Lista', 'discover.searchPlaceholder': 'Buscar por nome ou handle', 'discover.empty': 'Ninguém corresponde', 'discover.empty.body': 'Afrouxe um ou dois filtros e tente de novo.', 'discover.online': 'Online agora', 'discover.verified': 'Só verificados', 'discover.gender': 'Gênero', 'discover.age': 'Idade', 'discover.lookingFor': 'Procura', 'discover.languages': 'Idiomas', 'discover.interests': 'Interesses', 'discover.distance': 'Distância', 'discover.sort': 'Ordenar por', 'discover.sort.active': 'Ativos recentemente', 'discover.sort.new': 'Novos aqui', 'discover.sort.court': 'Valor de corte', 'discover.sort.nearby': 'Mais próximos',
  'ranks.title': 'Ranking', 'ranks.court': 'Valor de corte', 'ranks.woofs': 'Woofs', 'ranks.gifts': 'Presentes', 'ranks.followers': 'Seguidores', 'ranks.day': 'Hoje', 'ranks.week': 'Semana', 'ranks.month': 'Mês', 'ranks.all': 'Sempre', 'ranks.empty': 'Ainda sem ranking', 'ranks.empty.body': 'Quando começarem os woofs e as cortes, isto vai encher.',
  'profile.title': 'Você', 'profile.edit': 'Editar perfil', 'profile.details': 'Detalhes', 'profile.age': 'Idade', 'profile.gender': 'Gênero', 'profile.pronouns': 'Pronomes', 'profile.orientation': 'Orientação', 'profile.lookingFor': 'Procura', 'profile.languages': 'Idiomas', 'profile.location': 'Localização', 'profile.height': 'Altura', 'profile.weight': 'Peso', 'profile.bio': 'Bio', 'profile.interests': 'Interesses', 'profile.relationship': 'Relacionamento', 'profile.tribes': 'Tribos', 'profile.photos': 'Fotos', 'profile.courtValue': 'Valor de corte', 'profile.tier': 'Nível', 'profile.toNextTier': 'moedas para o nível', 'profile.woofs': 'Woofs', 'profile.gifts': 'Presentes', 'profile.followers': 'Seguidores', 'profile.following': 'Seguindo', 'profile.displayName': 'Nome de exibição', 'profile.handle': 'Handle', 'profile.saved': 'Perfil atualizado',
  'wallet.title': 'Carteira', 'wallet.balance': 'Saldo', 'wallet.coins': 'moedas', 'wallet.topUp': 'Adicionar moedas', 'wallet.withStars': 'Pagar com Telegram Stars', 'wallet.history': 'Atividade recente', 'wallet.noHistory': 'Nada por aqui ainda', 'wallet.stars': 'Stars',
  'alerts.title': 'Alertas', 'alerts.empty': 'Nada novo', 'alerts.empty.body': 'Woofs, presentes, cortes e pedidos de amizade aparecem aqui.',
  'chats.title': 'Conversas', 'chats.empty': 'Ainda sem conversas',
  'gifts.title': 'Presentes', 'gifts.send': 'Enviar um presente',
  'settings.language': 'Idioma',
  'soon.stories': 'Os stories estão a caminho', 'soon.stories.body': 'Fotos e vídeos que somem após 24 horas, com visualizações e respostas.', 'soon.media': 'Envio de fotos e vídeos', 'soon.media.body': 'O armazenamento de mídia está sendo configurado. Publicações de texto já funcionam.', 'soon.map': 'O mapa está a caminho', 'soon.map.body': 'Você verá pessoas por área aproximada — nunca a posição exata.', 'soon.chats': 'As mensagens estão a caminho', 'soon.chats.body': 'Texto, áudios e fotos, com reações e respostas.', 'soon.gifts': 'A loja de presentes está a caminho', 'soon.gifts.body': 'Envie e colecione presentes pagos com Telegram Stars.',
};

export const TABLES: Record<Locale, T> = { en, tr, ru, ar, az, es, de, fr, it, pt };
