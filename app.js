const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
// images go through the platform's cache (Electron: medimg://; Android caches them natively, see ImageCache.java)
const img = url => url && api.imgSrc && !String(url).startsWith('medimg:') ? api.imgSrc(url) : url || '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// ---------- language (Arabic by default, RTL) ----------
const STR = {
  ar: {
    home: 'الرئيسية', anime: 'أنمي', remove: 'إزالة', series: 'المسلسلات', movies: 'أفلام الأنمي', cinema: 'أفلام ومسلسلات', dubbed: 'مدبلج', schedule: 'مواعيد الأنمي', myList: 'قائمتي', searchPh: 'ابحث عن أنمي أو فيلم…', listSearchPh: 'ابحث في قائمتي…', cancel: 'إلغاء', clear: 'مسح',
    settings: 'الإعدادات', more: 'المزيد', storage: 'مجلد التطبيق', storageHint: 'احفظ التنزيلات والإعدادات وقائمتك وسجل المشاهدة في مجلد MEDFLIX على الهاتف، لتبقى حتى بعد حذف التطبيق وإعادة تثبيته.', storageAllow: 'السماح بالوصول', storageOn: 'مفعّل', storageOff: 'يحتاج إذن الوصول إلى كل الملفات', storageReady: 'تم حفظ بياناتك في مجلد MEDFLIX', storageAsk: 'اسمح للتطبيق بالوصول إلى الملفات ليحفظ قائمتك وسجل المشاهدة والإعدادات والتنزيلات في مجلد MEDFLIX على الهاتف. هكذا تبقى بعد حذف التطبيق، وتعود تلقائيًا عند إعادة تثبيته والسماح مرة أخرى.', later: 'لاحقًا', close: 'إغلاق', reverse: 'عكس الترتيب', dockTitle: 'أزرار الشريط السفلي', dockHint: 'اختر حتى 5 أزرار تظهر في الشريط السفلي على الهاتف، والباقي تجده في القائمة الجانبية ☰.',
    dataTitle: 'بياناتك', dataHint: 'قائمتك وسجل المشاهدة وإعداداتك محفوظة في هذا المتصفح فقط. احفظ نسخة منها لتنقلها إلى جهاز آخر أو تستعيدها لاحقًا.', backup: 'حفظ نسخة من بياناتي', restore: 'استعادة نسخة محفوظة', restored: 'تمت استعادة بياناتك', restoreBad: 'هذا الملف ليس نسخة من بياناتك', clearCache: 'مسح الصور والصفحات المحفوظة', getApp: 'تطبيق أندرويد', getAppHint: 'التنزيلات، والعرض على التلفاز، وكل مصادر الأنمي.', getAppBtn: 'تحميل التطبيق', interfaceLang: 'لغة الواجهة', runtime: (h, m) => [h && `\u2066${h}\u2069 س`, m && `\u2066${m}\u2069 د`].filter(Boolean).join(' '),
    inDock: 'في الشريط', available: 'أزرار أخرى', dockFull: 'الشريط ممتلئ: أزل زرًا أولًا', dockMin: 'يجب أن يبقى زر واحد على الأقل', language: 'اللغة',
    moveUp: 'تحريك للأعلى', moveDown: 'تحريك للأسفل', removeDock: 'إزالة من الشريط', addDock: 'إضافة إلى الشريط',
    rfChip: 'التقييم', rfTitle: 'التصفية حسب التقييم', rfHint: 'فعّل التقييمات التي تهمك وحدد أقل درجة تقبلها. تبقى اختياراتك محفوظة.', rfFilms: 'الأفلام والمسلسلات', rfAnime: 'الأنمي والمانجا', rfMatch: 'يجب أن يحقق العمل', rfAll: 'كلها', rfAny: 'أيًا منها', rfKeep: 'إبقاء الأعمال بلا تقييم', rfKeepHint: 'تبقى في النتائج رغم عدم العثور على درجتها', rfBest: 'الأقرب للبحث', rfShow: 'عرض ⁦%d⁩ من النتائج', rfDone: 'تم', rfChecking: 'جارٍ فحص التقييمات… ⁦%d/%d⁩', rfHidden: 'أخفت التصفية ⁦%d⁩ من النتائج', rfNone: 'لا توجد نتائج بهذا التقييم', rfNoneHint: 'خفّض الدرجة الدنيا أو أوقف أحد التقييمات', rfStart: 'اكتب اسم عمل، أو فعّل تصفية التقييم لتجد الأعمال دون كتابة', rfWalking: 'جارٍ البحث في الأعمال…', rfWent: 'تم فحص ⁦%d⁩ عملًا', rfMore: 'البحث عن المزيد', rfPick: 'مصدر التقييم', rfNoScore: 'بلا تقييم', rfEverywhere: 'البحث في كل الأعمال', rfNotHere: 'لا يوجد تطابق في نتائج التصفية',
    rdOrientationUnavailable: 'لا يدعم المتصفح قفل اتجاه الشاشة هنا', nvProgress: 'تقدم القراءة', novels: 'روايات', nvSearchPh: 'ابحث عن رواية…', nvGenre: 'النوع', nvAuthor: 'المؤلف', nvOngoing: 'مستمرة', nvOther: 'من مصادر أخرى', nvNoCopy: 'هذا الفصل غير متاح في ذلك المصدر', nvLockedRest: 'فصول غير متاحة هنا', nvLockedCh: 'هذا الفصل مقفل في مصدره', nvDone: 'مكتملة', nvSimilar: 'روايات مشابهة', hideNovel: 'إخفاء هذه الرواية', nvNoText: 'نص هذا الفصل غير متاح', nvFinished: 'وصلت إلى آخر فصل متوفر', nvDlNext: n => `تنزيل الفصول التالية (${n})`, minLeft: n => `${n} د متبقية`, minRead: n => `قراءة ${n} د`, minutesN: n => `${n} دقيقة`, rdDisplay: 'العرض', rdIndex: 'الفهرس', rdFont: 'الخط', fontSystem: 'خط الهاتف', fontAmiri: 'أميري', fontAlmarai: 'المراعي', fontTajawal: 'تجوال', paper_black: 'أسود', paper_dim: 'داكن', paper_sepia: 'ورقي', paper_light: 'فاتح', rdSize: 'حجم الخط', rdLine: 'تباعد الأسطر', rdGap: 'تباعد الفقرات', rdMargin: 'الهوامش', rdJustify: 'محاذاة النص من الجانبين', rdIndent: 'مسافة في أول الفقرة', rdBright: 'السطوع', rdAuto: 'تلقائي', rdScroll: 'تمرير', rdPages: 'صفحات', rdRotate: 'اتجاه الشاشة', rotPortrait: 'طولي', rotLand: 'عرضي', rdVolKeys: 'التقليب بأزرار الصوت', rdKeepOn: 'إبقاء الشاشة مضاءة', rdFindPh: 'ابحث في الفصل…', rdMark: 'إشارة مرجعية', rdMarkRemove: 'إزالة الإشارة المرجعية', rdMarkAdded: 'أضيفت إشارة مرجعية', rdMarkRemoved: 'أزيلت الإشارة المرجعية', rdMarks: 'العلامات', rdNoMarks: 'لا توجد علامات بعد. اضغط مطولًا على أي فقرة لإضافة إشارة أو تظليل.', rdHighlight: 'تظليل الفقرة', rdUnhighlight: 'إزالة التظليل', copy: 'نسخ', copied: 'تم النسخ', share: 'مشاركة', ttsListen: 'استماع', ttsReadFrom: 'اقرأ بصوت عالٍ من هنا', ttsNoArabic: 'لا يوجد صوت عربي على هاتفك: ثبّته ثم حاول مجددًا', ttsNone: 'القراءة الصوتية غير متاحة على هذا الهاتف', ttsSpeed: 'السرعة', ttsVoice: 'الصوت', voiceN: n => `صوت ${n}`, ttsSleep: 'إيقاف تلقائي بعد', ttsOff: 'بدون', nextPara: 'الفقرة التالية', prevPara: 'الفقرة السابقة',
    manga: 'مانجا', browseAll: 'تصفح الكل', continueReading: 'تابع القراءة', mHot: 'الأعمال الرائجة', mLatest: 'آخر الفصول', mPopular: 'الأكثر قراءة', mNew: 'أعمال جديدة',
    mSearchPh: 'ابحث عن مانجا أو مانهوا…', mSortNew: 'الأحدث', mSortViews: 'الأكثر قراءة', mSortRating: 'الأعلى تقييمًا', mSortTitle: 'أبجديًا',
    chapter: 'الفصل', chShort: 'ف', chapters: 'الفصول', read: 'ابدأ القراءة', resumeCh: n => `تابع الفصل ${n}`, prevCh: 'الفصل السابق', nextCh: 'الفصل التالي',
    jumpCh: 'انتقل إلى فصل…', readMode: 'قراءة أفقية / عمودية', vertical: 'عمودي', horizontal: 'أفقي', continuous: 'قراءة متواصلة', readingMode: 'طريقة القراءة', nextEp: 'الحلقة القادمة', source: 'المصدر', sourceN: n => `المصدر ${n}`, autoScroll: 'تمرير تلقائي', slower: 'أبطأ', faster: 'أسرع', views: n => `${n} مشاهدة`, noImages: 'لا توجد صفحات في هذا الفصل', endOfChapter: 'نهاية الفصل', chRead: 'مقروء', fullscreen: 'ملء الشاشة', mainServers: 'السيرفرات', backupServers: 'سيرفرات احتياطية', theSite: 'الموقع', backAgain: 'اضغط رجوع مرة أخرى للخروج', lockUi: 'قفل الأزرار', unlockUi: 'إلغاء القفل', scheduleShort: 'المواعيد', cinemaShort: 'أفلام',
    filter: 'تصفية', apply: 'تطبيق', reset: 'إعادة ضبط', all: 'الكل',
    f_sort: 'الترتيب', f_type: 'النوع', f_status: 'الحالة', f_year: 'السنة', f_season: 'الموسم', seasons: 'المواسم', f_version: 'الترجمة',
    f_country: 'البلد', f_source: 'المصدر', f_genres: 'التصنيفات',
    added: n => `تمت إضافة «\u2068${n}\u2069» إلى قائمتي`, hiddenN: n => `أُخفي «\u2068${n}\u2069»`, hiddenTitle: 'العناصر المخفية', hiddenHint: 'اضغط مطولاً على أي بطاقة لإخفائها من كل الصفحات. اضغط ✕ على العنصر هنا لإظهاره مجددًا.', unhide: 'إظهار مجددًا', noHidden: 'لا توجد عناصر مخفية', shown: 'سيظهر مجددًا',
    hideAnime: 'إخفاء هذا الأنمي', hideManga: 'إخفاء هذه المانجا', hideMovie: 'إخفاء هذا الفيلم', hideSeries: 'إخفاء هذا المسلسل', listAdd: 'إضافة إلى قائمتي', listRemove: 'إزالة من قائمتي', openHidden: n => `العناصر المخفية (${n})`, removed: 'تمت الإزالة من قائمتي', ep: 'الحلقة', epShort: 'ح', episode: 'الحلقة', filler: 'حشو', mixed: 'حشو جزئي', hideFiller: 'إخفاء حلقات الحشو', epRatings: 'تقييمات الحلقات', noEpRatings: 'لا تتوفر تقييمات حلقات لهذا العنوان.', titleRatings: 'التقييمات', noRatings: 'لا تتوفر تقييمات لهذا العنوان.', voteShare: 'الأصوات حسب التقييم', seasonShort: 'م', avgShort: 'المعدل', tier0: 'تحفة فنية', tier1: 'مذهل', tier2: 'رائع', tier3: 'جيد', tier4: 'متوسط', tier5: 'سيئ', tier6: 'رديء',
    nothing: 'لا يوجد شيء هنا', tryElse: 'جرّب شيئًا آخر.', unreachable: 'تعذّر الوصول إلى الموقع', retry: 'إعادة المحاولة',
    continueWatching: 'تابع المشاهدة', refreshSite: 'تحديث من الموقع', refresh: 'تحديث', updated: 'تم التحديث', updateTitle: 'تحديث متوفر', updateText: 'يوجد إصدار أحدث من التطبيق. حدّثه الآن، ستبقى بياناتك كما هي.', updateGo: 'تحديث الآن', updateGetting: 'جارٍ التنزيل', updateAllow: 'اسمح للتطبيق بتثبيت التحديثات، ثم اضغط تحديث الآن مرة أخرى', updateFailed: 'تعذّر التحديث، يتم التنزيل من المتصفح',
    feedback: 'ملاحظات وبلاغات', feedbackHint: 'اقتراح أو مشكلة واجهتك؟ اكتبها هنا وستصلنا مباشرة.', feedbackEmail: 'بريدك الإلكتروني (اختياري، لنرد عليك)', feedbackMsg: 'اكتب رسالتك…', feedbackSend: 'إرسال', feedbackSending: 'جارٍ الإرسال…', feedbackSent: 'تم إرسال رسالتك، شكرًا لك', feedbackFailed: 'تعذّر الإرسال، حاول مرة أخرى',
    play: 'تشغيل', moreInfo: 'المزيد', details: 'التفاصيل', charactersCast: 'الشخصيات والممثلون', viewAllCast: 'عرض الكل', enlargeImage: 'عرض الصورة بحجم كامل', loadMoreCast: 'تحميل المزيد', castSearch: 'ابحث عن شخصية أو ممثل…', loadingCast: 'جارٍ تحميل الشخصيات…', noCast: 'لا تتوفر معلومات عن الشخصيات لهذا العنوان.', castUnavailable: 'تعذّر تحميل الشخصيات حالياً.', japaneseVoice: 'الصوت الياباني', actor: 'الممثل', prev: 'السابق', next: 'التالي',
    results: q => `نتائج البحث عن «${q}»`, listEmpty: 'قائمتك فارغة', listHint: 'اضغط + على أي بطاقة لتحفظها هنا، وتعود إليها متى شئت.',
    resume: e => `متابعة الحلقة ${e}`, inList: 'في قائمتي', sound: 'الصوت', homeNovels: 'روايات رائجة', homeTopNovels: 'أكثر الروايات قراءة', homeTopMovies: 'أفضل الأفلام تقييماً', homeTopSeries: 'أفضل المسلسلات تقييماً', trailer: 'الإعلان', episodes: 'الحلقات', loadingEpisodes: 'جارٍ تحميل بقية الحلقات…', moreEpisodes: 'عرض المزيد من الحلقات', holdOn: 'لحظة من فضلك، التحميل يستغرق وقتاً أطول من المعتاد…', episodesShown: (n, total) => `عرض ${n} من ${total} حلقة`, jump: 'انتقل إلى حلقة…', moreLike: 'أعمال مشابهة',
    back: 'رجوع (Esc)', loadingServers: 'جارٍ تحميل السيرفرات…', openBrowser: 'فتح في المتصفح', adBlockOn: 'حظر الإعلانات: مفعّل', adBlockOff: 'حظر الإعلانات: متوقف', adBlockHint: 'إن رفض السيرفر العمل مع حظر الإعلانات، أوقفه له من هنا', adBlockStopped: 'أُوقف حظر الإعلانات لهذا السيرفر', adBlockStarted: 'حظر الإعلانات مفعّل لهذا السيرفر', openBrowserTip: 'إذا لم يعمل المشغّل داخل التطبيق', cast: 'عرض على التلفاز', casting: 'يُعرض الآن على التلفاز', plyr: { restart: 'من البداية', rewind: 'رجوع {seektime} ث', play: 'تشغيل', pause: 'إيقاف مؤقت', fastForward: 'تقديم {seektime} ث', seek: 'انتقال', seekLabel: '{currentTime} من {duration}', played: 'تم تشغيله', buffered: 'محمّل', currentTime: 'الوقت الحالي', duration: 'المدة', volume: 'الصوت', mute: 'كتم الصوت', unmute: 'تشغيل الصوت', pip: 'صورة داخل صورة', enterFullscreen: 'ملء الشاشة', exitFullscreen: 'إنهاء ملء الشاشة', settings: 'الإعدادات', menuBack: 'رجوع', speed: 'السرعة', normal: 'عادية' }, castLooking: 'جارٍ إرسال الفيديو إلى التلفاز…', castNoFile: 'لا يوجد ملف لهذه الحلقة يمكن تشغيله على التلفاز', castNoTv: 'لم يُعثر على تلفاز على هذه الشبكة', castBrowser: 'العرض على التلفاز يعمل في Chrome أو Edge', castPlayFirst: 'شغّل الفيديو هنا أولاً، ثم اعرضه على التلفاز', castHost: 'لا يمكن عرض هذا السيرفر على التلفاز من المتصفح، اختر سيرفراً آخر', castWifi: 'اتصل بشبكة الواي فاي نفسها التي يتصل بها التلفاز', castFailed: 'تعذّر التشغيل على التلفاز، جرّب سيرفراً آخر',
    // witanime's row headings, always Arabic and vague: its heading stays the row's key (SECTIONS), this is what's shown
    'الأكثر مشاهدة': 'أكثر حلقات الأنمي مشاهدة',
    'أحدث الحلقات': 'أحدث حلقات الأنمي',
    'أحدث الأفلام': 'أحدث أفلام الأنمي',
    'أكثر الأنميات مشاهدة': 'أكثر الأنميات مشاهدة',
    'أكثر الأفلام مشاهدة': 'أكثر أفلام الأنمي مشاهدة',
    'أشهر أنميات الموسم': 'أشهر أنميات الموسم',
    genreRow: g => `أنمي ${g}`, becauseWatched: n => `لأنك شاهدت «\u2068${n}\u2069»`, // the website's feed (risto.js)
homeHotManga: 'المانجا الرائجة', homeLatestManga: 'أحدث فصول المانجا', homeHotNovels: 'الروايات الرائجة', homeLatestNovels: 'أحدث فصول الروايات', epFinal: 'والأخيرة',
    prevEp: 'الحلقة السابقة', nextEp: 'الحلقة التالية', skipIntro: 'تخطي المقدمة', playback: 'تشغيل الفيديو', heroTrailerSet: 'تشغيل المقطع الدعائي تلقائياً في الواجهة', skipIntroSet: 'زر تخطي المقدمة', skipIntroHint: 'يظهر زر لتخطي مقدمة الحلقة أثناء عرضها.', chooseServer: 'اختر سيرفرًا', searchingServers: 'جارٍ البحث عن سيرفرات…', searching: 'جارٍ البحث…',
    server: 'سيرفر', noneWorked: 'لم يعمل أي سيرفر', noneWorkedHint: 'جرّب سيرفرًا آخر من القائمة أو افتح الحلقة في المتصفح.',
    rateLimited: 'الموقع يطلب الانتظار قليلًا', rateLimitedHint: 'طلبات كثيرة في وقت قصير. انتظر دقيقة أو دقيقتين ثم أعد المحاولة.', noServers: 'لا توجد سيرفرات لهذه الحلقة', noServersHint: 'لم يتم العثور عليها في أي مصدر.', noServersEdHint: 'لم يتم العثور عليها في المصدر.', verify: 'التحقق من الوصول', verifyFailed: 'لم يكتمل التحقق', today: 'اليوم',
    downloads: 'التنزيلات', download: 'تحميل الحلقة', dlPreparing: 'جارٍ تجهيز التحميل…', dlStarted: 'بدأ التحميل', dlFinished: n => `اكتمل تحميل «\u2068${n}\u2069»`,
    dlFailed: 'فشل التحميل', dlNoHost: 'لا يوجد رابط تحميل مدعوم لهذه الحلقة (MediaFire)', dlActive: 'الحلقة قيد التحميل بالفعل', dlDone: 'الحلقة محمّلة بالفعل',
    dlCancelled: 'أُلغي التحميل', dlNotifActive: 'جارٍ تحميل الحلقات', dlNotifMany: '%d حلقات', dlNotifDone: 'اكتمل التحميل', dlNotifAsk: 'فعّل الإشعارات لترى تقدّم التحميل', notify: 'نبّهني', notifying: 'التنبيه مفعّل', notifyAdded: n => `ستصلك إشعارات بجديد «\u2068${n}\u2069»`, notifyRemoved: 'أُوقفت الإشعارات', notifyStop: 'إيقاف التنبيه', notifyAsk: 'فعّل الإشعارات لتصلك الحلقات والفصول الجديدة', notifyTitle: 'الإشعارات', notifyHint: 'اضغط «نبّهني» في صفحة أي أنمي أو مسلسل أو مانجا لتصلك إشعارات بحلقاته أو فصوله الجديدة.', notifyMovies: 'الأفلام الجديدة', newEp: n => `حلقة جديدة: ${n}`, newCh: n => `فصل جديد: ${n}`, newMovie: 'فيلم جديد', newMovies: n => `${n} أفلام جديدة`, downloadShort: 'تحميل', playOffline: 'تشغيل النسخة المحمّلة', inApp: 'داخل التطبيق', browser: 'المتصفح', dlNone: 'لا توجد روابط تحميل', openedBrowser: 'تم الفتح في المتصفح', dlOpenList: 'قيد التحميل · عرض التنزيلات', del: 'حذف', offline: 'بدون إنترنت', noDownloads: 'لا توجد تنزيلات', noDownloadsHint: 'افتح أي حلقة أو فصل واضغط زر التحميل.',
    dlQueued: 'في الانتظار', dlPaused: 'متوقف مؤقتًا', pauseAll: 'إيقاف الكل مؤقتًا', resumeAll: 'استئناف الكل', dlPausedAll: 'التحميلات متوقفة مؤقتًا', confirmDel: n => `حذف «\u2068${n}\u2069»؟`, confirmDelAll: n => `حذف كل تنزيلات هذا العمل (${n})؟`, confirmDelHint: 'سيُحذف الملف المحمّل من الجهاز، ولا يمكن التراجع.', showPause: 'إيقاف مؤقت', showResume: 'استئناف', dlQueuedN: n => `أُضيف ${n} للتحميل`, pagesOf: (r, n) => `${r} / ${n} صفحة`, pagesN: n => `${n} صفحة`,
    epCount: n => `${n} حلقة`, chCount: n => `${n} فصل`, dlActiveN: n => `${n} قيد التحميل`, deleteAll: 'حذف الكل', kindAnime: 'أنمي',
    markRead: 'تحديد كمقروء', markUnread: 'تحديد كغير مقروء', markPrevRead: 'تحديد الفصول السابقة كمقروءة', markWatched: 'تحديد كمُشاهَد', markUnwatched: 'تحديد كغير مُشاهَد', delDownload: 'حذف التنزيل',
    select: 'تحديد', autoDl: 'تحميل الحلقات الجديدة تلقائيًا', autoDlHint: 'فعّل «تحميل تلقائي» من قائمة ⋮ في صفحة أي أنمي أو مانجا لتُحمَّل حلقاته أو فصوله الجديدة فور صدورها.', autoDlShort: 'تحميل تلقائي', autoDlAdded: n => `سيُحمَّل جديد «\u2068${n}\u2069» تلقائيًا`, autoDlRemoved: 'أُوقف التحميل التلقائي', downloadAll: 'تحميل الكل', downloadAllAsk: n => `تحميل كل ما لم يُحمَّل بعد (${n})؟`, actions: 'إجراءات', delDownloads: 'حذف التنزيلات', confirmDelN: n => `حذف ${n} من التنزيلات؟`,
    selectedN: n => `${n} محدد`, selectAll: 'تحديد الكل',
    schedSearch: 'ابحث عن أنمي في المواعيد…', schedNone: 'غير موجود في مواعيد هذا الأسبوع', schedNoneHint: 'جرّب اسمه بالإنجليزية أو اليابانية.',
  },
  en: {
    home: 'Home', anime: 'Anime', remove: 'Remove', series: 'Series', movies: 'Anime Movies', cinema: 'Movies & TV', dubbed: 'Dubbed', schedule: 'Anime Schedule', myList: 'My List', searchPh: 'Titles, series, movies…', listSearchPh: 'Search my list…', cancel: 'Cancel', clear: 'Clear',
    settings: 'Settings', more: 'More', storage: 'App folder', storageHint: 'Keep downloads, settings, your list and watch history in a MEDFLIX folder on the phone, so they survive uninstalling and reinstalling the app.', storageAllow: 'Allow access', storageOn: 'Active', storageOff: 'Needs all-files access', storageReady: 'Your data is now saved in the MEDFLIX folder', storageAsk: 'Allow file access so your list, watch history, settings and downloads are kept in a MEDFLIX folder on the phone. They then survive uninstalling the app, and come back when you reinstall and allow access again.', later: 'Later', close: 'Close', reverse: 'Reverse order', dockTitle: 'Bottom bar buttons', dockHint: "Pick up to 5 buttons for the phone's bottom bar; everything else is in the side menu ☰.",
    dataTitle: 'Your data', dataHint: 'Your list, watch history and settings are kept in this browser only. Save a copy to move them to another device or bring them back later.', backup: 'Save a copy of my data', restore: 'Restore a saved copy', restored: 'Your data was restored', restoreBad: 'This file isn’t a copy of your data', clearCache: 'Clear cached images & pages', getApp: 'Android app', getAppHint: 'Downloads, casting to TV, and every anime source.', getAppBtn: 'Get the app', interfaceLang: 'Interface language', runtime: (h, m) => [h && `${h}h`, m && `${m}m`].filter(Boolean).join(' '),
    inDock: 'In the bar', available: 'Other buttons', dockFull: 'The bar is full: remove one first', dockMin: 'Keep at least one button', language: 'Language',
    moveUp: 'Move up', moveDown: 'Move down', removeDock: 'Remove from bar', addDock: 'Add to bar',
    rfChip: 'Rating', rfTitle: 'Filter by rating', rfHint: 'Turn on the scores you care about and set the lowest you\'ll accept. Your choices are kept.', rfFilms: 'Films & series', rfAnime: 'Anime & manga', rfMatch: 'A title must pass', rfAll: 'All of them', rfAny: 'Any of them', rfKeep: 'Keep titles with no score', rfKeepHint: 'They stay in the results when no score is found', rfBest: 'Best match', rfShow: 'Show ⁦%d⁩ results', rfDone: 'Done', rfChecking: 'Checking scores… ⁦%d/%d⁩', rfHidden: '%d hidden by your filter', rfNone: 'No results at this rating', rfNoneHint: 'Lower the minimum or turn a score off', rfStart: 'Type a title, or turn on a rating filter to find titles without typing', rfWalking: 'Looking through titles…', rfWent: 'Checked ⁦%d⁩ titles', rfMore: 'Find more', rfPick: 'Rating from', rfNoScore: 'No score', rfEverywhere: 'Search all titles', rfNotHere: 'Nothing in these filtered results matches',
    rdOrientationUnavailable: 'This browser cannot lock the screen orientation here', nvProgress: 'Reading progress', novels: 'Novels', nvSearchPh: 'Search novels…', nvGenre: 'Genre', nvAuthor: 'Author', nvOngoing: 'Ongoing', nvOther: 'From other sources', nvNoCopy: "This chapter isn't available from that source", nvLockedRest: 'Chapters not available here', nvLockedCh: 'This chapter is locked at its source', nvDone: 'Completed', nvSimilar: 'Similar novels', hideNovel: 'Hide this novel', nvNoText: "This chapter's text isn't available", nvFinished: 'That was the latest chapter', nvDlNext: n => `Download next chapters (${n})`, minLeft: n => `${n} min left`, minRead: n => `${n} min read`, minutesN: n => `${n} min`, rdDisplay: 'Display', rdIndex: 'Contents', rdFont: 'Font', fontSystem: 'System font', fontAmiri: 'Amiri', fontAlmarai: 'Almarai', fontTajawal: 'Tajawal', paper_black: 'Black', paper_dim: 'Dark', paper_sepia: 'Sepia', paper_light: 'Light', rdSize: 'Text size', rdLine: 'Line spacing', rdGap: 'Paragraph spacing', rdMargin: 'Margins', rdJustify: 'Justify text', rdIndent: 'Indent paragraphs', rdBright: 'Brightness', rdAuto: 'Auto', rdScroll: 'Scroll', rdPages: 'Pages', rdRotate: 'Screen orientation', rotPortrait: 'Portrait', rotLand: 'Landscape', rdVolKeys: 'Turn with volume keys', rdKeepOn: 'Keep screen on', rdFindPh: 'Search this chapter…', rdMark: 'Bookmark', rdMarkRemove: 'Remove bookmark', rdMarkAdded: 'Bookmark added', rdMarkRemoved: 'Bookmark removed', rdMarks: 'Marks', rdNoMarks: 'No marks yet. Long-press any paragraph to bookmark or highlight it.', rdHighlight: 'Highlight paragraph', rdUnhighlight: 'Remove highlight', copy: 'Copy', copied: 'Copied', share: 'Share', ttsListen: 'Listen', ttsReadFrom: 'Read aloud from here', ttsNoArabic: 'No Arabic voice on this device: install one, then try again', ttsNone: "Reading aloud isn't available in this browser", ttsSpeed: 'Speed', ttsVoice: 'Voice', voiceN: n => `Voice ${n}`, ttsSleep: 'Stop after', ttsOff: 'Off', nextPara: 'Next paragraph', prevPara: 'Previous paragraph',
    manga: 'Manga', browseAll: 'Browse all', continueReading: 'Continue Reading', mHot: 'Trending', mLatest: 'Latest Chapters', mPopular: 'Most Read', mNew: 'New Series',
    mSearchPh: 'Search manga, manhwa…', mSortNew: 'Newest', mSortViews: 'Most read', mSortRating: 'Top rated', mSortTitle: 'A-Z',
    chapter: 'Chapter', chShort: 'Ch', chapters: 'Chapters', read: 'Start reading', resumeCh: n => `Resume Ch ${n}`, prevCh: 'Previous chapter', nextCh: 'Next chapter',
    jumpCh: 'Jump to chapter…', readMode: 'Horizontal / vertical reading', vertical: 'Vertical', horizontal: 'Horizontal', continuous: 'Continuous reading', readingMode: 'Reading mode', nextEp: 'Next episode', source: 'Source', sourceN: n => `Source ${n}`, autoScroll: 'Auto-scroll', slower: 'Slower', faster: 'Faster', views: n => `${n} views`, noImages: 'This chapter has no pages', endOfChapter: 'End of chapter', chRead: 'Read', fullscreen: 'Fullscreen', mainServers: 'Servers', backupServers: 'Backup servers', theSite: 'the site', backAgain: 'Press back again to leave', lockUi: 'Lock controls', unlockUi: 'Unlock', scheduleShort: 'Schedule', cinemaShort: 'Movies',
    filter: 'Filters', apply: 'Apply', reset: 'Reset', all: 'All',
    f_sort: 'Sort', f_type: 'Type', f_status: 'Status', f_year: 'Year', f_season: 'Season', seasons: 'Seasons', f_version: 'Language',
    f_country: 'Country', f_source: 'Source', f_genres: 'Genres',
    added: n => `Added “\u2068${n}\u2069” to My List`, hiddenN: n => `Hid “\u2068${n}\u2069”`, hiddenTitle: 'Hidden items', hiddenHint: 'Long-press any card to hide it from every page. Press ✕ on an item here to show it again.', unhide: 'Show again', noHidden: 'Nothing hidden', shown: 'It will show again',
    hideAnime: 'Hide this anime', hideManga: 'Hide this manga', hideMovie: 'Hide this movie', hideSeries: 'Hide this series', listAdd: 'Add to My List', listRemove: 'Remove from My List', openHidden: n => `Hidden items (${n})`, removed: 'Removed from My List', ep: 'EP', epShort: 'Ep', episode: 'Episode', filler: 'Filler', mixed: 'Part filler', hideFiller: 'Hide filler', epRatings: 'Episode ratings', noEpRatings: 'No episode ratings for this title.', titleRatings: 'Ratings', noRatings: 'No ratings for this title.', voteShare: 'Votes by score', seasonShort: 'S', avgShort: 'AVG', tier0: 'Absolute Cinema', tier1: 'Awesome', tier2: 'Great', tier3: 'Good', tier4: 'Average', tier5: 'Bad', tier6: 'Garbage',
    nothing: 'Nothing here', tryElse: 'Try something else.', unreachable: "Couldn't reach the site", retry: 'Retry',
    continueWatching: 'Continue Watching', refreshSite: 'Refresh from site', refresh: 'Refresh', updated: 'Updated', updateTitle: 'Update available', updateText: 'A newer version of the app is out. Update now; your data stays.', updateGo: 'Update now', updateGetting: 'Downloading', updateAllow: 'Allow the app to install updates, then tap Update now again', updateFailed: 'Update failed, downloading in the browser instead',
    feedback: 'Feedback & issues', feedbackHint: 'An idea, or something not working? Write it here and it reaches us directly.', feedbackEmail: 'Your email (optional, for a reply)', feedbackMsg: 'Write your message…', feedbackSend: 'Send', feedbackSending: 'Sending…', feedbackSent: 'Message sent, thank you', feedbackFailed: 'Could not send, try again',
    play: 'Play', moreInfo: 'More Info', details: 'Details', charactersCast: 'Characters & cast', viewAllCast: 'View all', enlargeImage: 'View image fullscreen', loadMoreCast: 'Load more', castSearch: 'Search characters or actors…', loadingCast: 'Loading characters…', noCast: 'Character and cast information is not available for this title.', castUnavailable: 'Character information could not be loaded right now.', japaneseVoice: 'Japanese voice', actor: 'Actor', prev: 'Prev', next: 'Next',
    results: q => `Results for “${q}”`, listEmpty: 'Your list is empty', listHint: 'Press + on any card to save it here and come back to it anytime.',
    resume: e => `Resume Ep ${e}`, inList: 'In My List', sound: 'Sound', homeNovels: 'Trending novels', homeTopNovels: 'Most read novels', homeTopMovies: 'Top rated movies', homeTopSeries: 'Top rated series', trailer: 'Trailer', episodes: 'Episodes', loadingEpisodes: 'Loading remaining episodes…', moreEpisodes: 'Show more episodes', holdOn: 'Hold on a little, this is taking longer than usual…', episodesShown: (n, total) => `Showing ${n} of ${total} episodes`, jump: 'Jump to ep…', moreLike: 'More Like This',
    back: 'Back (Esc)', loadingServers: 'Loading servers…', openBrowser: 'Open in browser', adBlockOn: 'Ad blocker: on', adBlockOff: 'Ad blocker: off', adBlockHint: 'If a server refuses to play with the ad blocker, turn it off for it here', adBlockStopped: 'Ad blocker off for this server', adBlockStarted: 'Ad blocker on for this server', openBrowserTip: "If the in-app player won't load", cast: 'Cast to TV', casting: 'Playing on the TV', plyr: { restart: 'Restart', rewind: 'Back {seektime}s', play: 'Play', pause: 'Pause', fastForward: 'Forward {seektime}s', seek: 'Seek', seekLabel: '{currentTime} of {duration}', played: 'Played', buffered: 'Buffered', currentTime: 'Current time', duration: 'Duration', volume: 'Volume', mute: 'Mute', unmute: 'Unmute', pip: 'Picture in picture', enterFullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', settings: 'Settings', menuBack: 'Back', speed: 'Speed', normal: 'Normal' }, castLooking: 'Sending the video to the TV…', castNoFile: 'No file of this episode can play on a TV', castNoTv: 'No TV found on this network', castBrowser: 'Casting works in Chrome or Edge', castPlayFirst: 'Start the video here first, then cast it', castHost: 'This server can’t be cast from the browser: pick another one', castWifi: 'Connect to the same Wi-Fi as the TV', castFailed: "Couldn't play it on the TV, try another server",
homeHotManga: 'Trending manga', homeLatestManga: 'Latest manga chapters', homeHotNovels: 'Trending novels', homeLatestNovels: 'Latest novel chapters', epFinal: '(final)',
    prevEp: 'Previous', nextEp: 'Next', skipIntro: 'Skip intro', playback: 'Playback', heroTrailerSet: 'Auto-play trailers in the home carousel', skipIntroSet: 'Skip intro button', skipIntroHint: "Shows a button to skip an episode's opening while it plays.", chooseServer: 'Choose server', searchingServers: 'Searching servers…', searching: 'Searching…',
    server: 'Server', noneWorked: 'No server worked', noneWorkedHint: 'Try another one above, or open in browser.',
    rateLimited: 'The site asks to slow down', rateLimitedHint: 'Too many requests in a short time. Wait a minute or two, then retry.', noServers: 'No servers for this episode', noServersHint: 'Not found on any source.', noServersEdHint: 'Not found on the source.', verify: 'Verify access', verifyFailed: 'Check not passed', today: 'Today',
    downloads: 'Downloads', download: 'Download episode', dlPreparing: 'Preparing download…', dlStarted: 'Download started', dlFinished: n => `Downloaded “\u2068${n}\u2069”`,
    dlFailed: 'Download failed', dlNoHost: 'No supported download link for this episode (MediaFire)', dlActive: 'Already downloading', dlDone: 'Already downloaded',
    dlCancelled: 'Download cancelled', dlNotifActive: 'Downloading', dlNotifMany: '%d episodes', dlNotifDone: 'Download complete', dlNotifAsk: 'Turn on notifications to see download progress', notify: 'Notify me', notifying: 'Notifying', notifyAdded: n => `You'll be notified of new “\u2068${n}\u2069”`, notifyRemoved: 'Notifications off', notifyStop: 'Stop notifying', notifyAsk: 'Turn on notifications to get new episodes and chapters', notifyTitle: 'Notifications', notifyHint: 'Tap Notify me on any anime, series or manga page to get its new episodes or chapters.', notifyMovies: 'New movies', newEp: n => `New episode: ${n}`, newCh: n => `New chapter: ${n}`, newMovie: 'New movie', newMovies: n => `${n} new movies`, downloadShort: 'Download', playOffline: 'Play downloaded copy', inApp: 'In app', browser: 'Browser', dlNone: 'No download links', openedBrowser: 'Opened in browser', dlOpenList: 'Downloading · open Downloads', del: 'Delete', offline: 'Offline', noDownloads: 'No downloads yet', noDownloadsHint: 'Open any episode or chapter and press the download button.',
    dlQueued: 'Queued', dlPaused: 'Paused', pauseAll: 'Pause all', resumeAll: 'Resume all', dlPausedAll: 'Downloads are paused', confirmDel: n => `Delete “\u2068${n}\u2069”?`, confirmDelAll: n => `Delete all ${n} downloads of this show?`, confirmDelHint: 'The downloaded files are removed from this device. This can’t be undone.', showPause: 'Pause', showResume: 'Resume', dlQueuedN: n => `${n} added to downloads`, pagesOf: (r, n) => `${r} / ${n} pages`, pagesN: n => `${n} pages`,
    epCount: n => `${n} episodes`, chCount: n => `${n} chapters`, dlActiveN: n => `${n} downloading`, deleteAll: 'Delete all', kindAnime: 'Anime',
    markRead: 'Mark as read', markUnread: 'Mark as unread', markPrevRead: 'Mark earlier chapters as read', markWatched: 'Mark as watched', markUnwatched: 'Mark as unwatched', delDownload: 'Delete download',
    select: 'Select', autoDl: 'Auto-download new episodes', autoDlHint: 'Turn on Auto-download in the ⋮ menu of any anime or manga page to download its new episodes or chapters as they come out.', autoDlShort: 'Auto-download', autoDlAdded: n => `New releases of “\u2068${n}\u2069” will download automatically`, autoDlRemoved: 'Auto-download off', downloadAll: 'Download all', downloadAllAsk: n => `Download everything not saved yet (${n})?`, actions: 'Actions', delDownloads: 'Delete downloads', confirmDelN: n => `Delete ${n} downloads?`,
    selectedN: n => `${n} selected`, selectAll: 'Select all',
    schedSearch: 'Find a show in the schedule…', schedNone: 'Not on this week’s schedule', schedNoneHint: 'Try its English or Japanese name.',
    // the site's own section titles
    'الأكثر مشاهدة': 'Most watched anime episodes', 'أحدث الحلقات': 'Latest anime episodes', 'أحدث الأفلام': 'Latest anime movies', 'تابع المشاهدة': 'Continue Watching',
    'أكثر الأنميات مشاهدة': 'Most watched anime', 'أكثر الأفلام مشاهدة': 'Most watched anime movies', 'أشهر أنميات الموسم': 'Top anime this season',
    genreRow: g => `\u2068${g}\u2069 anime`, becauseWatched: n => `Because you watched \u2068${n}\u2069`,
  },
};
let lang = 'en';
// t('key') or t('key', args…); unknown keys (e.g. untranslated site text) come back as-is
if (api.web) { Object.assign(STR.ar,WebDownloads.strings.ar); Object.assign(STR.en,WebDownloads.strings.en); }
const t = (k, ...a) => { const v = STR[lang][k] ?? k; return typeof v === 'function' ? v(...a) : v; };
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => el.textContent = t(el.dataset.t));
  document.querySelectorAll('[data-tp]').forEach(el => el.placeholder = t(el.dataset.tp));
  document.querySelectorAll('[data-ta]').forEach(el => el.ariaLabel = t(el.dataset.ta));
  renderNav();
  document.querySelectorAll('.lang [data-l]').forEach(b => {
    const selected = b.dataset.l === lang;
    b.classList.toggle('on', selected); b.setAttribute('aria-pressed', String(selected));
  });
}
function setLanguage(next) {
  if (!['ar', 'en'].includes(next) || next === lang) return;
  lang = store.prefs.lang = next; persist('prefs');
  applyLang(); route();
  if (settingsModal()) settingsView(settingsModal()); // the modal, drawn again in it
}
document.addEventListener('click', e => { // the drawer and settings use the same saved preference as the native selector
  const next = e.target.closest('.lang [data-l]')?.dataset.l;
  if (next) setLanguage(next);
});

// ---------- navigation ----------
// Desktop: every section in the top bar. Phones: a dock with up to DOCK_MAX of them (chosen in settings), and ☰ in the top bar
// opens a drawer with everything.
const NAV = [
  { id: 'home', href: '#/' },
  { id: 'anime', href: '#/anime' },
  { id: 'cinema', href: '#/cinema' },
  { id: 'manga', href: '#/manga' },
  ...(api.web ? [{ id: 'novels', href: '#/novels' }] : []),
  { id: 'schedule', href: '#/schedule' },
  { id: 'myList', href: '#/list' },
  ...(api.web ? [] : [{ id: 'downloads', href: '#/downloads' }]),
];
const DOCK_MAX = 5, DOCK_DEFAULT = ['home', 'anime', 'manga', 'cinema']; // novels is also available through the drawer on phones
const dockLabel = id => t(id === 'schedule' ? 'scheduleShort' : id === 'cinema' ? 'cinemaShort' : id); // a fifth of the screen
const navSvg = id => ICON[id === 'anime' ? 'series' : id === 'novels' ? 'novel' : id]; // nav icons share the section ids
const navItem = id => NAV.find(n => n.id === id);
// series and movies were one section each before Anime held both
const dockIds = () => [...new Set((store.prefs.dock?.length ? store.prefs.dock : DOCK_DEFAULT).map(id => id === 'series' || id === 'movies' ? 'anime' : id))].filter(navItem);
function renderNav() {
  const dock = dockIds();
  $('#links').innerHTML = NAV.map(n => `<a href="${n.href}" class="${dock.includes(n.id) ? 'dock' : ''}" style="--o:${dock.indexOf(n.id)}">${navSvg(n.id)}`
      + (n.id === 'schedule' || n.id === 'cinema' ? `<span class="long">${t(n.id)}</span><span class="short">${dockLabel(n.id)}</span>` : `<span>${t(n.id)}</span>`) + '</a>').join('');
  $('#drawer').innerHTML = `<div class="dr-head"><a href="#/" class="logo">${ICON.logo}<span class="logo-word" aria-hidden="true">edFlix</span></a><button class="icon-btn" id="drClose" data-ta="close" aria-label="${t('close')}">${ICON.x}</button></div>
    <nav class="dr-links">${NAV.map(n => `<a href="${n.href}">${navSvg(n.id)}<span>${t(n.id)}</span></a>`).join('')}</nav>
    <div class="dr-sep"></div>
    <nav class="dr-links"><a href="#/settings">${ICON.settings}<span>${t('settings')}</span></a><button type="button" id="drFeedback">${ICON.info}<span>${t('feedback')}</span></button></nav>
    <div class="dr-language"><span class="dr-language-label">${ICON.textAa}${t('language')}</span>
      <div class="lang dr-lang" role="group" aria-label="${t('interfaceLang')}">
        <button type="button" data-l="ar" lang="ar" aria-pressed="${lang === 'ar'}" class="${lang === 'ar' ? 'on' : ''}"><span>العربية</span><i class="language-check">${ICON.check}</i></button>
        <button type="button" data-l="en" lang="en" aria-pressed="${lang === 'en'}" class="${lang === 'en' ? 'on' : ''}"><span>English</span><i class="language-check">${ICON.check}</i></button>
      </div></div>`;
  markActive();
}
function markActive() {
  let a = (location.hash.split('/')[1] || '').split('?')[0];
  if (a === 'browse' || a === 'movies' || a === 'section') a = 'anime'; // pages inside the Anime section
  document.querySelectorAll('.links a, .dr-links a').forEach(l => l.classList.toggle('active', l.getAttribute('href').split('/')[1] === a));
}
const closeDrawer = () => document.body.classList.contains('drawer-open') && (document.body.classList.remove('drawer-open'), true);
document.addEventListener('click', e => {
  if (e.target.closest('#dockMore')) document.body.classList.add('drawer-open');
  else if (e.target.closest('#drClose, #drawer-bg')) closeDrawer();
  else if (e.target.closest('#drFeedback')) { closeDrawer(); feedbackSheet(); }
});
// while the drawer or a sheet is open, a drag anywhere but its own list doesn't scroll the page behind
// (Android ignores overflow: hidden for touch scrolling)
document.addEventListener('touchmove', e => {
  if (document.body.classList.contains('drawer-open') ? !e.target.closest('#drawer') : $('.sheet-wrap') && !e.target.closest('.sheet-list, .sheet .genres, .sheet .eg-scroll')) e.preventDefault();
}, { passive: false });
// phones: a sideways swipe drags the drawer open (from the half of the screen on its side) or closed; it follows the finger
{
  let x0 = null, y0, dx, open0;
  const dr = $('#drawer'), bg = $('#drawer-bg'), dir = () => (document.dir === 'rtl' ? -1 : 1); // 1: drawer on the left
  addEventListener('touchstart', e => {
    if (e.touches.length > 1) return; // a second finger: the drag in progress carries on (dropping it here left the drawer stuck halfway)
    x0 = null;
    const x = e.touches[0].clientX, open = document.body.classList.contains('drawer-open');
    const nearSide = dir() > 0 ? x < innerWidth * .4 : x > innerWidth * .6;
    if (innerWidth > 760 || !(open || nearSide) || $('.player, .reader, .sheet-wrap, .dd.open, body.searching')
      || e.target.closest('.track, .fchips, .hero, input')) return; // those swipe sideways themselves
    x0 = x; y0 = e.touches[0].clientY; dx = null; open0 = open;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (x0 === null) return;
    const d = (e.touches[0].clientX - x0) * dir(), dy = Math.abs(e.touches[0].clientY - y0); // d > 0: toward open
    if (dx === null) { // decide once: sideways drags the drawer, anything else is a scroll
      if (Math.abs(d) < 10 && dy < 10) return;
      if (dy > Math.abs(d) || (!open0 && d < 0)) return void (x0 = null);
    }
    dx = d;
    const w = dr.offsetWidth, off = Math.min(0, Math.max(-w, (open0 ? 0 : -w) + d)); // 0 = fully open
    dr.style.transition = bg.style.transition = 'none';
    dr.style.transform = `translateX(${off * dir()}px)`;
    bg.style.opacity = 1 + off / w;
  }, { passive: true });
  // touchcancel: the system took the touch over mid-drag (Android's edge back gesture, which may have closed the drawer
  // already); without this it stayed where the finger left it. It just goes back to its open/closed state
  const settle = e => {
    if (x0 === null || dx === null) return void (x0 = null);
    x0 = null;
    dr.removeAttribute('style'); bg.removeAttribute('style'); // the CSS transition finishes the slide from where the finger left it
    if (e.type === 'touchend') document.body.classList.toggle('drawer-open', open0 ? dx > -60 : dx > 60);
  };
  addEventListener('touchend', settle);
  addEventListener('touchcancel', settle);
}

// phones: the MEDFLIX folder (see DownloaderPlugin) — its path, and a button to grant access until it's on
let storageWas = null;
// checks access; the moment it's granted, either restores what an earlier install left in the folder or fills it
async function checkStorage() {
  const s = await api.storage?.().catch(() => null);
  if (!s) return null;
  const was = storageWas;
  storageWas = s.granted;
  // just granted, or granted outside the app before it ever filled the folder
  if (s.granted && (was === false || (was === null && !s.hasData))) {
    if (s.hasData) { location.reload(); return s; } // data from before a reinstall: load it rather than overwrite it
    for (const k of Object.keys(store)) api.set(k, store[k]); // first time: copy everything over now
    toast(t('storageReady'));
  }
  return s;
}
async function drawStorage() {
  const s = await checkStorage(), box = $('#stor');
  if (!s || !box) return;
  box.innerHTML = `<div class="set-row ${s.granted ? 'on' : ''}">${ICON.folder}<span><b dir="ltr">${esc(s.path)}</b><small>${s.granted ? t('storageOn') : t('storageOff')}</small></span>
    ${s.granted ? '' : `<button class="btn red small" id="storGo">${t('storageAllow')}</button>`}</div>`;
  if ($('#storGo')) $('#storGo').onclick = () => api.requestStorage();
}
// coming back from Android's permission page, whichever screen asked
document.addEventListener('visibilitychange', () => !document.hidden && ($('#stor') ? drawStorage() : checkStorage()));
// Android takes the permission away on uninstall, so a fresh install has nothing until it's granted again:
// ask right away (once per install) instead of leaving it to be found in Settings
function storageSheet() {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet"><div class="sheet-head"><b>${t('storage')}</b><button class="sheet-x" type="button" aria-label="${t('close')}">${ICON.x}</button></div>
    <p class="sheet-text">${t('storageAsk')}</p>
    <div class="sheet-foot"><button class="btn ghost" type="button" data-a="later">${t('later')}</button><button class="btn red" type="button" data-a="allow">${ICON.folder} ${t('storageAllow')}</button></div></div>`;
  document.body.append(w);
  requestAnimationFrame(() => w.classList.add('open'));
  w.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'allow') api.requestStorage();
    if (a || e.target === w || e.target.closest('.sheet-x')) { store.prefs.storageAsked = 1; persist('prefs'); closeSheet(); }
  };
}
// a show's episode ratings (Ratings.graph), a grid to open: the sites are asked only then
function ratingsSheet(names, id, anime, manga) {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet eg-sheet"><div class="sheet-head"><b>${t(manga ? 'titleRatings' : 'epRatings')}</b><button class="sheet-x" type="button" aria-label="${t('close')}">${ICON.x}</button></div><div class="eg-body"></div></div>`;
  document.body.append(w);
  requestAnimationFrame(() => w.classList.add('open'));
  w.onclick = e => { if (e.target === w || e.target.closest('.sheet-x')) closeSheet(); };
  Ratings.graph(w.querySelector('.eg-body'), names, id, anime, manga);
}
// phones: a newer APK on GitHub (api.checkUpdate) — the system browser downloads it, tapping it installs over this one
function updateSheet(u) {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet"><div class="sheet-head"><b>${t('updateTitle')}</b><button class="sheet-x" type="button" aria-label="${t('close')}">${ICON.x}</button></div>
    <p class="sheet-text">${t('updateText')} <span dir="ltr">(${esc(u.tag)})</span></p>
    <div class="sheet-foot"><button class="btn ghost" type="button" data-a="later">${t('later')}</button><button class="btn red" type="button" data-a="go">${t('updateGo')}</button></div></div>`;
  document.body.append(w);
  requestAnimationFrame(() => w.classList.add('open'));
  w.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a, go = w.querySelector('[data-a="go"]');
    if (a === 'go' && !go.disabled) {
      go.disabled = true;
      api.installUpdate(u.url, pct => { go.textContent = t('updateGetting') + (pct >= 0 ? ` ${pct}%` : '…'); })
        .then(closeSheet, err => {
          go.disabled = false; go.textContent = t('updateGo');
          if (/allow installs/.test(err.message)) return toast(t('updateAllow')); // Android's settings page opened for it
          toast(t('updateFailed'), true); api.openExternal(u.url); // the browser downloads it instead
        });
    }
    if (a !== 'go' && (a || e.target === w || e.target.closest('.sheet-x'))) closeSheet(); // closing mid-download: Android's installer still opens
  };
}

// the drawer's feedback / bug report form, emailed on by web3forms (api.feedback)
function feedbackSheet() {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<form class="sheet"><div class="sheet-head"><b>${t('feedback')}</b><button class="sheet-x" type="button" aria-label="${t('close')}">${ICON.x}</button></div>
    <p class="sheet-text">${t('feedbackHint')}</p>
    <input class="fb-in" name="email" type="email" autocomplete="email" dir="auto" placeholder="${t('feedbackEmail')}" aria-label="${t('feedbackEmail')}">
    <textarea class="fb-in" name="message" rows="5" required maxlength="5000" dir="auto" placeholder="${t('feedbackMsg')}" aria-label="${t('feedbackMsg')}"></textarea>
    <div class="sheet-foot"><button class="btn ghost" type="button" data-a="no">${t('cancel')}</button><button class="btn red" type="submit">${t('feedbackSend')}</button></div></form>`;
  document.body.append(w);
  requestAnimationFrame(() => w.classList.add('open'));
  const f = w.querySelector('form'), go = f.querySelector('[type=submit]');
  w.onclick = e => (e.target === w || e.target.closest('.sheet-x, [data-a]')) && closeSheet();
  f.onsubmit = async e => {
    e.preventDefault();
    go.disabled = true; go.textContent = t('feedbackSending');
    try { await api.feedback(Object.fromEntries(new FormData(f))); closeSheet(); toast(t('feedbackSent')); }
    catch { toast(t('feedbackFailed'), true); go.disabled = false; go.textContent = t('feedbackSend'); } // kept open: the text isn't lost
  };
}

// "are you sure?" for deletions: resolves true on the red button, false on Cancel / outside tap (Android back just closes)
function confirmSheet(title, text, okLabel) {
  return new Promise(done => {
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet" role="alertdialog" aria-label="${esc(title)}"><div class="sheet-head"><b dir="auto">${esc(title)}</b></div>
      <p class="sheet-text">${text}</p>
      <div class="sheet-foot"><button class="btn ghost" type="button" data-a="no">${t('cancel')}</button><button class="btn red" type="button" data-a="yes">${ICON.trash} ${okLabel}</button></div></div>`;
    document.body.append(w);
    requestAnimationFrame(() => w.classList.add('open'));
    w.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a || e.target === w) { closeSheet(); done(a === 'yes'); }
    };
  });
}

let setTab = ''; // the settings tab shown on wide screens (its side menu): kept when the view is drawn again (language, dock)
// root: the page (#/settings: phones, through the drawer) or the desktop's modal (the top bar's gear, openSettings)
function settingsView(root = view) {
  const modal = root !== view;
  const dock = dockIds();
  const btn = (act, id, label, txt, off) => `<button class="icon-btn" data-act="${act}" data-id="${id}" title="${label}" aria-label="${label}" ${off ? 'disabled' : ''}>${txt}</button>`;
  const line = (n, i) => `<div class="set-row ${i >= 0 ? 'on' : ''}"><i class="set-tile">${navSvg(n.id)}</i><span>${t(n.id)}</span>${i >= 0
    ? `<div class="set-acts">${btn('up', n.id, t('moveUp'), ICON.caretUp, i === 0) + btn('down', n.id, t('moveDown'), ICON.caretDown, i === dock.length - 1) + btn('del', n.id, t('removeDock'), ICON.minus)}</div>`
    : btn('add', n.id, t('addDock'), ICON.plus).replace('class="icon-btn"', `class="icon-btn${dock.length >= DOCK_MAX ? ' full' : ''}"`)}</div>`; // full: still tappable, says why
  const head = (title, hint) => `<h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}`;
  const hidden = Object.keys(store.hidden).length;
  // the sections after the dock's: phones stack them; wider screens list them in a side menu too, each a bordered card with
  // its hint at the top (style.css). One list, so both read the same sections
  const secs = [
    api.storage && { id: 'stor', icon: ICON.folder, title: t('storage'), hint: t('storageHint'), body: '<div class="set-stor" id="stor"></div>' },
    { id: 'play', icon: ICON.play, title: t('playback'), hint: t('skipIntroHint'),
      body: `<div class="set-list"><label class="set-row"><i class="set-tile">${ICON.skipForward}</i><span>${t('skipIntroSet')}</span><input type="checkbox" id="intro-on" ${store.prefs.skipIntro === false ? '' : 'checked'}></label><label class="set-row"><i class="set-tile">${ICON.play}</i><span>${t('heroTrailerSet')}</span><input type="checkbox" id="trailer-on" ${store.prefs.heroTrailer === false ? '' : 'checked'}></label></div>` },
    { id: 'hidden', icon: ICON.eyeSlash, title: t('hiddenTitle'), hint: t('hiddenHint'),
      // the modal shows them in its tab (their ✕ brings one back); the page links to #/hidden
      body: modal ? `<div class="set-hidden">${hiddenGrid('h3')}</div>`
        : `<div class="set-list"><a class="set-row set-link" href="#/hidden"><i class="set-tile">${ICON.eyeSlash}</i><span>${t('openHidden', hidden)}</span>${ICON.caretRight}</a></div>` },
    api.web && { id: 'data', icon: ICON.folder, title: t('dataTitle'), hint: t('dataHint'), body: `<div class="set-list">
      <button class="set-row set-link" id="bk"><i class="set-tile">${ICON.download}</i><span>${t('backup')}</span></button>
      <label class="set-row set-link"><i class="set-tile">${ICON.folder}</i><span>${t('restore')}</span><input type="file" id="rs" accept=".json,application/json" hidden></label>
      <button class="set-row set-link" id="cc"><i class="set-tile">${ICON.trash}</i><span>${t('clearCache')}</span></button></div>` },
    api.web && { id: 'app', icon: ICON.download, title: t('getApp'), hint: t('getAppHint'),
      body: `<div class="set-list"><a class="set-row set-link" href="https://github.com/Medamine-Bahassou/Medflix/releases/latest" target="_blank" rel="noopener"><i class="set-tile">${ICON.download}</i><span>${t('getAppBtn')}</span>${ICON.external}</a></div>` },
    !modal && { id: 'lang', icon: ICON.textAa, title: t('language'), // the modal leaves it to the top bar's switch, beside the gear that opens it; the label shows only in the desktop card
      body: `<div class="set-lang-row"><span>${t('interfaceLang')}</span><div class="lang set-lang" role="group" aria-label="${t('interfaceLang')}"><button type="button" data-l="ar" lang="ar" aria-pressed="${lang === 'ar'}" class="${lang === 'ar' ? 'on' : ''}">العربية</button><button type="button" data-l="en" lang="en" aria-pressed="${lang === 'en'}" class="${lang === 'en' ? 'on' : ''}">English</button></div></div>` },
  ].filter(Boolean);
  if (!secs.some(s => s.id === setTab)) setTab = secs[0].id;
  root.innerHTML = `<div class="page settings"><h1>${t('settings')}${modal ? `<button class="icon-btn set-x" title="${t('close')}" aria-label="${t('close')}">${ICON.x}</button>` : ''}</h1><div class="set-wrap">
    <nav class="set-nav">${secs.map(s => `<button class="${s.id === setTab ? 'on' : ''}" data-sec="${s.id}">${s.icon}<span>${s.title}</span></button>`).join('')}</nav>
    <div class="set-grid">
    <section class="set-card set-dock">${head(t('dockTitle'), t('dockHint'))}
      <div class="dock-preview">${dock.map((id, i) => `<span class="${i ? '' : 'on'}">${navSvg(id)}<small>${dockLabel(id)}</small></span>`).join('')}</div>
      <h3>${t('inDock')} <small>${dock.length}/${DOCK_MAX}</small></h3>
      <div class="set-list">${dock.map((id, i) => line(navItem(id), i)).join('')}</div>
      <h3>${t('available')}</h3>
      <div class="set-list">${NAV.filter(n => !dock.includes(n.id)).map(n => line(n, -1)).join('')}</div>
    </section>
    <div class="set-side">
    ${secs.map(s => `<section class="set-card ${s.id === setTab ? 'on' : ''}" data-sec="${s.id}"><h2>${s.title}</h2><div class="set-box">${s.hint ? `<p class="hint">${s.hint}</p>` : ''}${s.body}</div></section>`).join('')}
    ${window.BUILD ? `<p class="set-build" dir="ltr">Build ${esc(BUILD)}</p>` : ''}</div></div></div></div>`;
  if (api.storage) drawStorage();
  $('#intro-on').onchange = e => { store.prefs.skipIntro = e.target.checked; persist('prefs'); };
  $('#trailer-on').onchange = e => { store.prefs.heroTrailer = e.target.checked; persist('prefs'); };
  if (api.web) webData();
  root.querySelector('.settings').onclick = e => {
    if (e.target.closest('.set-x')) return closeSettings();
    const sec = e.target.closest('.set-nav button');
    if (sec) { // wide screens: a tab per section, the menu's button shows only its own (style.css); phones list them all
      setTab = sec.dataset.sec;
      root.querySelectorAll('.set-nav button, .set-side > .set-card').forEach(el => el.classList.toggle('on', el.dataset.sec === setTab));
      return root.querySelector('.set-grid').scrollTo?.(0, 0);
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const d = [...dock], i = d.indexOf(b.dataset.id);
    if (b.dataset.act === 'add') { if (d.length >= DOCK_MAX) return toast(t('dockFull'), true); d.push(b.dataset.id); }
    if (b.dataset.act === 'del') { if (d.length <= 1) return toast(t('dockMin'), true); d.splice(i, 1); }
    if (b.dataset.act === 'up') [d[i - 1], d[i]] = [d[i], d[i - 1]];
    if (b.dataset.act === 'down') [d[i + 1], d[i]] = [d[i], d[i + 1]];
    store.prefs.dock = d; persist('prefs');
    renderNav(); settingsView(root);
  };
}
// desktop: settings over the page it was opened from, not instead of it. Closed by ✕, Esc (back()), a click outside, or
// leaving for another page (hidden items' link). The desktop app's player is a native view over the page: hidden meanwhile
const settingsModal = () => $('.set-modal');
function openSettings() {
  if (settingsModal()) return;
  const wrap = document.createElement('div');
  wrap.className = 'set-modal-wrap';
  wrap.innerHTML = `<div class="set-modal" role="dialog" aria-modal="true" aria-label="${t('settings')}"></div>`;
  wrap.onclick = e => { if (e.target === wrap) closeSettings(); }; // braces: an onclick returning false would cancel every click inside (its links)
  document.body.append(wrap);
  document.body.classList.add('modal-open');
  api.playerVisible(false);
  settingsView(settingsModal());
  wrap.querySelector('.set-x').focus();
}
function closeSettings() {
  const wrap = $('.set-modal-wrap');
  if (!wrap) return false;
  wrap.remove();
  document.body.classList.remove('modal-open');
  if ($('.player')) api.playerVisible(true);
  return true;
}
addEventListener('hashchange', closeSettings);
$('.nav-gear').addEventListener('click', e => { // the gear shows on wide screens only (style.css)
  if (location.hash === '#/settings') return; // already the page
  e.preventDefault();
  openSettings();
});

// the website keeps everything in the browser (web.js): a copy of it as a file, put back from one; and the saved pages cleared
const BACKUP = ['list', 'history', 'seen', 'prefs', 'manga', 'mangaSeen', 'hidden', 'novels', 'novelSeen', 'novelMarks']; // payloads and download indexes stay local; streams are only a cache
function webData() {
  $('#bk').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ medflix: 1, at: Date.now(), data: Object.fromEntries(BACKUP.map(k => [k, store[k]])) })], { type: 'application/json' }));
    a.download = `medflix-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#rs').onchange = async e => {
    try {
      const b = JSON.parse(await e.target.files[0].text());
      if (b?.medflix !== 1 || !b.data || typeof b.data !== 'object') throw new Error('not a backup');
      const keys = BACKUP.filter(k => b.data[k] && typeof b.data[k] === 'object' && !Array.isArray(b.data[k])); // a file from anywhere: only our keys, only objects
      if (!keys.length) throw new Error('not a backup');
      await Promise.all(keys.map(k => (store[k] = b.data[k], persist(k))));
      toast(t('restored'));
      setTimeout(() => location.reload(), 900); // everything drawn from it again (the dock, the language, the lists)
    } catch { e.target.value = ''; toast(t('restoreBad'), true); }
  };
  $('#cc').onclick = () => Promise.all(['pages', 'lookups'].map(k => api.set(k, {}))).then(() => location.reload());
}

// ---------- user state (persisted in main process JSON) ----------
const store = { ...(api.web ? { novels: {}, novelSeen: {}, novelMarks: {} } : {}), list: {}, history: {}, seen: {}, prefs: {}, downloads: {}, manga: {}, mangaSeen: {}, hidden: {}, streams: {} }; // hidden: cards long-pressed away, by path; streams: see play()
const persist = k => api.set(k, store[k]);
const inList = p => !!store.list[p];
function toggleList(item) {
  if (inList(item.path)) delete store.list[item.path];
  else store.list[item.path] = { path: item.path, title: item.title, poster: item.poster, type: item.type, at: Date.now() };
  persist('list');
  toast(inList(item.path) ? t('added', item.title) : t('removed'));
  return inList(item.path);
}
const showOf = epPath => { const [, , a, b] = epPath.split('/'); return a === 'movie' ? `/movie/${b}` : `/anime/${a}`; };
let immersed = false; // a video or a chapter open (route()): no "download finished" toasts over it
const playHash = epPath => '#/play/' + epPath.replace(/^\/watch\//, '');

let toastT;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show'); t.classList.toggle('bad', !!bad);
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- components ----------
const cardData = new Map();
function card(c, i = 0) {
  const id = Math.random().toString(36).slice(2);
  const show = c.showPath || c.path;
  if (store.hidden[show] && !c.rm?.startsWith('hidden:')) return ''; // (the hidden page itself still draws them)
  cardData.set(id, { ...c, path: show, type: c.type === 'episode' ? (show.startsWith('/movie') ? 'movie' : 'anime') : c.type, href: c.href || (c.type === 'episode' ? playHash(c.path) : /^\/(manga|cinema|airing|novels)\//.test(c.path) ? '#' + c.path : '#/title' + c.path) });
  const h = store.history[show];
  return `<div class="card" data-id="${id}" style="--i:${i % 12}">
    <div class="img" data-ph="${esc(c.title)}"><img src="${esc(img(c.poster))}" loading="lazy" decoding="async" alt="" draggable="false"></div>
    ${c.badge ? `<span class="badge">${esc(c.badge.replace(/\bEP\b|الحلقة/, t('ep')).replace('والأخيرة', t('epFinal')))}</span>` : ''}
    ${c.rm ? `<button class="fav rm" title="${t('remove')}" aria-label="${t('remove')}">${ICON.x}</button>`
      : show.startsWith('/airing/') ? '' // a schedule card: not a show page yet (found on witanime when opened), so nothing to list
      : `<button class="fav ${inList(show) ? 'on' : ''}" title="${t('myList')}">${inList(show) ? ICON.check : ICON.plus}</button>`}
    <div class="meta"><div class="t" dir="auto" title="${esc(c.title)}">${esc(c.title)}</div>
      <div class="s">${c.year ? `<span>${esc(c.year)}</span>` : ''}${h?.ep ? `<span>${t('epShort')} ${esc(h.ep)}</span>` : ''}</div></div>
  </div>`;
}
// top: the most viewed, as a ranking: its first ten, each behind its big number (style.css .top10)
const row = (title, items, href, top) => !items?.length ? '' : `<section class="row${top ? ' top10' : ''}"><h3>${href ? `<a href="${href}">${esc(t(title))} ${ICON.next}</a>` : esc(t(title))}</h3>
  <div class="track-wrap"><button class="arrow l" aria-label="${t('prev')}">${ICON.caretLeft}</button><div class="track">${(top ? items.slice(0, 10) : items).map(card).join('')}</div><button class="arrow r" aria-label="${t('next')}">${ICON.caretRight}</button></div></section>`;
// an empty page: the section's icon in gray, then what's missing
const emptyState = (icon, title, hint) => `<div class="empty rich"><i class="empty-icon" aria-hidden="true">${icon}</i><b>${title}</b><p>${hint}</p></div>`;
const grid = items => items.length ? `<div class="grid">${items.map(card).join('')}</div>` : `<div class="empty"><b>${t('nothing')}</b>${t('tryElse')}</div>`;
const spinner = () => { view.innerHTML = `<div class="center"><div class="spin"></div><p class="slow-msg" role="status">${t('holdOn')}</p></div>`; }; // the message fades in only if it takes long (css)
// error text shown on screen, without the sources' names or addresses ("no answer from witanime.site" -> "no answer from the site")
const noNames = m => String(m || '').replace(/https?:\/\/\S+|\b[\w.-]*(wit ?anime|anime ?rco|egy ?dead|my ?seed|arab ?seed|appswat|mesh ?manga|manga ?swat|olympus ?staff|team-?x|anime ?schedule|mega ?max)[\w.-]*/gi, t('theSite'));
const failed = e => { view.innerHTML = `<div class="center"><div class="empty"><b>${t('unreachable')}</b>${esc(noNames(e.message))}<br><br><button class="btn red">${t('retry')}</button></div></div>`; $('.empty .btn').onclick = route; };

// event delegation for cards, arrows, image fade-in
// long-press a card: a menu to hide it from every page (its path goes in store.hidden; #/hidden lists them) or (un)list it
const hideLabel = d => t(d.type === 'novel' ? 'hideNovel' : d.type === 'manga' ? 'hideManga' : d.type !== 'cinema' ? 'hideAnime' : /^\/cinema\/(serie|season|episode)\//.test(d.path) ? 'hideSeries' : 'hideMovie');
function setHidden(d, on) {
  if (on) store.hidden[d.path] = { path: d.path, title: d.title, poster: d.poster, type: d.type, at: Date.now() };
  else delete store.hidden[d.path];
  persist('hidden');
  if (on) document.querySelectorAll('.card').forEach(o => {
    if (cardData.get(o.dataset.id)?.path !== d.path || o.closest('.hidden-page')) return;
    const r = o.closest('.row');
    o.remove();
    if (r && !r.querySelector('.card')) r.remove();
  });
  toast(on ? t('hiddenN', d.title) : t('shown'));
}
function cardMenu(d) {
  const hidden = !!store.hidden[d.path];
  pickSheet(d.title, [['hide', hidden ? t('unhide') : hideLabel(d)], !d.path.startsWith('/airing/') && ['list', inList(d.path) ? t('listRemove') : t('listAdd')]].filter(Boolean), '', v => {
    if (v === 'hide') return hidden ? (setHidden(d, false), location.hash === '#/hidden' && hiddenView()) : setHidden(d, true);
    const on = toggleList(d);
    document.querySelectorAll('.card').forEach(o => {
      if (cardData.get(o.dataset.id)?.path !== d.path) return;
      const f = o.querySelector('.fav'); if (f) { f.classList.toggle('on', on); f.innerHTML = on ? ICON.check : ICON.plus; }
    });
  });
}
// right-click actions use the app's dropdown rows, anchored to the pointer instead of a modal.
let contextPoint = null, contextFocus = null;
function closeContextMenu() {
  const menu=$('.context-menu:not(.closing)'); if(!menu)return false;
  menu.classList.add('closing');menu.inert=true;setTimeout(()=>menu.remove(),160);
  if(contextFocus?.isConnected)contextFocus.focus();contextFocus=null;return true;
}
function contextMenu(title,opts,cur,onPick,point) {
  closeContextMenu();
  contextFocus=point.target?.matches('a,button') ? point.target : point.target?.querySelector('a,button') || document.activeElement;
  const menu=document.createElement('div');menu.className='context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',title);
  menu.innerHTML=`<div class="context-title">${esc(title)}</div>${opts.map(([v,label])=>`<button type="button" class="dd-item ${v===cur?'on':''}" role="menuitem" data-v="${esc(v)}">${esc(label)}${cur && v === cur ? `<span class="ck">${ICON.check}</span>` : ''}</button>`).join('')}`; // the picked one ends in a check
  document.body.append(menu);
  const box=menu.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(point.x,innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,Math.min(point.y,innerHeight-box.height-8))+'px';
  menu.classList.add('open');
  const buttons=[...menu.querySelectorAll('button')];buttons[0]?.focus();
  // pointer and keyboard share one active row, rather than showing two competing highlights.
  menu.onpointermove=e=>{const btn=e.target.closest('.dd-item');if(btn&&document.activeElement!==btn)btn.focus({preventScroll:true});};
  menu.onclick=e=>{const btn=e.target.closest('[data-v]');if(!btn)return;const v=btn.dataset.v;closeContextMenu();onPick(v);};
  menu.onkeydown=e=>{const at=buttons.indexOf(document.activeElement);let next;
    if(e.key==='ArrowDown')next=(at+1)%buttons.length;
    if(e.key==='ArrowUp')next=(at-1+buttons.length)%buttons.length;
    if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;
    if(next!=null){e.preventDefault();buttons[next]?.focus();}if(e.key==='Tab')closeContextMenu();
  };
}
document.addEventListener('pointerdown',e=>{const menu=$('.context-menu:not(.closing)');if(menu&&!menu.contains(e.target))closeContextMenu();},true);
addEventListener('scroll',e=>{const menu=$('.context-menu:not(.closing)');if(menu&&!menu.contains(e.target))closeContextMenu();},true);
addEventListener('resize',closeContextMenu);
addEventListener('hashchange',closeContextMenu);

// Long-press (or right-click) menus: cards' above; a page sets pagePress = [selector, open(el)] for its own elements
// (chapter tiles, download rows). pressOf: [the pressed element, its menu (none: a card without data)]
let pressT, pressAt, pressed = null, pagePress = null; // pressed: the element whose menu opened
const pressOf = e => {
  const c = e.target.closest('.card'), d = c && cardData.get(c.dataset.id);
  if (c) return [c, d && (() => cardMenu(d))];
  const el = pagePress && e.target.closest(pagePress[0]), open = pagePress?.[1];
  return el && [el, () => open(el)];
};
function pressMenu([el, open], point = null) {
  if (pressed || !open) return; // the timer and the browser's own long-press (contextmenu) both fire: one menu
  pressed = el;
  clearTimeout(pressT);
  if (!point) navigator.vibrate?.(20);
  contextPoint = point;
  try { open(); } finally { contextPoint = null; }
}
document.addEventListener('pointerdown', e => {
  pressed = null;
  const p = pressOf(e);
  if (!p?.[1] || e.button > 0) return;
  pressAt = [e.clientX, e.clientY];
  pressT = setTimeout(() => pressMenu(p), 550);
});
document.addEventListener('pointermove', e => pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 10 && clearTimeout(pressT)); // scrolling, not pressing
['pointerup', 'pointercancel'].forEach(n => document.addEventListener(n, () => { clearTimeout(pressT); pressAt = null; }));
// Android cancels the pointer when a press on the poster turns into its image long-press (pointercancel stops the
// timer), but still sends contextmenu: open the menu from that too (and from a right-click on desktop)
document.addEventListener('contextmenu', e => {
  const p = pressOf(e);
  if (!p) return;
  e.preventDefault();
  const mouse=e.pointerType!=='touch' && (e.button===2 || (!e.clientX&&!e.clientY));
  const box=p[0].getBoundingClientRect();
  pressMenu(p,mouse?{x:e.clientX || box.left,y:e.clientY || box.bottom,target:p[0]}:null);
});
// a held link or image never turns into a drag (Android starts one on long-press, cancelling the press and its menu): nothing here is dragged
document.addEventListener('dragstart', e => e.preventDefault());
// the click that ends a long-press doesn't also open (or select) what was pressed
document.addEventListener('click', e => {
  if (pressed?.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
  pressed = null;
}, true);

// Multi-select: a list's select button, if it has one (or "Select" in an item's long-press menu) turns taps on its items ([data-pick] =
// id) into picks; the bar above it shows how many, Select all, and Actions: a sheet of what can be done to them all.
// picks: the picked ids while selecting, else null; kept through redraws of the page, dropped on leaving it (or back).
let picks = null;
const selBar = () => `<div class="selbar" id="selbar" hidden><button class="icon-btn" id="selX" title="${t('cancel')}" aria-label="${t('cancel')}">${ICON.x}</button><span id="selN"></span><button class="btn ghost small" id="selAll">${t('selectAll')}</button>
  <button class="btn red small" id="selGo">${t('actions')}</button></div>`;
const selBtn = cls => `<button class="${cls}" id="selBtn" title="${t('select')}" aria-label="${t('select')}">${ICON.check}</button>`;
const closeSelect = () => !!(picks && $('#selX')) && ($('#selX').click(), true);
// after each draw: list holds the items; all() every id shown (Select all); acts(ids) the sheet's [[value, label]] for
// those; run(value, ids) does it. Returns start(id): selecting, with that one picked
function selectable(list, all, acts, run) {
  const sync = () => {
    $('#selbar').hidden = !picks;
    $('#selN').textContent = t('selectedN', picks?.size || 0);
    $('#selBtn')?.classList.toggle('on', !!picks);
    list.classList.toggle('selecting', !!picks);
    list.querySelectorAll('[data-pick]').forEach(el => el.classList.toggle('sel', !!picks?.has(el.dataset.pick)));
  };
  if ($('#selBtn')) $('#selBtn').onclick = e => { e.preventDefault(); picks = picks ? null : new Set(); sync(); };
  $('#selX').onclick = () => { picks = null; sync(); };
  list.addEventListener('click', e => { // while selecting, a tap anywhere on an item (its buttons too) picks it
    const el = picks && e.target.closest('[data-pick]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    picks.has(el.dataset.pick) ? picks.delete(el.dataset.pick) : picks.add(el.dataset.pick);
    sync();
  }, true);
  $('#selAll').onclick = () => { all().forEach(id => picks.add(String(id))); sync(); };
  $('#selGo').onclick = () => {
    const ids = [...picks];
    if (ids.length) pickSheet(t('selectedN', ids.length), acts(ids), '', v => { picks = null; sync(); run(v, ids); });
  };
  sync();
  return id => { picks = new Set([String(id)]); sync(); };
}

document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('.arrow')) {
    const tr = t.closest('.track-wrap').querySelector('.track');
    tr.scrollBy({ left: (t.closest('.arrow').classList.contains('l') ? -1 : 1) * tr.clientWidth * .85 });
    return;
  }
  const c = t.closest('.card');
  if (!c) return;
  const d = cardData.get(c.dataset.id);
  if (t.closest('.rm')) { // off Continue Watching
    const [k, id] = d.rm.split(/:(.*)/);
    delete store[k][id]; persist(k);
    if (k === 'hidden') return unhidden(); // (t is the clicked element in here)
    const r = c.closest('.row');
    c.remove();
    if (!r.querySelector('.card')) r.remove();
    return;
  }
  if (t.closest('.fav')) {
    const on = toggleList(d);
    document.querySelectorAll('.card').forEach(o => {
      if (cardData.get(o.dataset.id)?.path !== d.path) return;
      const f = o.querySelector('.fav'); f.classList.toggle('on', on); f.innerHTML = on ? ICON.check : ICON.plus;
    });
    return;
  }
  askOrGo(d);
});
// a card of something already started, or one going straight into an episode or chapter (the latest ones), asks first: that
// episode could be far past where the viewer is, a spoiler. The main choice is never the one that could spoil: where it was
// left, or, not started, its page; the card's own episode is the lesser one beside it (NativeActivity.kt ResumeSheet)
const PLAYS = /^#\/(play\/|cinema\/episode\/|cinema\/[^/]+\/watch$|manga\/read\/|novels\/read\/)/;
function resumeOf(d) {
  if (api.web && d.type === 'novel') { const r = store.novels[d.path.split('/').pop()]; return r?.slug && [nvReadHash(r.id, r.slug), t('resumeCh', r.n)]; }
  if (d.path.startsWith('/manga/series/')) { const r = store.manga[d.path.slice('/manga/series/'.length)]; return r?.chapterId && ['#/manga/read/' + r.chapterId, t('resumeCh', chNum(r.n))]; }
  const h = store.history[d.path];
  if (!h) return null;
  if (h.slug) return [h.ep ? edHref(h.slug) : `#/cinema/${encodeURIComponent(h.slug)}/watch`, h.ep ? t('resume', h.ep) : t('play')]; // a film: the player finds its place
  return h.epPath && [playHash(h.epPath), t('resume', h.ep)];
}
function askOrGo(d) {
  const page = /^\/(manga|cinema|airing|novels)\//.test(d.path) ? '#' + d.path : '#/title' + d.path, resume = resumeOf(d);
  if (!resume && !PLAYS.test(d.href)) return location.hash = d.href;
  const own = d.href !== page && d.href !== resume?.[0] && [d.href, (d.badge || '').replace(/\bEP\b|الحلقة/, t('ep')).replace('والأخيرة', t('epFinal')) || t('play')];
  const reading = /^\/(manga|novels)\//.test(d.path);
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet ask-sheet" role="dialog" aria-label="${esc(d.title)}">
    <div class="ask-head">${d.poster ? `<img src="${esc(img(d.poster))}" alt="">` : ''}<div>${resume ? `<small>${t(reading ? 'continueReading' : 'continueWatching')}</small>` : ''}<b dir="auto">${esc(d.title)}</b></div></div>
    <div class="ask-actions"><a class="btn red" href="${esc(resume?.[0] || page)}">${resume ? ICON.play : ICON.info} ${esc(resume?.[1] || t('details'))}</a>
    ${own ? `<a class="btn ghost" href="${esc(own[0])}">${ICON.play} ${esc(own[1])}</a>` : ''}${resume ? `<a class="btn ghost" href="${esc(page)}">${ICON.info} ${t('details')}</a>` : ''}</div></div>`;
  document.body.append(w);
  requestAnimationFrame(() => w.classList.add('open'));
  w.onclick = e => { if (e.target === w || e.target.closest('a')) closeSheet(); }; // a link goes on by itself (no return false: that would stop it)
}
// desktop: anything that scrolls sideways (card rows, the cast, chip strips) dragged with the mouse, as a finger does on
// phones (touch keeps its own scrolling). It follows the cursor, glides on a little after a quick release, and the click
// that ends a drag doesn't open what's under it. The manga reader keeps its own page swipes and zoom
let drag = null;
const sideScroller = el => {
  for (; el && el !== document.body; el = el.parentElement)
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return el;
};
document.addEventListener('pointerdown', e => {
  const tr = e.pointerType === 'mouse' && !e.button && !e.target.closest('.arrow, .reader, input, textarea, select') && sideScroller(e.target);
  if (tr) drag = { tr, x: e.clientX, left: tr.scrollLeft, moved: false, v: 0, at: e.timeStamp, last: e.clientX };
});
addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 6) return; // a click, not a drag
  if (!drag.moved) { drag.moved = true; drag.tr.classList.add('dragging'); clearTimeout(pressT); } // no long-press menu either
  drag.v = (e.clientX - drag.last) / Math.max(1, e.timeStamp - drag.at); drag.last = e.clientX; drag.at = e.timeStamp; // px per ms, for the glide
  drag.tr.scrollLeft = drag.left - dx;
});
addEventListener('pointerup', () => {
  if (!drag) return;
  const { tr, moved, v } = drag;
  drag = null;
  if (!moved) return;
  tr.classList.remove('dragging'); // smooth scrolling back on: the glide below eases out
  if (Math.abs(v) > .3) tr.scrollBy({ left: -v * 280 });
  // the drag's own click (it comes right after this, if at all: released off the row, none does, and the next real one stays)
  const eat = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', eat, true));
});
document.addEventListener('load', e => e.target.tagName === 'IMG' && e.target.classList.add('ok'), true);
document.addEventListener('error', e => {
  const i = e.target;
  if (i.tagName !== 'IMG') return;
  i.classList.add('ok', 'broken'); // broken: offline posters etc.
  // an anime's poster the site lost: the website asks for another, once per picture (history keeps the dead address, so a saved show is covered too)
  const box = i.closest('.card'), anime = box ? ['anime', 'movie'].includes(cardData.get(box.dataset.id)?.type) : i.matches('.det .poster') && location.hash.startsWith('#/title');
  if (!anime || !scraper.cover || i.dataset.rescued) return;
  i.dataset.rescued = 1;
  scraper.cover(box ? box.querySelector('.img')?.dataset.ph : $('.det h1')?.textContent).then(url => { if (url && i.isConnected) { i.classList.remove('broken'); i.src = url; } }, () => {});
}, true);
let barColor;
const syncBar = () => {
  $('#nav').classList.toggle('solid', scrollY > 40);
  const c = '#000000'; // amoled black throughout: the solid nav is black too
  if (c !== barColor) api.titleBar(barColor = c);
};
addEventListener('scroll', syncBar);
// phones: the search box lives in a panel opened from the nav's search button
const openSearch = open => {
  document.body.classList.toggle('searching', open);
  open ? $('#search').q.focus() : $('#search').q.blur();
};
const closeSearch = () => document.body.classList.contains('searching') && (openSearch(false), true);
$('#searchBtn').onclick = () => openSearch(true);
$('.search-x').onclick = () => openSearch(false);
$('.search-clr').onmousedown = e => e.preventDefault(); // the box keeps focus (and the phone its keyboard)
$('.search-clr').onclick = () => { $('#search').q.value = ''; $('#search').q.focus(); };
$('#nav').addEventListener('click', e => e.target === e.currentTarget && closeSearch()); // tap on the dimmed backdrop (#nav::after)
let searchTyped;
$('#search').q.addEventListener('input', e => { // on the search page: asks again once typing stops, in the same history entry
  clearTimeout(searchTyped);
  const q = e.target.value.trim();
  if (!q || !location.hash.startsWith('#/search/')) return;
  searchTyped = setTimeout(() => location.replace('#/search/' + encodeURIComponent(q) + (location.hash.match(/\?in=\w+$/)?.[0] || '')), 400);
});
$('#search').onsubmit = e => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  // inside a section the box asks that section alone (the search page's chip for it), as on Android
  const section = location.hash.match(/^#\/(novels|manga|cinema)(?:\/|$|\?)/)?.[1];
  if (q) { closeSearch(); location.hash = section === 'novels' ? '#/novels/browse?search=' + encodeURIComponent(q) : '#/search/' + encodeURIComponent(q) + (section ? '?in=' + section : ''); }
};

// ---------- views ----------
// Continue Watching: video history, manga and web novel chapters, newest first.
// `rm` names the stored entry, so the card's × can drop it.
function continued(kinds) {
  return [
    ...Object.values(store.history).map(h => h.slug
      ? { kind: 'cinema', at: h.at, path: h.show, type: 'cinema', title: h.title, poster: h.poster || store.list[h.show]?.poster, href: h.ep ? edHref(h.slug) : `#/cinema/${encodeURIComponent(h.slug)}/watch`, badge: h.ep && t('ep') + ' ' + h.ep, rm: 'history:' + h.show }
      : { kind: 'anime', at: h.at, path: h.epPath, showPath: h.show, type: 'episode', title: h.title, poster: h.poster || store.list[h.show]?.poster, badge: t('ep') + ' ' + h.ep, rm: 'history:' + h.show }),
    ...Object.values(store.manga).map(r => ({ kind: 'manga', at: r.at, path: '/manga/series/' + r.id, type: 'manga', title: r.title, poster: r.poster || store.list['/manga/series/' + r.id]?.poster, // saved without a cover: the one in My List
      badge: `${t('chShort')} ${chNum(r.n)}`, href: '#/manga/read/' + r.chapterId, rm: 'manga:' + r.id })),
    ...(api.web ? nvContinued() : []),
  ].filter(c => kinds.includes(c.kind)).sort((a, b) => b.at - a.at);
}

// a page under a cover slider of { banner, title, desc, info: hash, play?: hash }; refresh redraws it with fresh data
let heroTimer, heroMsg, heroState = null;
// the billboard's trailer (heroPage): a YouTube id per anime or film on the slider, '' for none. an anime's from AniList (the website) or its page,
// a film's from its page (cinema.js); manga and novels have none
const heroTrailers = new Map(), heroTrailerLoads = new Map();
const youtubeId = value => {
  const text = String(value || '').trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  const links = text.match(/(?:https?:)?\/\/[^\s"'<>]+/g) || (/^(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\//i.test(text) ? ['https://' + text] : []);
  for (const link of links) {
    try {
      const u = new URL(link.replaceAll('&amp;', '&'), 'https://www.youtube.com');
      const host = u.hostname.toLowerCase().replace(/^(?:www\.|m\.|music\.)/, '');
      const id = host === 'youtu.be' ? u.pathname.split('/')[1] : /^(?:youtube\.com|youtube-nocookie\.com)$/.test(host)
        ? u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)?.[1] : '';
      if (/^[\w-]{11}$/.test(id || '')) return id;
    } catch {}
  }
  return '';
};
const trailerId = async h => {
  const supplied = youtubeId(h.trailer);
  if (supplied) return supplied;
  if (!/^#\/(title|cinema)\//.test(h.info)) return '';
  const hit = heroTrailers.get(h.info);
  if (hit && Date.now() - hit.at < (hit.id ? 24 * 3600e3 : 60e3)) return hit.id;
  if (!heroTrailerLoads.has(h.info)) {
    const task = (async () => {
      let id = '';
      if (h.info.startsWith('#/cinema/')) {
        let slug = decodeURIComponent(h.info.slice(9));
        const visited = new Set();
        while (slug && !visited.has(slug) && visited.size < 3) {
          visited.add(slug);
          let d = await edMovieOf(slug);
          id = youtubeId(d.trailer);
          // older cached pages may predate the source's new trailer markup.
          if (!id) { d = await edMovieOf(slug, true); id = youtubeId(d.trailer); }
          if (id) break;
          slug = d.up;
        }
      } else {
        const path = decodeURIComponent(h.info.slice(7));
        if (scraper.trailer) id = youtubeId(await scraper.trailer(h.title, h.alt, path));
        else id = youtubeId((await scraper.details(path, false, true)).trailer);
      }
      heroTrailers.set(h.info, { id, at: Date.now() });
      return id;
    })().finally(() => heroTrailerLoads.delete(h.info));
    heroTrailerLoads.set(h.info, task);
  }
  return heroTrailerLoads.get(h.info);
};
const SOUND = ['<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="m15 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3zm11-5.8v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6zM16.5 12A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>']; // muted, sound on
// choose one verified wide image per title; redraws reuse it, including an empty result.
const heroArt = new Map(), backdropLoads = new Map();
const backdropKey = h => { try { return decodeURIComponent(h.info); } catch { return h.info; } };
const resolveBackdrop = h => {
  const key = backdropKey(h);
  if (heroArt.has(key)) return Promise.resolve(heroArt.get(key));
  if (!backdropLoads.has(key)) {
    const task = (async () => {
      const art = await Ratings.art(h).catch(() => '');
      for (const url of new Set([art, h.banner !== h.poster && h.banner].filter(Boolean))) {
        const wide = await new Promise(resolve => {
          const pic = new Image();
          pic.onload = () => resolve(pic.naturalWidth >= 1280 && pic.naturalHeight > 0 && pic.naturalWidth / pic.naturalHeight >= 1.3);
          pic.onerror = () => resolve(false);
          pic.src = img(url);
        });
        if (wide) { heroArt.set(key, url); return url; }
      }
      heroArt.set(key, '');
      return '';
    })().finally(() => backdropLoads.delete(key));
    backdropLoads.set(key, task);
    if (heroArt.size > 64) heroArt.delete(heroArt.keys().next().value);
  }
  return backdropLoads.get(key);
};
// carousel covers are independent of the show page's high-resolution-only backdrops.
const carouselArt = new Map();
const carouselImage = h => {
  const key = backdropKey(h);
  if (!carouselArt.has(key)) {
    const url = heroArt.get(key) || h.banner;
    if (url) carouselArt.set(key, url);
    if (carouselArt.size > 64) carouselArt.delete(carouselArt.keys().next().value);
  }
  return carouselArt.get(key) || '';
};
function heroPage(hero, rows, refresh) {
  const key = location.hash;
  if (!heroState || heroState.key !== key) heroState = { key, slides: [], active: '' };
  // late sources append slides instead of replacing the first picture and restarting the carousel.
  const merged = new Map(heroState.slides.map(h => [h.info, h]));
  hero.forEach(h => merged.set(h.info, h));
  hero = heroState.slides = [...merged.values()];
  const state = heroState;
  view.innerHTML = `
    <div class="hero">${hero.map((h, i) => `<div class="slide ${i ? '' : 'on'}"><img ${carouselImage(h) ? `src="${esc(img(carouselImage(h)))}"` : 'hidden'} alt=""></div>`).join('')}
      <div class="info"></div><button class="hero-mute" hidden aria-label="${t('sound')}"></button><div class="dots">${hero.map((_, i) => `<i data-i="${i}" class="${i ? '' : 'on'}"></i>`).join('')}</div></div>
    <div class="rows">${rows}
    </div>`;
  pageRefresh = () => { heroState = null; return refresh?.(); };
  if (!hero.length) $('.hero').style.height = '120px';
  let cur = Math.max(0, hero.findIndex(h => h.info === state.active)), slideVersion = 0;
  const root = $('.hero'), live = () => root.isConnected && $('.hero') === root;
  const pics = [...view.querySelectorAll('.hero .slide img')];
  const fit = p => {
    if (!p.naturalWidth) return;
    const portrait = p.naturalWidth < p.naturalHeight * 1.3;
    p.parentNode.classList.toggle('portrait', portrait);
    p.parentNode.style.setProperty('--art', portrait ? `url("${String(p.currentSrc || p.src).replaceAll('"', '%22')}")` : 'none');
  };
  pics.forEach(p => {
    p.addEventListener('load', () => fit(p));
    p.addEventListener('error', () => { p.hidden = true; });
    if (p.complete) fit(p);
  });
  const artAsked = new Set();
  const loadArt = i => {
    if (artAsked.has(i) || !pics[i]) return;
    artAsked.add(i);
    resolveBackdrop(hero[i]).then(url => {
      if (!url || !live()) return; // a miss keeps the cover and its blurred copy
      carouselArt.set(backdropKey(hero[i]), url);
      if (pics[i].getAttribute('src') !== img(url)) pics[i].src = img(url);
      pics[i].hidden = false;
    }).catch(() => {});
  };
  // Netflix's billboard: a moment on the picture, then the anime's trailer plays muted over it, and when it ends the next slide comes
  let trailerT, muted = true, trailerWait = 0;
  const stopTrailer = () => { trailerWait = 0; clearTimeout(trailerT); if (!live()) return; $('.hero .tv')?.remove(); $('.hero')?.classList.remove('trailing'); $('.hero-mute').hidden = true; };
  const cmd = func => $('.hero .tv iframe')?.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: '' }), 'https://www.youtube.com');
  const startTrailer = async (i, version, lookup) => {
    const h = hero[i];
    if (!/^#\/(title|cinema)\//.test(h.info) || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return;
    const id = await lookup;
    if (!live() || version !== slideVersion || cur !== i) return;
    if (!id) { trailerWait = 0; return; }
    muted = true;
    $('.hero').insertAdjacentHTML('beforeend', `<div class="tv"><iframe tabindex="-1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"
      src="https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1${location.protocol.startsWith('http') ? '&origin=' + encodeURIComponent(location.origin) : ''}"></iframe></div>`);
    const f = $('.hero .tv iframe');
    f.onload = () => f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), 'https://www.youtube.com'); // it answers with its state
    trailerT = setTimeout(stopTrailer, 20000); // never started (blocked, a removed video): the picture stays
  };
  const show = i => {
    const was = cur;
    cur = (i + hero.length) % hero.length;
    stopTrailer();
    const version = ++slideVersion, h = hero[cur];
    state.active = h.info;
    const lookup = trailerId(h).catch(() => '');
    const auto = store.prefs.heroTrailer !== false && /^#\/(title|cinema)\//.test(h.info) && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData;
    if (auto) { trailerWait = Date.now() + 20000; trailerT = setTimeout(() => startTrailer(cur, version, lookup), 2500); }
    trailerId(hero[(cur + 1) % hero.length]).catch(() => {}); // ready before the next slide's picture delay ends
    loadArt(cur); loadArt((cur + 1) % hero.length);
    // the one leaving keeps its zoom going while it fades (dropping it snapped the picture back mid-fade: a flicker)
    document.querySelectorAll('.hero .slide').forEach((s, j) => { s.classList.toggle('on', j === cur); s.classList.toggle('out', j === was && j !== cur); });
    document.querySelectorAll('.dots i').forEach((s, j) => s.classList.toggle('on', j === cur));
    $('.hero .info').innerHTML = `<h2>${esc(h.title)}</h2><p dir="auto">${esc(h.desc)}</p>
      <div class="actions">${h.play ? `<a class="btn play" href="${esc(h.play)}">${ICON.play} ${t('play')}</a>` : ''}
      <a class="btn ghost" href="${esc(h.info)}">${ICON.info} ${t('moreInfo')}</a><button class="btn ghost hero-trailer" hidden>${ICON.play} ${t('trailer')}</button></div>`;
    lookup.then(id => {
      if (!id || !live() || version !== slideVersion) return;
      const button = root.querySelector('.hero-trailer');
      button.hidden = false; button.onclick = () => showTrailer('https://www.youtube.com/embed/' + id + '?autoplay=1');
    });
  };
  if (hero.length) {
    show(cur);
    $('.dots').onclick = e => e.target.dataset.i && (show(+e.target.dataset.i), restart());
    const restart = () => { clearInterval(heroTimer); heroTimer = setInterval(() => !live() || $('.hero .info :focus') || $('.hero.trailing') || trailerWait > Date.now() || show(cur + 1), 8000); }; // not under a TV remote's ring: its button would vanish
    restart();
    const sound = () => { $('.hero-mute').innerHTML = SOUND[+!muted]; };
    $('.hero-mute').onclick = () => { muted = !muted; cmd(muted ? 'mute' : 'unMute'); sound(); };
    removeEventListener('message', heroMsg);
    addEventListener('message', heroMsg = e => {
      const tv = $('.hero .tv');
      if (!live() || !tv || e.origin !== 'https://www.youtube.com' || e.source !== tv.firstChild.contentWindow) return;
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.event === 'onReady') { cmd('mute'); cmd('playVideo'); }
      const s = d.event === 'onStateChange' ? d.info : d.info?.playerState;
      if (s === 1) { trailerWait = 0; clearTimeout(trailerT); tv.classList.add('on'); $('.hero').classList.add('trailing'); $('.hero-mute').hidden = false; sound(); }
      else if (s === 2 && !document.hidden) cmd('playVideo'); // paused by the browser (autoplay rules): it's a background, never left stopped on its pause mark
      else if (s === 0 || d.event === 'onError') { stopTrailer(); if (s === 0) { show(cur + 1); restart(); } }
    });
    // swipe to the next / previous slide (the way pages turn: right to left is next, the other way in Arabic)
    let x0, y0;
    $('.hero').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('.hero').addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // a tap, or scrolling the page
      show(cur + ((dx < 0) === (document.dir !== 'rtl') ? 1 : -1));
      restart();
    });
  }
}
const animeHero = d => d.hero.map(h => ({ ...h, info: '#/title' + h.path, play: h.watch && playHash(h.watch) }));
// section chips under the slider
const chips = links => `<div style="padding:0 4%"><div class="fchips">${links.map(([label, href]) => `<a class="fchip" href="${href}">${label}</a>`).join('')}</div></div>`;
const animeRowList = d => d.rows.map(r => row(r.title, r.items, '#/section/' + encodeURIComponent(r.title), SECTIONS[r.title]?.includes('Most Viewed')));
const animeRows = d => animeRowList(d).sort((a, b) => Number(isTop(b)) - Number(isTop(a))).join('');
// one row from each list in turn (anime, films, manga, novels, anime...), so no section buries the others.
// a section's ranking (its Top 10) comes before its other rows
const isTop = h => h.includes('class="row top10"');
// (the first round takes two from each: its Top 10, then its first regular row; the rest follow one by one)
const interleave = lists => { lists = lists.map(l => [...l.filter(isTop), ...l.filter(h => !isTop(h))]); const out = lists.flatMap(l => l.slice(0, 2)); for (let i = 2; lists.some(l => i < l.length); i++) lists.forEach(l => l[i] && out.push(l[i])); return out.join(''); };

// Home: a bit of every section. A site that doesn't answer just leaves its rows out.
async function home(force) {
  const hash = location.hash;
  const [d, hot, latest, films, oLatest, foreign, asian, novels, popular, readNovels] = await firstSections([
    () => scraper.home(force),
    () => load('mangaList', mUrl('series/', { is_hot:true, page_size:30 }), force),
    () => load('mangaLatest', mUrl('chapters/', { page_size:60, order_by:'-created_at' }), force),
    () => edList('all',1,force),
    () => olyLatest(force),
    () => edList('english', 1, force),
    () => edList('asian', 1, force),
    () => api.web ? nvLoad('/novels', { language: 'ar', limit: 24, sort: 'trending' }, force) : null, // the novels section is the website's
    () => load('mangaList', mUrl('series/', { order_by: '-views_count', page_size: 30 }), force),
    () => api.web ? nvLoad('/novels', { language: 'ar', limit: 24, sort: 'views' }, force) : null,
  ]);
  // films have no most-viewed list: the best scored of the ones loaded
  const scored = [...new Map([...films?.items || [], ...foreign?.items || [], ...asian?.items || []].map(c => [c.path, c])).values()].filter(c => +c.rating).sort((x, y) => y.rating - x.rating).slice(0, 10);
  if (location.hash !== hash) return;
  // posters are already available on the cards: title-page requests must not hold up navigation.
  const m = (hot?.items || []).slice(0,3).map(c=>({banner:c.poster,title:c.title,desc:c.desc || '',info:'#'+c.path}));
  const f = (films?.items || []).slice(0,3).map(c=>({banner:c.poster,title:c.title,year:c.year,desc:c.desc || '',info:edHref(c.path.slice('/cinema/'.length))}));
  // the slider takes turns: anime, manga, film, anime…
  const a = d ? animeHero(d).slice(0, 3) : [];
  const hero = [...Array(3)].flatMap((_, i) => [a[i], m?.[i], f?.[i]]).filter(Boolean);
  heroPage(hero, `
      ${row(t('continueWatching'), continued(['anime', 'cinema', 'manga', 'novel']))}
      ${row(t('myList'), Object.values(store.list).sort((a, b) => b.at - a.at), '#/list')}
      ${interleave([
        d ? animeRowList(d) : [],
        [row(t('cinema'), dubbed(films?.items), '#/cinema'), scored.length > 4 ? row(t('homeTopMovies'), dubbed(scored), '#/cinema', true) : '', row(eCatName(eCat('english')), dubbed(foreign?.items), '#/cinema/browse/english'), row(eCatName(eCat('asian')), dubbed(asian?.items), '#/cinema/browse/asian')],
        [row(t('homeHotManga'), hot?.items, '#/manga/browse/1?is_hot=true'), row(t('mPopular'), popular?.items, '#/manga/browse/1?order_by=-views_count', true), row(t('homeLatestManga'), mMerge([latest?.items, oLatest?.items]), '#/manga')],
        [row(t('homeNovels'), novels?.data?.map(nvCard), '#/novels'), row(t('homeTopNovels'), readNovels?.data?.map(nvCard), '#/novels/browse?sort=views', true)]])}`, () => home(true));
}

// Anime: witanime's series, films and schedule
async function animeHome(force) {
  const d = await scraper.home(force);
  heroPage(animeHero(d), `
      ${chips([['series', '#/browse/1'], ['movies', '#/movies/1'], ['schedule', '#/schedule'], ['filter', '#/filter/1']].map(([k, href]) => [t(k), href]))}
      ${row(t('continueWatching'), continued(['anime']))}
      ${animeRows(d)}`, () => animeHome(true));
}

// Infinite scroll: when the end of box's .grid nears the screen, the next page's cards are appended.
// next(n) resolves to page n as { items, pages }; it re-checks at once, so a tall screen keeps filling.
function lazyGrid(box, pages, next) {
  let page = 1;
  if (pages <= page) return;
  const end = document.createElement('div');
  box.append(end);
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const d = await next(++page).catch(() => null);
    if (!d || !end.isConnected) return; // offline, or the user left the page
    box.querySelector('.grid')?.insertAdjacentHTML('beforeend', d.items.map(card).join(''));
    if (d.pages > page) io.observe(end); else end.remove();
  }, { rootMargin: '600px' });
  io.observe(end);
}

// later pages are fetched fresh (force): a background re-check of a cached one would redraw the view from page 1
function listView(label, d, next, refresh) {
  view.innerHTML = `<div class="page"><h1>${esc(t(label))}</h1>${grid(d.items)}</div>`;
  pageRefresh = refresh; // pull down on a phone; every page is also asked again in the background (quietCheck)
  lazyGrid($('.page'), d.pages, next);
}

async function list(kind, force) {
  listView(kind === 'movies' ? t('movies') : t('series'), await scraper[kind](1, force), n => scraper[kind](n, true), () => list(kind, true));
}

// Home rows the site has a full listing for. Rows without one (latest movies) show the row's own items.
const SECTIONS = {
  'الأكثر مشاهدة': '/browse?sort=Most Viewed',
  'أكثر الأنميات مشاهدة': '/browse?sort=Most Viewed',
  'أكثر الأفلام مشاهدة': '/movies?sort=Most Viewed',
  'أشهر أنميات الموسم': '/seasonal',
};
async function section(name, force) {
  const refresh = () => section(name, true);
  if (SECTIONS[name]) return listView(name, await scraper.list(SECTIONS[name], 1, force), n => scraper.list(SECTIONS[name], n, true), refresh);
  if (name === 'أحدث الحلقات') return listView(name, await scraper.newEpisodes(1, force), n => scraper.newEpisodes(n, true), refresh);
  const r = (await scraper.home(force)).rows.find(r => r.title === name);
  if (r?.base) return listView(name, await scraper.list(r.base, 1, force), n => scraper.list(r.base, n, true), refresh); // a row naming its full listing (risto.js)
  listView(name, { items: r?.items || [], pages: 1 }, null, refresh);
}

// the anime schedule, from animeschedule.net: today and the 6 days after, each show at its air time (in the phone's time zone).
// Its timetable runs Monday to Sunday: shows of the days already past this week are listed at their next airing, a week on.
// Its search box turns the day rows into one list of the matching shows, each with its day and time (all of the query's
// words found in the title, any order, accents ignored); the query stays through refreshes and coming back from a show.
let schedQ = '';
async function schedule(force) {
  const shows = await scraper.airTimes(force);
  const fmt = (opts, d) => new Intl.DateTimeFormat(lang, opts).format(d);
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), today = day(new Date()), days = {};
  for (const s of shows) {
    let at = new Date(s.at);
    if (day(at) < today) at = new Date(+at + 7 * 864e5);
    (days[day(at)] ||= []).push({ ...s, at });
  }
  const when = s => (n => n < 2 ? (r => r[0].toUpperCase() + r.slice(1))(new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(n, 'day'))
    : fmt({ weekday: 'long', day: 'numeric', month: 'short' }, s.at))(Math.round((day(s.at) - today) / 864e5))
    + ' · ' + fmt({ hour: 'numeric', minute: '2-digit' }, s.at) + (s.ep ? ` · ${t('epShort')} ${s.ep}` : '');
  const all = Object.values(days).flat().sort((a, b) => a.at - b.at);
  view.innerHTML = `<div class="page sched"><h1>${t('schedule')}</h1>
    <label class="sched-q">${ICON.search}<input type="search" id="sq" placeholder="${t('schedSearch')}" enterkeyhint="search" autocomplete="off" spellcheck="false" value="${esc(schedQ)}">
      <button type="button" class="search-clr" id="sqx" title="${t('clear')}" aria-label="${t('clear')}">${ICON.x}</button></label>
    <div id="sh"></div></div>
    <div class="rows sched-rows">${Object.keys(days).sort((a, b) => a - b).map(k => row(
      fmt({ weekday: 'long', day: 'numeric', month: 'long' }, new Date(+k)) + (+k === today ? ' · ' + t('today') : ''),
      days[k].sort((a, b) => a.at - b.at).map(s => ({ path: '/airing/' + s.route, type: 'anime', title: s.title, poster: s.poster,
        badge: fmt({ hour: 'numeric', minute: '2-digit' }, s.at) + (s.ep ? ` · ${t('epShort')} ${s.ep}` : '') })))).join('')}</div>`;
  const find = () => {
    const ws = fold(schedQ).split(' ').filter(Boolean), hits = ws.length ? all.filter(s => (f => ws.every(w => f.includes(w)))(fold(s.title))) : [];
    $('.sched-rows').hidden = !!ws.length;
    $('#sh').innerHTML = !ws.length ? '' : hits.length ? `<div class="dls">${hits.map(s => `<a class="dlg" href="#/airing/${esc(s.route)}"><img src="${esc(img(s.poster))}" alt="" loading="lazy">
      <div class="dl-info"><b dir="auto">${esc(s.title)}</b><small>${when(s)}</small></div><span class="chev">${ICON.next}</span></a>`).join('')}</div>`
      : `<div class="empty"><b>${t('schedNone')}</b>${t('schedNoneHint')}</div>`;
  };
  $('#sq').oninput = e => { schedQ = e.target.value; find(); };
  $('#sq').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); }; // done typing: put the keyboard away, keep the results
  $('#sqx').onmousedown = e => e.preventDefault(); // the box keeps focus (and the phone its keyboard)
  $('#sqx').onclick = () => { $('#sq').value = schedQ = ''; find(); $('#sq').focus(); };
  find();
  pageRefresh = () => schedule(true);
}

// a schedule card (#/airing/<animeschedule slug>): its title searched among the anime (witanime may not list it yet, or spell
// it its own way); the page is replaced by the search, so back returns to the schedule
async function airing(route) {
  const s = (await scraper.airTimes().catch(() => [])).find(x => x.route === route);
  location.replace('#/search/' + encodeURIComponent(s?.title || route.replace(/-/g, ' ')) + '?in=anime');
}

// loading placeholders: n cards (their image box already shimmers, see .card .img), and rows of them
const skel = n => Array.from({ length: n }, (_, i) => `<div class="card skel" style="--i:${i}"><div class="img"></div><div class="meta"><span class="bar"></span></div></div>`).join('');
// separate from the real list: placeholders never become selectable or playable episodes.
const epSkeleton = (n = 6) => n > 0 ? `<div class="ep-loading" role="status" aria-label="${t('loadingEpisodes')}">${Array.from({ length: n }, () => '<div class="ep skel ep-skel" aria-hidden="true"><div class="ep-thumb"></div><span><i class="bar"></i><i class="bar"></i></span></div>').join('')}</div>` : '';
// after a server menu's rows while more are still being looked up (play, cinema.js)
const ddSkel = () => `<div class="dd-skel" role="status" aria-label="${t('searchingServers')}"><span></span><span></span></div>`;
const skelRows = n => Array.from({ length: n }, () => `<section class="row"><h3><span class="bar"></span></h3><div class="track">${skel(8)}</div></section>`).join('');

// ---------- search: what the user meant ----------
// The sites match titles literally: "spiderman" doesn't find "Spider-Man", "naurto" finds nothing, and "solo leveling"
// isn't what witanime calls it. What was typed is asked first; when that finds little, it's asked again as the names that
// typo-tolerant title searches suggest (Kitsu for anime and manga, IMDb for films and series) and as its other spellings,
// and everything found is ranked by how close its title is to what was typed or to one of those names.
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ـ/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= '٩' ? 1632 : 1776))).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// strip request phrasing only at the edges; words inside a title still matter
const searchQuery = q => fold(q).replace(/^(?:(?:please |can you )?(?:search for|find|show me|watch)|(?:ابحث عن|ابحث لي عن|اريد مشاهده|اريد|مشاهده)) +/u, '').replace(/ +(?:مترجم|مدبلج|اون لاين)$/u, '').trim();
// sources alternate between "Ao Ashi 2nd Season" and "Aoashi Season 2"
const searchTitle = q => fold(q).replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
  .replace(/\b(first|second|third|fourth|fifth|sixth) (season|part|cour)\b/g, (_, n, k) => `${k} ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].indexOf(n) + 1}`)
  .replace(/\b(\d+) (season|part|cour)\b/g, '$2 $1').replace(/\b(season|part|cour) ?(\d+)\b/g, '$1 $2');
const searchNumbersMatch = (q, title) => {
  const numbers = searchTitle(title).split(' ');
  return searchTitle(q).split(' ').filter(w => /^\d+$/.test(w)).every(w => numbers.includes(w));
};
// adjacent swapped letters count as one typo ("naurto" -> "naruto")
function wordScore(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b) || Math.min(a.length, b.length) < 3) return 0;
  if (b.startsWith(a) && a.length >= 3) return .9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1]));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  const edits = d[a.length][b.length];
  return edits <= (Math.min(a.length, b.length) >= 6 ? 2 : 1) ? 1 - edits / Math.max(a.length, b.length) : 0;
}
function closeness(q, title) {
  const a = searchTitle(q), b = searchTitle(title);
  if (!a || !b) return 0;
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return 1;
  const words = a.split(' '), target = b.split(' ');
  // explicit years and season numbers must survive typo correction
  if (words.some(w => /^\d+$/.test(w) && !target.includes(w))) return 0;
  const compact = a.replace(/ /g, '');
  if (target.some((_, i) => {
    let joined = '';
    for (let j = i; j < target.length && joined.length < compact.length; j++) { joined += target[j]; if (joined === compact) return true; }
    return false;
  })) return .96;
  const used = new Set();
  let total = 0;
  for (const w of words) {
    let best = 0, at = -1;
    target.forEach((t, i) => { const score = used.has(i) ? 0 : wordScore(w, t); if (score > best) { best = score; at = i; } });
    if (at < 0) return 0; // every query word must match, even when reordered
    used.add(at); total += best;
  }
  return .96 * total / words.length;
}
// search the base title too: literal site search cannot resolve spacing and season wording together
const spellings = q => {
  const canonical = searchTitle(q), base = canonical.replace(/\b(?:season|part|cour) \d+\b/g, '').replace(/ +/g, ' ').trim();
  const w = canonical.split(' ').filter(Boolean);
  return [...new Set([base, base.replace(/ /g, ''), canonical, w.join('-'), w.join(''), ...w.filter(x => x.length >= 4 && !['season', 'part', 'cour'].includes(x)).sort((a, b) => b.length - a.length).slice(0, 1)])].filter(Boolean);
};
// each suggestion: a title's names (Kitsu's: canonical, English, romaji: "Solo Leveling" is "Ore dake Level Up na Ken")
const kitsu = async (kind, q) => (JSON.parse(await api.fetch(`https://kitsu.io/api/edge/${kind}?${new URLSearchParams({ 'filter[text]': q, 'page[limit]': 3, [`fields[${kind}]`]: 'canonicalTitle,titles' })}`)).data || [])
  .map(a => [a.attributes.canonicalTitle, a.attributes.titles?.en, a.attributes.titles?.en_jp]);
const SUGGEST = {
  anime: q => kitsu('anime', q), manga: q => kitsu('manga', q),
  film: async q => (JSON.parse(await api.fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(fold(q))}.json`)).d || [])
    .filter(x => /^(movie|tv)/.test(x.qid || '')).map(x => [x.l]),
};
const suggested = new Map(); // kind|query -> its suggested names (a promise), for this run
// only titles one of whose names is near what was typed (IMDb also lists whatever's popular)
const suggest = (kind, q) => {
  const k = kind + '|' + fold(q);
  if (!suggested.has(k)) suggested.set(k, SUGGEST[kind](q).then(l => [...new Set(l.filter(n => n.some(x => closeness(q, x) >= .65)).flat().filter(Boolean))].slice(0, 4), () => []));
  return suggested.get(k);
};
// ask(text) -> cards; even the source's literal results must match the query or a trusted alias.
async function fuzzySearch(q, kind, ask) {
  q = searchQuery(q);
  if (!q) return [];
  const found = new Map(), add = l => (l || []).forEach(c => found.has(c.path) || found.set(c.path, c));
  add(await ask(q).catch(() => []));
  let names = [q];
  if ([...found.values()].filter(x => closeness(q, x.title) >= .6).length < 3) {
    const sug = await suggest(kind, q);
    names = [q, ...sug];
    const variants = spellings(q);
    const more = [...new Set([...variants.slice(0, 2), ...sug, ...variants.slice(2)])].filter(v => v !== q).slice(0, 7);
    (await Promise.all(more.map(v => ask(v).catch(() => [])))).forEach(add);
  }
  const name = c => c.title.replace(/\s+الموسم\s.*$/, ''); // a show's seasons score alike, and stay in the order they came (cinema.js edSearch)
  const score = c => Math.max(closeness(q, name(c)), ...names.slice(1).map(n => .97 * closeness(n, name(c))));
  return [...found.values()].map(c => ({ c, s: score(c) })).filter(x => x.s >= .62 && searchNumbersMatch(q, x.c.title))
    .sort((a, b) => b.s - a.s || name(a.c).length - name(b.c).length).map(x => x.c); // as close: the shorter title (the show, before its spin-offs)
}

let searchRun = 0;
// #/search/<q>?in=<section>: all: one row per section, each filling in as its site answers (like the Android app);
// ?in=: only that section is asked, its matches in one grid. novels are the website's only
async function search(q) {
  const run = ++searchRun, hash = location.hash, current = () => run === searchRun && hash === location.hash;
  const IN = /\?in=(anime|manga|cinema|novels)$/, s = q.match(IN)?.[1] || '';
  q = q.replace(IN, '');
  $('#search').q.value = q;
  const tabs = `<div class="fchips">${['', 'anime', 'cinema', 'manga', ...(api.web ? ['novels'] : [])].map(k =>
    `<a class="fchip ${k === s ? 'on' : ''}" href="#/search/${encodeURIComponent(q)}${k && '?in=' + k}">${t(k || 'all')}</a>`).join('')}</div>`;
  const head = `<h1>${esc(t('results', q))} <a class="btn ghost small h1-btn" href="#/filter/1?search=${encodeURIComponent(q)}">${ICON.filter} ${t('filter')}</a></h1>${tabs}`;
  const animeP = () => fuzzySearch(q, 'anime', v => scraper.search(v).then(r => r.items)).catch(() => []);
  const novelsP = limit => nvLoad('/novels', { language: 'ar', limit, search: q }).then(j => j.data.map(nvCard)).catch(() => []);
  if (s) { // one section: a grid
    view.innerHTML = `<div class="page">${head}<div class="grid" id="sres">${skel(12)}</div></div>`;
    if (s === 'anime') { const items = await animeP(); if (current()) view.innerHTML = `<div class="page">${head}${grid(items)}</div>`; return; }
    const html = s === 'novels' ? grid(await novelsP(30)) : await moreResults(s === 'manga' && { search: q }, s === 'cinema' && { search: q }, [], true);
    if (current() && $('#sres')) $('#sres').outerHTML = html;
    return;
  }
  const ids = ['anime', 'cinema', 'manga', ...(api.web ? ['novels'] : [])];
  view.innerHTML = `<div class="page">${head}<div id="sempty"></div></div>` + ids.map(k => `<div class="rows sched-rows" id="s-${k}">${skelRows(1)}</div>`).join('');
  const more = (k, items) => items.length ? row(k, items, `#/search/${encodeURIComponent(q)}?in=${k}`) : '';
  const got = {};
  const done = (k, html) => { got[k] = html; if (!current()) return; $('#s-' + k).innerHTML = html;
    // "nothing here" only once every section has come back empty
    if (ids.every(i => i in got) && !ids.some(i => got[i])) $('#sempty').innerHTML = grid([]); };
  const anime = animeP();
  anime.then(items => done('anime', more('anime', items)));
  // films: the same title as an anime film is listed once, under anime (moreResults)
  anime.then(items => moreResults(null, { search: q }, items).catch(() => '')).then(html => done('cinema', html));
  moreResults({ search: q }, null).catch(() => '').then(html => done('manga', html));
  if (api.web) novelsP(12).then(items => done('novels', more('novels', items)));
}
// manga and film matches, as rows (the search page, and the filter page). mq: a manga browse query (MangaSwat's terms; and:
// more genre ids each card must have), fq: films (see filmQuery in filter.js; { search } alone for the search page); either
// null to leave that section out. egydead's anime films are already dropped by category; this also drops one it filed
// elsewhere when witanime listed the same film (same title, same year). asGrid: one grid of both (a search in one section)
async function moreResults(mq, fq, anime = [], asGrid) {
  mq ||= null; fq ||= null; // callers pass `false` for a section left out; `false?.filter` would throw
  const { and = [], ...api } = mq || {}, oq = mq && !and.length && olyQuery(new URLSearchParams(api));
  const ask = (kind, fn, s) => s ? fuzzySearch(s, kind, fn) : fn(); // a search: what was meant too (see fuzzySearch)
  const [m, tm, f] = await Promise.all([
    mq && ask('manga', s => load('mangaList', mUrl('series/', { ...api, ...(s && { search: s }), page_size: and.length ? 60 : 20 })).then(r => r.items), api.search).catch(() => null),
    oq && ask('manga', s => olyList({ ...oq, ...(s && { keyword: s }) }).then(r => r.items), oq.keyword).catch(() => null),
    !fq ? [] : fq.search ? ask('film', edSearch, fq.search).catch(() => []) : edList('all', 1).then(l => dubbed(l.items), () => [])]);
  const manga = mMerge([m?.filter(c => and.every(g => c.g?.includes(g))), tm]);
  let films = f.filter(c => (!fq.year || c.year === fq.year) && (!fq.type || (fq.type === 'TV') === /^\/cinema\/(serie|season|episode)\//.test(c.path))
    && (!fq.version || fq.version === 'both' || (fq.version === 'dub') === !!c.dub)
    && !anime.some(w => w.type === 'movie' && similar(w.title, c.title) >= .75 && (!w.year || !c.year || w.year === c.year)));
  if (fq?.genres?.length || fq?.country) { // from each title's page (cached): the first 24 candidates
    films = films.slice(0, 24);
    const pages = await Promise.all(films.map(c => load('edMovie', edUrl(c.path.slice('/cinema/'.length))).catch(() => null)));
    // Arabic spellings vary (أكشن / اكشن, مغامرة / مغامرات): compared without hamzas and spaces, by containment or a shared 4-letter stem
    const ar = s => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '');
    const same = (a, b) => (a = ar(a), b = ar(b), a.includes(b) || b.includes(a) || a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
    films = films.filter((c, i) => pages[i] && fq.genres.every(g => pages[i].genres.some(x => same(x, g))) && (!fq.country || pages[i].tags.some(x => same(x, fq.country))));
  }
  if (asGrid) return grid([...manga, ...films]);
  return (manga.length ? row(t('manga'), manga, '#/manga/browse/1' + (Object.keys(api).length ? '?' + new URLSearchParams(api) : '')) : '')
    + row(t('cinema'), films, fq && !fq.search ? '#/cinema/browse/all' : '');
}

// ---------- downloads ----------
const offlineHash = epPath => '#/offline/' + epPath.replace(/^\/(watch\/)?/, ''); // an anime's /watch/x, or a series' /cinema/episode/x
const mb = n => '\u2066' + (n / 1048576).toFixed(n > 1048576 * 100 ? 0 : 1) + ' MB\u2069'; // isolated LTR, so Arabic lines don't flip it to "MB 393"
// phones: the download service, which keeps the phone awake with its screen off, stays up while anything is downloading or
// waiting its turn, not only during each file: between two files the page looks up the next one's link, and Android won't
// start the service again once the app is in the background
let dlBusy = false;
const saveDownloads = () => {
  const busy = Object.values(store.downloads).some(d => d.state === 'active' || d.state === 'queued');
  if (busy !== dlBusy) { dlBusy = busy; api.downloadHold?.(busy, dlLabels()); }
  persist('downloads');
};
const dlLabels = () => ({ labelActive: t('dlNotifActive'), labelMany: t('dlNotifMany'), labelPreparing: t('dlPreparing') });

// the hosts the app can download from itself (see main.js); none on the website (web.js), whose tab can't keep files
const inAppHost = label => !!(api.download || api.downloadEnqueue) && MediaHosts.supports(label);
// Each show (an anime, a manga series) has its own queue: one episode/chapter at a time, oldest first, while
// different shows download side by side. A show can be paused on its own; Pause all holds every show.
const held = show => store.prefs.dlHeld?.[show] ?? !!store.prefs.dlPaused; // a show's own choice beats Pause all
function startDownload(item, quality = item.quality || store.prefs.dlQuality) {
  if (api.web) return WebDownloads.downloadVideo([{...item,quality}]);
  const cur = store.downloads[item.id];
  if (cur?.state === 'active' || cur?.state === 'done') return toast(t(cur.state === 'done' ? 'dlDone' : 'dlActive'));
  const wait = held(item.show), busy = Object.values(store.downloads).some(d => d.show === item.show && d.state === 'active');
  store.downloads[item.id] = { ...item, host: item.host || store.prefs.dlHost, quality, state: wait ? 'paused' : 'queued', received: 0, total: 0, at: Date.now() };
  saveDownloads(); drawDownloads();
  toast(t(wait ? 'dlPausedAll' : busy ? 'dlQueued' : 'dlPreparing'));
  pumpDownloads();
}
document.addEventListener('visibilitychange', () => { // back in the app: anything queued meanwhile goes to the service
  if (document.hidden) return;
  api.downloadHold?.(dlBusy, dlLabels());
  pumpDownloads();
});
async function animeDownloadLinks(epPath, title, alt, ep) {
  const results = await Promise.allSettled([api.downloadLinks(epPath), api.awSources(title, alt || '', ep)]);
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}
async function runEpisode(d) {
  let links = [];
  try { links = d.kind === 'cinema' ? await edDownloads(d.slug) : (await animeDownloadLinks(d.epPath, d.title, d.alt, d.ep)).filter(l => inAppHost(l.label)); } catch (e) { console.error(e); }
  const rank = l => l.quality === d.quality ? -1 : QUALITY.indexOf(l.quality);
  links.sort((a, b) => rank(a) - rank(b) || Number(b.label === d.host) - Number(a.label === d.host));
  for (const l of links) { // chosen quality first, then best to worst if it fails to start
    if (d.state !== 'active') return; // paused or cancelled while the links were fetched
    try {
      d.quality = l.quality;
      d.file = await api.download(d.id, l.token, `${d.title} EP ${d.ep} ${l.quality}`, { // notification texts
        title: `${d.title} · ${t('episode')} ${d.ep}`, labelActive: t('dlNotifActive'), labelMany: t('dlNotifMany'),
        labelDone: t('dlNotifDone'), labelFailed: t('dlFailed') });
      saveDownloads(); drawDownloads(); toast(t('dlStarted'));
      if (held(d.show)) pauseDownload(d); // paused while it was starting
      return;
    } catch (e) { console.error(e); }
  }
  d.state = 'error';
  toast(t(links.length ? 'dlFailed' : 'dlNoHost'), true);
  throw new Error('no link started');
}

// manga chapters: page images (see download-pages in main.js)
const isManga = d => d.kind === 'manga';
function queueChapters(serie, chapters) { // serie {id, title, poster}, chapters [{id, n}] oldest first
  if (api.web) return WebDownloads.downloadManga(serie,chapters);
  let added = 0;
  const show = '/manga/series/' + serie.id;
  for (const c of chapters) {
    const id = 'manga:' + c.id, cur = store.downloads[id];
    if (cur && cur.state !== 'error' && cur.state !== 'cancelled') continue;
    store.downloads[id] = { id, kind: 'manga', show, chapterId: c.id, title: serie.title, ep: c.n, poster: serie.poster,
      state: held(show) ? 'paused' : 'queued', received: 0, total: 0, at: Date.now() + added++ };
  }
  saveDownloads();
  toast(added ? t('dlQueuedN', added) : t('dlDone'));
  drawDownloads();
  pumpDownloads();
}
async function runChapter(d) {
  const c = await mChapter(d.chapterId, true); // a download: not tied to the page shown
  if (!c.images.length) throw new Error('no pages');
  if (d.state !== 'active') return; // paused or cancelled while the chapter loaded
  d.total = c.images.length;
  d.meta = { prev: c.prev, next: c.next }; // to keep reading offline
  d.file = await api.downloadPages(d.id, c.images, [d.title, 'Chapter ' + d.ep], {
    title: `${d.title} · ${t('chapter')} ${d.ep}`, labelActive: t('dlNotifActive'), labelMany: t('dlNotifMany'), labelDone: t('dlNotifDone'), labelFailed: t('dlFailed') });
  saveDownloads();
}

// Phones: the queue runs in the download service (DownloaderPlugin.enqueue), which carries on with the screen off; this
// page was stopped there, and the next file sat at "Preparing download…" until the app was opened. The page hands it
// each item as soon as it's queued, then fetches every item's sources ahead of time, a few at once (a chapter's page
// images, an episode's file link), so the service needn't between files. It looks up any it reaches first itself.
const dlSent = new Set(), dlFetched = new Set(); // ids handed to the service; those whose sources it has (or that failed here)
const dlFetching = { pages: 0, episode: 0 }; // in flight: chapters 3 at once; episodes one by one (witanime answers only for the episode page its session loaded last)
const dlJob = d => isManga(d)
  ? { id: d.id, show: d.show, kind: 'pages', chapterId: String(d.chapterId), folder: [d.title, 'Chapter ' + d.ep],
    title: `${d.title} · ${t('chapter')} ${d.ep}`, labelDone: t('dlNotifDone'), labelFailed: t('dlFailed') }
  : { id: d.id, show: d.show, kind: 'episode', epPath: d.epPath, quality: d.quality || '', name: `${d.title} EP ${d.ep}`,
    title: `${d.title} · ${t('episode')} ${d.ep}`, labelDone: t('dlNotifDone'), labelFailed: t('dlFailed') };
async function dlSources(d) {
  if (isManga(d)) {
    const c = await mChapter(d.chapterId, true);
    d.meta = { prev: c.prev, next: c.next }; // to keep reading offline
    return c.images.length ? { urls: c.images } : {};
  }
  const links = (await animeDownloadLinks(d.epPath, d.title, d.alt, d.ep)).filter(l => inAppHost(l.label));
  links.sort((a, b) => (a.quality === d.quality ? -1 : QUALITY.indexOf(a.quality)) - (b.quality === d.quality ? -1 : QUALITY.indexOf(b.quality)) || Number(b.label === d.host) - Number(a.label === d.host));
  for (const l of links) { try { return { url: await api.downloadUrl(l.token), quality: l.quality }; } catch (e) { console.error(e); } }
  return {};
}
// episode or chapter 1 first, up to the last: a batch is added in the same millisecond, so the time added only breaks ties
const dlOrder = (a, b) => parseFloat(a.ep) - parseFloat(b.ep) || a.at - b.at;
function prefetch() {
  for (;;) {
    const d = Object.values(store.downloads).filter(d => dlSent.has(d.id) && !dlFetched.has(d.id) && d.state === 'queued'
      && (isManga(d) ? dlFetching.pages < 3 : !dlFetching.episode)).sort(dlOrder)[0];
    if (!d) return;
    const k = isManga(d) ? 'pages' : 'episode';
    dlFetched.add(d.id); dlFetching[k]++;
    dlSources(d).then(src => dlSent.has(d.id) && Object.keys(src).length && api.downloadEnqueue({ ...dlJob(d), ...src }), e => console.error(e))
      .finally(() => { dlFetching[k]--; prefetch(); });
  }
}
// starts the next waiting item of every show that isn't paused and has nothing downloading (phones: see dlSent)
function pumpDownloads() {
  if (api.web) return; // only native apps have an in-app download queue
  if (api.downloadEnqueue) {
    for (const d of Object.values(store.downloads).filter(d => d.state === 'queued' && !held(d.show) && !dlSent.has(d.id)).sort(dlOrder)) {
      dlSent.add(d.id);
      api.downloadEnqueue(dlJob(d));
    }
    return prefetch();
  }
  const shows = {};
  for (const d of Object.values(store.downloads)) (shows[d.show] ||= []).push(d);
  for (const [show, items] of Object.entries(shows)) {
    if (held(show) || items.some(d => d.state === 'active')) continue;
    const d = items.filter(d => d.state === 'queued').sort(dlOrder)[0];
    if (!d) continue;
    d.state = 'active'; d.received = 0; d.total = 0;
    drawDownloads();
    (isManga(d) ? runChapter(d) : runEpisode(d)).catch(e => {
      console.error(e);
      if (d.state === 'active') d.state = 'error';
      saveDownloads(); drawDownloads();
      pumpDownloads();
    });
  }
}

// Pausing stops active transfers and holds everything waiting ('paused') until resumed, which queues them again.
// ponytail: a stopped episode restarts from 0 (the file is unzipped while it streams, so no byte-range resume).
function pauseDownload(d) {
  if (d.state === 'active' || dlSent.has(d.id)) api.downloadCancel(d.id); // (phones: a waiting one leaves the service's queue)
  d.state = 'paused'; d.received = 0;
  dlSent.delete(d.id); dlFetched.delete(d.id);
}
function setHeld(items, on) {
  if (on) items.filter(d => d.state === 'active' || d.state === 'queued').forEach(pauseDownload);
  else items.filter(d => d.state === 'paused').forEach(d => d.state = 'queued');
  persist('prefs'); saveDownloads(); drawDownloads();
  if (!on) pumpDownloads();
}
function setDlPaused(on) { // Pause all / Resume all: every show, dropping their own choices
  store.prefs.dlPaused = on; store.prefs.dlHeld = {};
  setHeld(Object.values(store.downloads), on);
}
function setShowPaused(show, on) {
  (store.prefs.dlHeld ||= {})[show] = on;
  setHeld(Object.values(store.downloads).filter(d => d.show === show), on);
}

api.onDownload(p => {
  const d = store.downloads[p.id];
  if (!d) return;
  if (d.state === 'paused' && p.state !== 'done') return; // the stopped transfer reporting in (progress, then 'cancelled')
  const changed = d.state !== p.state;
  if (p.state !== 'active') { dlSent.delete(p.id); dlFetched.delete(p.id); } // out of the service: queued again (retry) goes back in
  Object.assign(d, p);
  if (changed) {
    saveDownloads();
    if (p.state === 'done' && !immersed) toast(t('dlFinished', `${d.title} ${isManga(d) ? t('chapter') : t('ep')} ${d.ep}`));
    if (p.state === 'error') toast(t('dlFailed'), true);
    if (p.state !== 'active') pumpDownloads(); // that show's next one
  }
  drawDownloads(changed ? null : d);
});

// #/downloads: one card per anime/manga; #/downloads/<show path>: that one's episodes or chapters
const dlStatus = d => {
  const pct = d.total ? Math.floor(d.received / d.total * 100) : 0;
  if (d.state === 'active') return !d.total ? t('dlPreparing') : isManga(d) ? `${t('pagesOf', d.received, d.total)} · ${pct}%` : `${mb(d.received)} / ${mb(d.total)} · ${pct}%`;
  if (d.state === 'done') return t('offline') + (d.total ? ' · ' + (isManga(d) ? t('pagesN', d.total) : mb(d.total)) : '');
  return { queued: t('dlQueued'), paused: t('dlPaused'), error: t('dlFailed'), cancelled: t('dlCancelled') }[d.state] || '';
};
const dlKind = d => t(isManga(d) ? 'manga' : d.kind === 'cinema' ? 'cinema' : 'kindAnime');
const showHref = show => /^\/(manga|cinema|novels)\//.test(show) ? '#' + show : '#/title' + show;
const dlGroups = () => {
  const g = {};
  for (const d of Object.values(store.downloads)) (g[d.show] ||= []).push(d);
  return Object.entries(g).map(([show, items]) => ({ show, items, at: Math.max(...items.map(d => d.at)) })).sort((a, b) => b.at - a.at);
};
const dlRow = d => {
  const pct = d.total ? Math.floor(d.received / d.total * 100) : 0;
  const btn = (act, icon, label, cls = '') => `<button class="icon-btn ${cls}" data-act="${act}" title="${label}">${icon}</button>`;
  return `<div class="dl ${d.state}" data-id="${esc(d.id)}" data-pick="${esc(d.id)}">
    <div class="dl-info"><b>${isManga(d) ? t('chapter') : t('episode')} ${esc(d.ep)}${d.quality ? `<span class="dl-q">${esc(d.quality)}</span>` : ''}${isManga(d) && store.mangaSeen[d.chapterId] === 2 ? `<i class="rd-badge">${t('chRead')}</i>` : ''}</b>
      ${d.state === 'active' ? `<div class="dl-bar"><i style="width:${pct}%"></i></div>` : ''}<small class="dl-st" dir="auto">${dlStatus(d)}</small></div>
    <div class="dl-actions">${d.state === 'done' ? btn('play', isManga(d) ? ICON.eye : ICON.play, isManga(d) ? t('read') : t('play'), 'go') : ''}${d.state === 'error' || d.state === 'cancelled' ? btn('retry', ICON.refresh, t('retry')) : ''}
      ${(w => btn(w ? 'cancel' : 'delete', w ? ICON.x : ICON.trash, w ? t('cancel') : t('del')))(['active', 'queued', 'paused'].includes(d.state))}</div>
  </div>`;
};
const removeDownload = async d => {
  if (d.state === 'active' || dlSent.has(d.id)) api.downloadCancel(d.id);
  if (d.file) await api.downloadDelete(d.file).catch(() => {});
  delete store.downloads[d.id];
};
const pending = items => items.some(d => ['active', 'queued', 'paused'].includes(d.state));
// one show's Pause / Resume: on its row in the list and on its own page, while it has anything left to download
const showToggle = (show, items, cls = '') => !pending(items) ? ''
  : `<button class="icon-btn dl-show ${cls}" data-show="${esc(show)}" title="${t(held(show) ? 'showResume' : 'showPause')}" aria-label="${t(held(show) ? 'showResume' : 'showPause')}">${held(show) ? ICON.download : ICON.pause}</button>`;
// Pause all / Resume all, in the downloads list's title (a show's own page has just its own toggle): shown while anything is downloading, waiting or paused
const dlToggle = () => !Object.values(store.downloads).some(d => ['active', 'queued', 'paused'].includes(d.state)) ? ''
  : `<button class="btn ghost small h1-btn" id="dlPause">${store.prefs.dlPaused ? ICON.play + ' ' + t('resumeAll') : ICON.pause + ' ' + t('pauseAll')}</button>`;
// download rows' actions, on one (its buttons, its long-press menu) or several picked: also marking them read / watched
const dlSeen = d => (isManga(d) ? store.mangaSeen[d.chapterId] === 2 : !!store.seen[d.epPath]);
const failedDl = d => d.state === 'error' || d.state === 'cancelled';
async function dlAct(ds, act) {
  if (act === 'play') return void (location.hash = isManga(ds[0]) ? '#/manga/read/' + ds[0].chapterId : offlineHash(ds[0].epPath));
  if (act === 'delete') {
    const d = ds[0], what = ds.length > 1 ? t('confirmDelN', ds.length) : t('confirmDel', `${d.title} · ${t(isManga(d) ? 'chapter' : 'episode')} ${d.ep}`);
    if (!await confirmSheet(what, t('confirmDelHint'), t('del'))) return;
  }
  for (const d of ds) {
    const [k, id, v] = isManga(d) ? ['mangaSeen', d.chapterId, 2] : ['seen', d.epPath, 1];
    if (act === 'seen') store[k][id] = v;
    if (act === 'unseen') delete store[k][id];
    if (act === 'cancel') {
      if (d.state === 'active' || dlSent.has(d.id)) api.downloadCancel(d.id);
      if (d.state === 'queued' || d.state === 'paused') { d.state = 'cancelled'; dlSent.delete(d.id); }
    }
    if (act === 'retry' && failedDl(d)) d.state = held(d.show) ? 'paused' : 'queued';
    if (act === 'delete') await removeDownload(d);
  }
  if (act === 'seen' || act === 'unseen') { persist('seen'); persist('mangaSeen'); }
  saveDownloads(); drawDownloads();
  if (act === 'retry') pumpDownloads();
}
const dlActs = (ds, one) => {
  const m = isManga(ds[0]), seen = one && dlSeen(ds[0]);
  return [
    one && ds[0].state === 'done' && ['play', m ? t('read') : t('play')],
    (!one || !seen) && ['seen', t(m ? 'markRead' : 'markWatched')],
    (!one || seen) && ['unseen', t(m ? 'markUnread' : 'markUnwatched')],
    ds.some(failedDl) && ['retry', t('retry')],
    ds.some(d => pending([d])) && ['cancel', t('cancel')],
    ['delete', t(one ? 'delDownload' : 'delDownloads')],
    one && ['select', t('select')],
  ].filter(Boolean);
};
function drawDownloads(only) {
  if (!location.hash.startsWith('#/downloads')) return;
  view.onclick = e => {
    if (e.target.closest('#dlPause')) return setDlPaused(!store.prefs.dlPaused);
    const b = e.target.closest('.dl-show');
    if (b) { e.preventDefault(); setShowPaused(b.dataset.show, !held(b.dataset.show)); } // inside the show's link on the list
  };
  const key = decodeURIComponent(location.hash.slice('#/downloads'.length)); // '' or a show path like /anime/naruto
  const row = only && document.querySelector(`.dl[data-id="${CSS.escape(only.id)}"]`);
  if (row) { // progress tick: just that row
    row.querySelector('.dl-bar i')?.style.setProperty('width', (only.total ? only.received / only.total * 100 : 0) + '%');
    row.querySelector('.dl-st').textContent = dlStatus(only);
    return;
  }
  const groups = dlGroups();
  if (!key) {
    view.innerHTML = `<div class="page"><h1>${t('downloads')} ${dlToggle()}</h1>${groups.length ? `${selBar()}<div class="dls">${groups.map(({ show, items }) => {
      const d0 = items[0], done = items.filter(d => d.state === 'done').length, act = items.filter(d => ['active', 'queued', 'paused'].includes(d.state));
      const r = act.reduce((s, d) => s + d.received, 0), tot = act.reduce((s, d) => s + d.total, 0);
      return `<a class="dlg" data-pick="${esc(show)}" href="#/downloads${esc(show)}"><img src="${esc(img(d0.poster))}" alt="">
        <div class="dl-info"><b dir="auto">${esc(d0.title)}</b>
          <small>${dlKind(d0)} · ${isManga(d0) ? t('chCount', done) : t('epCount', done)}${act.length ? ' · ' + t('dlActiveN', act.length) : ''}</small>
          ${act.length ? `<div class="dl-bar"><i style="width:${tot ? r / tot * 100 : 0}%"></i></div>` : ''}</div>
        ${showToggle(show, items)}<span class="chev">${ICON.next}</span></a>`;
    }).join('')}</div>` : emptyState(ICON.download, t('noDownloads'), t('noDownloadsHint'))}</div>`;
    if (!groups.length) return;
    // shows, one or several (long-press one, or pick them): pause / resume what they have left, delete all they have
    const of = shows => groups.filter(g => shows.includes(g.show));
    const acts = (shows, one) => (gs => [
      gs.some(g => pending(g.items) && !held(g.show)) && ['pause', t('showPause')],
      gs.some(g => pending(g.items) && held(g.show)) && ['resume', t('showResume')],
      ['delete', t('deleteAll')],
      one && ['select', t('select')],
    ].filter(Boolean))(of(shows));
    const run = async (v, shows) => {
      if (v === 'select') return start(shows[0]);
      if (v !== 'delete') return of(shows).forEach(g => setShowPaused(g.show, v === 'pause'));
      const items = of(shows).flatMap(g => g.items);
      if (!await confirmSheet(t('confirmDelN', items.length), t('confirmDelHint'), t('deleteAll'))) return;
      for (const d of items) await removeDownload(d);
      saveDownloads(); drawDownloads();
    };
    const start = selectable($('.dls'), () => groups.map(g => g.show), acts, run);
    pagePress = ['.dlg', a => pickSheet(of([a.dataset.pick])[0].items[0].title, acts([a.dataset.pick], true), '', v => run(v, [a.dataset.pick]))];
    return;
  }
  const items = (groups.find(g => g.show === key)?.items || []).sort((a, b) => parseFloat(a.ep) - parseFloat(b.ep) || a.at - b.at);
  if (!items.length) return location.replace('#/downloads');
  const d0 = items[0], size = items.filter(d => d.state === 'done' && !isManga(d)).reduce((s, d) => s + d.total, 0);
  view.innerHTML = `<div class="page"><h1><a class="h1-back" href="#/downloads" aria-label="${t('back')}">${ICON.back}</a>${t('downloads')}</h1>
    <div class="dl-hero"><img src="${esc(img(d0.poster))}" alt="">
      <div><a class="dl-title" href="${esc(showHref(key))}" dir="auto">${esc(d0.title)}</a>
        <small>${dlKind(d0)} · ${isManga(d0) ? t('chCount', items.length) : t('epCount', items.length)}${size ? ' · ' + mb(size) : ''}</small></div>
      ${showToggle(key, items)}<button class="icon-btn" id="delAll" title="${t('deleteAll')}" aria-label="${t('deleteAll')}">${ICON.trash}</button></div>
    ${selBar()}<div class="dls">${items.map(dlRow).join('')}</div></div>`;
  const byIds = ids => ids.map(id => store.downloads[id]).filter(Boolean);
  const start = selectable($('.dls'), () => items.map(d => d.id), ids => dlActs(byIds(ids)), (v, ids) => dlAct(byIds(ids), v));
  pagePress = ['.dl', r => {
    const d = store.downloads[r.dataset.id];
    if (d) pickSheet(`${t(isManga(d) ? 'chapter' : 'episode')} ${d.ep}`, dlActs([d], true), '', v => v === 'select' ? start(d.id) : dlAct([d], v));
  }];
  $('#delAll').onclick = async () => {
    if (!await confirmSheet(t('confirmDelAll', items.length), t('confirmDelHint'), t('deleteAll'))) return;
    for (const d of items) await removeDownload(d);
    saveDownloads(); location.replace('#/downloads');
  };
  $('.dls').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'), d = b && store.downloads[b.closest('.dl').dataset.id];
    if (d) dlAct([d], b.dataset.act);
  });
}

function offline(epPath) {
  const d = store.downloads[epPath];
  if (d?.state !== 'done') return location.replace(epPath.startsWith('/cinema/') ? edHref(epPath.slice(8)) : playHash(epPath));
  store.history[d.show] = { show: d.show, ...(d.slug ? { slug: d.slug } : { epPath }), ep: d.ep, title: d.title, poster: d.poster, at: Date.now() }; // a series' entry is by slug (cinema.js)
  store.seen[epPath] = 1;
  persist('history'); persist('seen');
  view.innerHTML = `<div class="player">
    <header>
      <button class="icon-btn" id="back" title="${t('back')}" aria-label="${t('back')}">${ICON.back}</button>
      <div class="ttl"><a href="${esc(showHref(d.show))}">${esc(d.title)}</a><small>${t('episode')} ${esc(d.ep)}</small></div>
      <div class="sp"></div>
      ${api.cast ? `<button class="icon-btn pcast" title="${t('cast')}" aria-label="${t('cast')}">${ICON.cast}</button>` : ''}
      ${skipBtn}
      <span class="chip">${ICON.download} ${t('offline')}</span>
    </header>
    <div class="stage"><video controls autoplay playsinline src="${esc(api.fileSrc(d.file))}" data-file="${esc(d.file)}"></video></div>
    ${playBar(true)}
  </div>`;
  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/downloads'));
  if (epPath.startsWith('/watch/')) { const v = $('.player video'); skipIntro(d.title, '', d.ep, () => v.currentTime, at => { v.currentTime = at; }); if (!epPath.startsWith('/watch/movie/')) markFiller(d.title, '', d.ep); } // not a film or a series: they aren't on AniSkip
}

// as on Android: a search through the titles, and a chip per kind it holds (none when it holds one). kept while the page redraws
let listKind = '', listQ = '';
const listKindOf = p => /^\/(manga|cinema|novels)\//.exec(p)?.[1] || 'anime'; // (a film from the anime sites is /movie/)
function myList() {
  const all = Object.values(store.list).sort((a, b) => b.at - a.at), nh = Object.keys(store.hidden).length;
  const kinds = ['anime', 'cinema', 'manga', 'novels'].filter(k => all.some(i => listKindOf(i.path) === k));
  if (kinds.length < 2 || !kinds.includes(listKind)) listKind = ''; // its last title gone: back to all
  view.innerHTML = `<div class="page"><h1>${t('myList')}${nh ? ` <a class="btn ghost small h1-btn" href="#/hidden">${ICON.eyeSlash} ${t('openHidden', nh)}</a>` : ''}</h1>${!all.length ? emptyState(ICON.bookmark, t('listEmpty'), t('listHint')) : `
    <form class="fsearch" id="lsearch">${ICON.search}<input type="search" enterkeyhint="search" autocomplete="off" placeholder="${t('listSearchPh')}" aria-label="${t('listSearchPh')}" value="${esc(listQ)}"></form>
    ${kinds.length > 1 ? `<div class="fchips" id="lkinds">${['', ...kinds].map(k => `<button type="button" class="fchip list-kind ${k === listKind ? 'on' : ''}" data-k="${k}" aria-pressed="${k === listKind}">${t(k || 'all')}</button>`).join('')}</div>` : ''}
    <div id="lgrid"></div>`}</div>`;
  if (!all.length) return;
  // only the cards: the box keeps its focus and the phone its keyboard while typing
  const draw = () => { const q = listQ.trim().toLowerCase(); $('#lgrid').innerHTML = grid(all.filter(i => (!listKind || listKindOf(i.path) === listKind) && (i.title || '').toLowerCase().includes(q))); };
  draw();
  $('#lsearch input').oninput = e => { listQ = e.target.value; draw(); };
  $('#lsearch').onsubmit = e => { e.preventDefault(); e.target.querySelector('input').blur(); }; // done typing: put the keyboard away, keep the results
  if ($('#lkinds')) $('#lkinds').onclick = e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    listKind = b.dataset.k;
    $('#lkinds').querySelectorAll('[data-k]').forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
    draw();
  };
}

// #/hidden: what was long-pressed away, by kind; ✕ (the card's remove button) brings one back
function unhidden() { toast(t('shown')); settingsModal() ? settingsView(settingsModal()) : hiddenView(); } // shown in the desktop's settings modal, or the page
// the hidden cards by kind: the page's, and the settings modal's hidden-items tab (h: its smaller heading there)
function hiddenGrid(h = 'h2') {
  const all = Object.values(store.hidden).sort((a, b) => b.at - a.at).map(x => ({ ...x, rm: 'hidden:' + x.path }));
  const kinds = [['novels', x => x.type === 'novel'], ['anime', x => x.type !== 'novel' && x.type !== 'manga' && x.type !== 'cinema'], ['manga', x => x.type === 'manga'], ['cinema', x => x.type === 'cinema']];
  return all.length ? kinds.map(([k, f]) => (l => l.length ? `<${h}>${t(k)} <small>${l.length}</small></${h}>${grid(l)}` : '')(all.filter(f))).join('')
    : emptyState(ICON.eyeSlash, t('noHidden'), t('hiddenHint'));
}
function hiddenView() {
  view.innerHTML = `<div class="page hidden-page"><h1>${t('hiddenTitle')}</h1><p class="hint">${t('hiddenHint')}</p>${hiddenGrid()}</div>`;
}

// phones: a title's page in two tabs, as the app has it: details (and characters, more like this), then its list (episodes,
// chapters). wide screens show both, one under the other. the list's sections carry data-pane="eps"
let detTab = ['', 'det']; // the tab open and its page's address: a redraw (route(true)) keeps it
const detTabs = (list, n) => `<div class="det-tabs" role="tablist">${[['det', t('details')], ['eps', `${list} <small>${n}</small>`]]
  .map(([k, s]) => `<button role="tab" data-tab="${k}">${s}</button>`).join('')}</div>`;
// a title's top, all four kinds, one part after another: wide screens show them beside the poster, phones lay them out as the native app's
// page (style.css, Screens.kt DetailPage). kinds: its type and status, red under the names there. more: its ⋮ menu there, the same buttons
const detHead = ({ list, banner, poster, blur = false, title, alt, meta = [], kinds = [], views, chips = [], desc, rating = '', play, actions = '', more = '' }) => `
  <div class="det-bar"><button class="icon-btn" id="det-back" aria-label="${t('back')}">${ICON.back}</button><b dir="auto">${esc(title)}</b><button class="icon-btn" id="det-dots" aria-label="${t('more')}">${ICON.dots}</button></div>
  ${list ? detTabs(...list) : ''}
  <div class="det-hero"><div class="bg${blur ? ' blur' : ''}" data-banner="${esc(banner || '')}"></div>
    <div class="det ${poster ? '' : 'bare'}">
      ${poster ? `<img class="poster" src="${esc(poster)}" alt="">` : ''}
      <div class="det-main">
        <div class="det-names">
          <h1 dir="auto">${esc(title)}</h1>${alt ? `<div class="alt" dir="auto">${esc(alt)}</div>` : ''}
          ${meta.length ? `<div class="det-meta">${meta.map(x => `<span><bdi>${esc(x)}</bdi></span>`).join('')}</div>` : ''}
          ${kinds.length ? `<div class="det-kinds">${kinds.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="det-story">
          <div class="chips">${kinds.map(x => `<span class="chip kind">${esc(x)}</span>`).join('')}${views ? `<span class="chip kind">${t('views', views)}</span>` : ''}${chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>
          ${desc ? `<p class="desc" dir="auto">${esc(desc)}</p>` : ''}
        </div>
        <div class="det-do">
          ${rating}
          ${views ? `<span class="det-stat">${ICON.eye}<b>${views}</b></span>` : ''}
          <div class="actions">
            ${play ? `<a class="btn play" href="${esc(play.href)}">${play.icon || ICON.play} ${esc(play.label)}</a>` : ''}
            ${actions}
            <div class="det-more">${more}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  ${play ? `<a class="btn play det-fab" data-pane="eps" href="${esc(play.href)}">${play.icon || ICON.play} ${esc(play.label)}</a>` : ''}`;
// the ⋮ menu: any tap closes it, on an entry too (toggled by its own button)
document.addEventListener('click', e => e.target.closest('#det-dots') || $('.det-more.open')?.classList.remove('open'));
function wireDetTabs() {
  const bg = $('.det-hero .bg'), hash = location.hash;
  if (bg) {
    const h = { info: hash, title: $('.det h1')?.textContent || '', alt: $('.det .alt')?.textContent || '', banner: bg.dataset.banner, poster: $('.det .poster')?.getAttribute('src') || '' };
    const paint = url => { if (url && bg.isConnected && location.hash === hash) bg.style.backgroundImage = `url("${String(img(url)).replaceAll('"', '%22')}")`; };
    if (bg.classList.contains('blur')) paint(bg.dataset.banner); // the cover itself, blurred to its colours: no wide art is looked up
    else { paint(heroArt.get(backdropKey(h))); resolveBackdrop(h).then(paint).catch(() => {}); }
  }
  document.body.classList.add('det-open'); // on phones its bar takes the nav's place and the dock goes: route() brings them back
  $('#det-back').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
  const more = $('.det-more'), dots = $('#det-dots');
  dots.hidden = ![...more.children].some(b => getComputedStyle(b).display !== 'none');
  dots.onclick = () => more.classList.toggle('open');
  $('.det .desc')?.addEventListener('click', e => e.currentTarget.classList.toggle('more')); // five lines on a phone, the rest on a tap
  const p = $('.det-page'), bs = [...document.querySelectorAll('.det-tabs button')];
  if (!p || !bs.length) return;
  const set = k => { p.dataset.tab = k; detTab = [location.hash, k]; bs.forEach(b => b.setAttribute('aria-selected', b.dataset.tab === k)); };
  set(detTab[0] === location.hash ? detTab[1] : 'det');
  bs.forEach(b => b.onclick = () => { set(b.dataset.tab); scrollTo(0, 0); });
}

// keep the same visible episode (or the section below it) when older rows arrive above it.
function keepEpisodePosition(list, update, reserve = false) {
  const page = list.closest('.det-page'), section = list.closest('[data-pane="eps"]');
  const candidates = [...list.querySelectorAll('[data-pick]'), ...page.querySelectorAll('#title-cast, #title-related')];
  const anchor = candidates.find(el => { const r = el.getBoundingClientRect(); return r.bottom > 96 && r.top < innerHeight; });
  const pick = anchor?.dataset.pick, top = anchor?.getBoundingClientRect().top, y = scrollY;
  const focused = document.activeElement?.closest('#eps [data-pick]')?.dataset.pick;
  if (reserve) section.style.minHeight = section.getBoundingClientRect().height + 'px';
  update();
  const rows = [...list.querySelectorAll('[data-pick]')];
  const next = pick ? rows.find(el => el.dataset.pick === pick) : anchor;
  if (focused) rows.find(el => el.dataset.pick === focused)?.focus({ preventScroll: true });
  const target = next?.isConnected ? scrollY + next.getBoundingClientRect().top - top : y;
  if (Math.abs(target - scrollY) > .5) scrollTo({ top: target, behavior: 'instant' });
}
async function title(path, force) {
  const d = await scraper.details(path, force);
  if (d.path && decodeURIComponent(d.path) !== path) return location.replace('#/title' + d.path); // found under another address (the website's episode cards, risto.js): its own
  const h = store.history[path];
  const type = path.startsWith('/movie') ? 'movie' : 'anime';
  const first = h?.epPath || d.episodes[0]?.path, hasEps = d.episodes.length > 1 || type === 'anime';
  const count = d.episodes.length + (d.episodesPending ? '+' : '');
  view.innerHTML = `<div class="det-page">${detHead({ list: hasEps && [t('episodes'), count], banner: img(d.banner), poster: d.poster && img(d.poster), title: d.title, alt: d.alt,
      chips: [...d.tags.filter(x => !/^\d+\.\d+$/.test(x)), ...d.genres], desc: d.desc, rating: Ratings.slot({title:d.title, alt:d.alt, type:"anime", path}),
      play: first && { href: playHash(first), label: h ? t('resume', h.ep) : t('play') },
      actions: `${api.web && type==='movie' && first ? `<button class="btn ghost" id="web-film-dl">${ICON.download} ${t('downloadShort')}</button>` : ''}
            <button class="btn ghost" id="fav">${inList(path) ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList')}</button>`,
      more: `${d.trailer ? `<button class="btn ghost" id="trl">${ICON.play} ${t('trailer')}</button>` : ''}
            ${type === 'anime' ? `<button class="btn ghost" id="grf">${ICON.star} ${t('epRatings')}</button>` : ''}` })}
    ${d.info.length ? `<div class="infos">${d.info.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>` : ''}
    ${hasEps ? `<div class="section" data-pane="eps"><h2>${t('episodes')} <small>${count}</small>
      <div class="ep-tools"><input id="epf" placeholder="${t('jump')}" type="number"><button class="btn ghost small ${store.prefs.hideFiller ? 'on' : ''}" id="hfl" aria-label="${t('hideFiller')}" title="${t('hideFiller')}" aria-pressed="${!!store.prefs.hideFiller}" hidden>${ICON.eyeSlash}</button><button class="btn ghost small" id="rev" aria-label="${t('reverse')}" title="${t('reverse')}">${ICON.sort}</button>
        ${selBtn('btn ghost small')}</div></h2>
      ${selBar()}<div class="eps list" id="eps" aria-busy="${!!d.episodesPending}"></div>
      <div class="ep-pagination"><span id="ep-count" aria-live="polite"></span><button type="button" class="btn ghost" id="ep-more" aria-controls="eps">${t('moreEpisodes')}${ICON.caretDown}</button></div></div>` : ''}
    <section class="section" id="title-cast" hidden></section>
    <div id="title-related">${d.related.length ? row(t('moreLike'), d.related) : ''}</div></div>`;
  wireDetTabs();

  CastInfo.mount($('#title-cast'), [d.title, ...(d.alt || '').split(/[,،]/)], 'anime');
  if (type === 'anime') $('#grf').onclick = () => ratingsSheet([d.title, ...(d.alt || '').split(/[,،]/)], '', true);
  const eps = $('#eps'), root = $('.det-page'), hash = location.hash;
  const actionEpisodes = d.episodes.map(e => ({ id: e.path, ep: e.ep }));
  const EPISODE_BATCH = 24;
  let rev = false, info = {}, kinds = {}, episodeLimit = EPISODE_BATCH;
  const matching = (f = $('#epf')?.value) => (rev ? [...d.episodes].reverse() : d.episodes)
    .filter(e => f ? parseFloat(e.ep) === +f // the number itself: 1 is episode 1, not 10-19. Typed, it shows even if hidden
      : !store.prefs.hideFiller || kinds[+e.ep] !== 'filler' || h?.epPath === e.path); // the one left off at stays: mixed ones too, they hold canon
  const shown = () => matching().slice(0, episodeLimit);
  const drawEps = () => eps && keepEpisodePosition(eps, () => {
    const visible = shown(), total = matching().length;
    eps.innerHTML = visible.map(e => epRow(e.ep, { ...info[+e.ep], kind: kinds[+e.ep] }, d.banner || d.poster, playHash(e.path), store.seen[e.path], h?.epPath === e.path, e.path)).join('')
      + (d.episodesPending ? epSkeleton(Math.max(0, episodeLimit - visible.length)) : '');
    const button = $('#ep-more');
    button.style.visibility = total > visible.length || d.episodesPending ? '' : 'hidden';
    button.disabled = !!d.episodesPending && total <= visible.length;
    $('#ep-count').textContent = d.episodesPending ? t('loadingEpisodes') : t('episodesShown', visible.length, total);
  });
  drawEps();
  if (eps) {
    scraper.episodeInfo([d.title, ...(d.alt || '').split(/\s*[,،]\s*/)]).then(i => { info = i; drawEps(); }).catch(() => {}); // names are extras: the numbers stand without them
    const hfl = $('#hfl');
    if (type === 'anime') scraper.filler([d.title, ...(d.alt || '').split(/\s*[,،]\s*/)]).then(k => { kinds = k; hfl.hidden = !Object.values(k).includes('filler'); drawEps(); }).catch(() => {}); // so are these marks
    hfl.onclick = () => { const on = store.prefs.hideFiller = !store.prefs.hideFiller; persist('prefs'); hfl.classList.toggle('on', on); hfl.setAttribute('aria-pressed', on); drawEps(); };
    $('#epf').oninput = () => { episodeLimit = EPISODE_BATCH; eps.closest('[data-pane="eps"]').style.minHeight = ''; drawEps(); };
    $('#ep-more').onclick = () => {
      const before = shown().length; episodeLimit += EPISODE_BATCH; drawEps();
      eps.querySelectorAll('[data-pick]')[before]?.focus({ preventScroll: true });
    };
    $('#rev').onclick = () => { rev = !rev; drawEps(); };
    epActions(eps, actionEpisodes, () => shown().map(e => e.path), drawEps,
      e => ({ id: e.id, epPath: e.id, show: showOf(e.id), title: d.title, ep: e.ep, poster: d.poster }), d.title);
  }
  if (type === 'anime' && eps) {
    const signature = data => JSON.stringify([data.title, data.alt, data.desc, data.poster, data.tags, data.genres, data.info]);
    titleLive = { hash, root, async refresh() {
      const next = await scraper.details(path);
      if (location.hash !== hash || !root.isConnected) return true;
      if (next.path && decodeURIComponent(next.path) !== path || signature(next) !== signature(d)) return false;
      keepEpisodePosition(eps, () => {
        const relatedChanged = JSON.stringify(d.related) !== JSON.stringify(next.related);
        Object.assign(d, next);
        actionEpisodes.splice(0, actionEpisodes.length, ...d.episodes.map(e => ({ id: e.path, ep: e.ep })));
        drawEps();
        const count = d.episodes.length + (d.episodesPending ? '+' : '');
        root.querySelectorAll('.det-tabs [data-tab="eps"] small, [data-pane="eps"] h2 > small').forEach(el => { el.textContent = count; });
        eps.setAttribute('aria-busy', String(!!d.episodesPending));
        if (!h && d.episodes[0]) root.querySelectorAll('.btn.play').forEach(a => { a.href = playHash(d.episodes[0].path); });
        if (relatedChanged) $('#title-related', root).innerHTML = d.related.length ? row(t('moreLike'), d.related) : '';
      }, true);
      return true;
    } };
  }
  $('#web-film-dl')?.addEventListener('click',()=>WebDownloads.downloadVideo([{id:first,epPath:first,show:path,title:d.title,ep:'',poster:d.poster}]));
  $('#fav').onclick = e => { const on = toggleList({ path, title: d.title, poster: d.poster, type }); e.currentTarget.innerHTML = on ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList'); };
  pageRefresh = () => title(path, true);
  if (d.trailer) $('#trl').onclick = () => showTrailer(d.trailer);
  else if (scraper.trailer) scraper.trailer(d.title, d.alt).then(url => { // the website's: an extra, it may come after the page
    if (!url || !$('.det-more') || $('#trl')) return;
    $('.det-more').insertAdjacentHTML('afterbegin', `<button class="btn ghost" id="trl">${ICON.play} ${t('trailer')}</button>`);
    $('#trl').onclick = () => showTrailer(url);
  }).catch(() => {});
  const chips = $('.chips', view); // this page's: left before the timetable answers, the chip lands nowhere
  if (type === 'anime') nextAir([d.title, ...(d.alt || '').split(/\s*[,،]\s*/)]).then(s => s && chips.insertAdjacentHTML('afterbegin', `<span class="chip red">${esc(s)}</span>`)).catch(() => {});
}
// a show's next airing, from the schedule's timetable (a schedule card's match, the other way round): its best-matching title
// if alike enough. Aired already this week: the same time a week on, the episode after
async function nextAir(names) {
  names = names.filter(Boolean);
  const [score, a] = (await scraper.airTimes()).map(a => [Math.max(...names.map(n => scraper.airScore(a.title, n))), a]).sort((x, y) => y[0] - x[0])[0] || [];
  if (!a || score < .6) return '';
  let at = +new Date(a.at), ep = a.ep;
  if (at < Date.now()) { at += 7 * 864e5; ep = /^\d+$/.test(ep) ? String(+ep + 1) : ''; }
  const d = new Date(at), fmt = o => new Intl.DateTimeFormat(lang, o).format(d);
  return `${t('nextEp')} · ${ep ? `${t('epShort')} ${ep} · ` : ''}${d.toDateString() === new Date().toDateString() ? t('today') : fmt({ weekday: 'long', day: 'numeric', month: 'short' })} · ${fmt({ hour: 'numeric', minute: '2-digit' })}`;
}
// an episode's row (anime, series): its still (else the show's picture), its number and, when known, its name
const epKind = k => (k ? `<em class="ep-kind ${k}">${t(k)}</em>` : ''); // "filler" or "mixed" (scraper.filler)
const epRow = (n, i, pic, href, seen, last, pick) => `<a class="ep ${seen ? 'seen' : ''} ${last ? 'last' : ''} ${store.downloads[pick]?.state === 'done' ? 'dld' : ''} ${picks?.has(pick) ? 'sel' : ''}"
  href="${href}"${pick ? ` data-pick="${esc(pick)}"` : ''}>
  <img src="${esc(img(i?.thumb || pic))}" alt="" loading="lazy"><span><b>${/^\d/.test(n) ? t('ep') + ' ' : ''}${esc(n)}${epKind(i?.kind)}</b>${i?.name ? `<small dir="auto">${esc(i.name)}</small>` : ''}</span></a>`;
// an episode list's actions (anime, series), on one (long-press) or several picked: mark them watched or not, download them or
// delete their copies (manga.js's). eps [{id: its seen and download key, ep}], ids() those shown, job(e) its download record
function epActions(list, eps, ids, redraw, job, title) {
  const pick = ps => eps.filter(e => ps.includes(e.id));
  const saved = e => store.downloads[e.id]?.state === 'done';
  const free = e => !store.downloads[e.id] || failedDl(store.downloads[e.id]); // not saved nor on its way
  const acts = (ps, one) => [
    (!one || !store.seen[ps[0]]) && ['seen', t('markWatched')],
    (!one || store.seen[ps[0]]) && ['unseen', t('markUnwatched')],
    pick(ps).some(free) && ['dl', t('downloadShort')],
    pick(ps).some(saved) && ['del', t(one ? 'delDownload' : 'delDownloads')],
    one && ['select', t('select')],
  ].filter(Boolean);
  const run = async (v, ps) => {
    const xs = pick(ps);
    if (v === 'select') return selectFrom(ps[0]);
    if (v === 'seen' || v === 'unseen') { for (const e of xs) v === 'seen' ? (store.seen[e.id] = 1) : delete store.seen[e.id]; persist('seen'); }
    if (api.web && (v==='dl'||v==='zip')) { const here=location.hash;await WebDownloads.downloadVideo(xs.map(job),v==='zip');if(location.hash===here)redraw();return; }
    if (v === 'dl') {
      const todo = xs.filter(free);
      for (const e of todo) startDownload(job(e)); // in the quality last picked; each show's queue takes them oldest first
      toast(t('dlQueuedN', todo.length)); // one toast for them all, over each one's own
    }
    if (v === 'del') {
      const ds = xs.filter(saved).map(e => store.downloads[e.id]);
      const what = ds.length > 1 ? t('confirmDelN', ds.length) : t('confirmDel', `${title} · ${t('episode')} ${ds[0]?.ep}`);
      if (!ds.length || !await confirmSheet(what, t('confirmDelHint'), t('del'))) return;
      for (const d of ds) await removeDownload(d);
      saveDownloads();
    }
    redraw();
  };
  const selectFrom = selectable(list, ids, acts, run);
  pagePress = ['.ep', a => pickSheet(`${t('episode')} ${pick([a.dataset.pick])[0]?.ep}`, acts([a.dataset.pick], true), '', v => run(v, [a.dataset.pick]))];
}
// a full-screen overlay (a tap, back or Esc closes it): trailers, and posters shown full size
function overlay(html) {
  const m = document.createElement('div');
  m.className = 'trailer';
  m.innerHTML = html;
  m.onclick = () => m.remove();
  document.body.append(m);
}
const showTrailer = url => overlay(`<iframe src="${esc(youtubeId(url) ? 'https://www.youtube.com/embed/' + youtubeId(url) + '?autoplay=1' : url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`);
// a tap on a details page's poster, or a downloaded show's, shows it full size
document.addEventListener('click', e => {
  const p = e.target.closest('.det .poster, .dl-hero > img, .cast-photo[data-full]');
  if (p) overlay(`<img class="viewer${p.dataset.full ? ' cast-viewer' : ''}" src="${esc(p.dataset.full || p.src)}" alt="${esc(p.dataset.name || p.alt || '')}">${p.dataset.full ? `<button class="icon-btn viewer-close" aria-label="${t('back')}">${ICON.x}</button>` : ''}`);
});

// Sites list one host several times in different qualities: keep the first (best) one of each.
const QUALITY = ['4K', 'FHD', 'HD', 'SD'];
const STREAMS_KEEP = 90 * 24 * HOUR; // store.streams: servers' answers, anime episodes' (play) and films' (cinema.js)
const serverRank = s => api.serverRank?.(s.label) ?? 0; // the website: hosts without popup ads first (web.js)
const bestPerHost = list => { const seen = new Set(); return list.filter(s => { const h = (s.label || '').toLowerCase().split(' ')[0]; return !seen.has(h) && seen.add(h); }); };

async function play(epPath) {
  if (store.downloads[epPath]?.state === 'done') return location.replace(offlineHash(epPath)); // downloaded: no need to stream
  const show = showOf(epPath);
  let d = { title: '', poster: '', episodes: [] };
  try { d = await scraper.details(show); } catch {}
  if (d.path && decodeURIComponent(d.path) !== show) { // found under another address (risto.js): the same episode at its own
    const e = d.episodes.find(e => e.ep === epPath.split('/').pop());
    if (e) return location.replace(playHash(e.path));
  }
  const idx = d.episodes.findIndex(e => e.path === epPath);
  const ep = d.episodes[idx]?.ep ?? epPath.split('/').pop();
  store.history[show] = { show, epPath, ep, title: d.title, poster: d.poster, at: Date.now() };
  store.seen[epPath] = 1;
  persist('history'); persist('seen');

  const prev = d.episodes[idx - 1], next = d.episodes[idx + 1];
  castInfo = { links: () => animeDownloadLinks(epPath, d.title, d.alt, ep), poster: d.poster };
  panelNames = epPath.startsWith('/watch/movie/') ? null : [d.title, ...(d.alt || '').split(/\s*[,،]\s*/)];
  view.innerHTML = `<div class="player">
    <header>
      <button class="icon-btn" id="back" title="${t('back')}" aria-label="${t('back')}">${ICON.back}</button>
      <div class="ttl"><a href="#/title${esc(show)}">${esc(d.title)}</a><small>${/^\d/.test(ep) ? t('episode') + ' ' : ''}${esc(ep)}</small></div>
      <div class="sp"></div>
      <div class="dd idle" id="srv">
        <button class="dd-btn"><span class="dd-dot"></span><span class="lbl">${t('loadingServers')}</span>${ICON.caretDown}</button>
        <div class="dd-menu"></div>
      </div>
      ${api.playerFull ? `<button class="icon-btn pfull" title="${t('fullscreen')}" aria-label="${t('fullscreen')}">${ICON.expand}</button>` : ''}
      ${skipBtn}
      <button class="icon-btn" id="prev" title="${t('prevEp')}" aria-label="${t('prevEp')}" ${prev ? '' : 'disabled'}>${ICON.skipBack}</button>
      <button class="icon-btn" id="next" title="${t('nextEp')}" aria-label="${t('nextEp')}" ${next ? '' : 'disabled'}>${ICON.skipForward}</button>
      ${playerMore(d.episodes.map(e => ({ n: e.ep, go: playHash(e.path), seen: store.seen[e.path], on: e.path === epPath })), d.banner || d.poster)}
    </header>
    <div class="stage"><div class="spin"></div></div>
    ${playBar()}
  </div>`;
  // the video host's player is a native view laid over .stage by the main process
  const stage = $('.stage');
  let stream = null;
  const place = () => {
    if (!stream) return;
    const r = stage.getBoundingClientRect();
    api.player(stream.url, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }, stream.referrer, stream.native);
  };
  playerObs = new ResizeObserver(place);
  playerObs.observe(stage);

  $('#back').onclick = () => leavePlayer('#/title' + show);
  $('#ext').onclick = () => api.openExternal(d.episodes[idx]?.url || scraper.SITE + epPath); // the website's sources have their own address: their paths exist on no site
  skipIntro(d.title, d.alt, ep, () => api.playerTime?.(), at => api.playerSeek?.(at));
  if (!epPath.startsWith('/watch/movie/')) markFiller(d.title, d.alt, ep);
  if (prev) $('#prev').onclick = () => location.replace(playHash(prev.path));
  if (next) $('#next').onclick = () => location.replace(playHash(next.path));

  const here = () => decodeURIComponent(location.hash) === playHash(epPath);
  // download menu: every download link by quality. MediaFire downloads in the app, other hosts open in the browser.
  // wired now, not after the servers' answer (it can take a minute): it asks on its own
  const dlm = $('#dlm');
  let links = null; // fetched on first open
  const drawDl = () => {
    const have = store.downloads[epPath];
    const top = have?.state === 'done' ? `<button class="dd-item go" data-act="offline">${ICON.play}<span class="host">${t('playOffline')}</span></button>`
      : have?.state === 'active' ? `<button class="dd-item go" data-act="list">${ICON.download}<span class="host">${t('dlOpenList')}</span></button>` : '';
    const item = l => `<button class="dd-item ${l.quality === store.prefs.dlQuality && l.label === store.prefs.dlHost ? 'on' : ''}" data-i="${links.indexOf(l)}">
      <span class="host">${esc(l.label)}</span><span class="tag ${inAppHost(l.label) ? 'app' : ''}">${inAppHost(l.label) ? t('inApp') : ICON.external + ' ' + t('browser')}</span>
      ${CHECK}</button>`;
    const groups = !links ? `<div class="dd-group">${t('searching')}</div>` : !links.length ? `<div class="dd-group">${t('dlNone')}</div>`
      : QUALITY.map(q => links.filter(l => l.quality === q).sort((a, b) => (inAppHost(b.label)) - (inAppHost(a.label))))
          .filter(g => g.length).map(g => `<div class="dd-group">${g[0].quality}<small>${g.length}</small></div>${g.map(item).join('')}`).join('');
    dlm.querySelector('.dd-menu').innerHTML = top + groups;
  };
  dlm.querySelector('.dd-btn').onclick = async () => {
    if (dlm.classList.contains('open')) return closeMenu(dlm);
    drawDl();
    openMenu(dlm);
    if (links) return;
    try { links = await animeDownloadLinks(epPath, d.title, d.alt, ep); } catch (e) { console.error(e); links = []; }
    if (here()) drawDl();
  };
  dlm.querySelector('.dd-menu').onclick = e => {
    const b = e.target.closest('.dd-item');
    if (!b) return;
    closeMenu();
    if (b.dataset.act === 'offline') return location.hash = offlineHash(epPath);
    if (b.dataset.act === 'list') return location.hash = '#/downloads';
    const l = links[b.dataset.i];
    store.prefs.dlQuality = l.quality; store.prefs.dlHost = l.label; persist('prefs');
    if (api.web) return WebDownloads.downloadVideo([{id:epPath,epPath,show,title:d.title,ep,poster:d.poster,quality:l.quality,host:l.label,token:l.token}]);
    if (inAppHost(l.label)) startDownload({ id: epPath, epPath, show, title: d.title, ep, poster: d.poster }, l.quality);
    else api.openDownloadPage(l.token).then(() => toast(t('openedBrowser')), () => toast(t('dlFailed'), true));
  };
  // animerco's, WeCima's and ristoanime's servers for the same episode are looked up alongside and appended as backups
  const backup = Promise.all([
    ...[scraper.animerco, scraper.wecima, scraper.ristoanime, scraper.okanime, scraper.shahiid].filter(Boolean).map(f => // the last two: website only
      f(d.title, d.alt, ep, epPath.startsWith('/watch/movie/')).catch(e => (console.error(e), []))),
    api.awSources(d.title, d.alt, ep).then(l => l.filter(s => !api.web || !/^pixeldrain/i.test(s.label)).sort((a, b) => QUALITY.indexOf(a.quality) - QUALITY.indexOf(b.quality)).map(s => ({ ...s, url: undefined }))).catch(e => (console.error(e), [])) // pixeldrain refuses a browser's video player (403 hotlink_detected): it's only for downloads there. sorted: each host keeps its first, which should be its best
  ]).then(l => l.flat());
  // witanime servers played before: the host's link they led to stays put (witanime's tokens die with the session), so they
  // play straight away and witanime's fresh list is only merged in behind them. Forgotten after STREAMS_KEEP.
  const known = Object.fromEntries(Object.entries(store.streams[epPath]?.list || {}).filter(([k]) => !k.split('|')[0].endsWith(' · AW') && serverRank({ label: k.split('|')[0] }) < 3)), key = s => s.label + '|' + s.quality;
  const fresh = api.sources(epPath).then(l => bestPerHost(l.sort((a, b) => QUALITY.indexOf(a.quality) - QUALITY.indexOf(b.quality)).sort((a, b) => serverRank(a) - serverRank(b))));
  let servers = Object.entries(known).map(([k, st]) => ({ label: k.split('|')[0], quality: k.split('|')[1], st }));
  let limited = false, why = ''; // witanime is rate-limiting this session: say so instead of "no servers"; why: what refused it
  if (servers.length) fresh.then(l => { // after the remembered ones, before animerco's
    const add = bestPerHost([...servers.filter(s => s.st), ...l]).filter(s => !s.st);
    servers.splice(servers.filter(s => s.st).length, 0, ...add);
    if (!here()) return;
    draw();
    if (dead && add.length) tryFrom(servers.indexOf(add[0])); // the saved links all died before these came
  }, e => console.error(e));
  else try { servers = await fresh; } catch (e) { console.error(e); limited = /rate-limited/.test(e.message); why = noNames(e.message); }
  if (!here()) return; // navigated away meanwhile
  const srv = $('#srv');
  let cur = null, busy = false, dead = !servers.length, more = true; // more: witanime's or the backups' answer still coming
  // animerco puts the quality in the label ("dood FHD"); split it out so both sites look the same
  const parts = s => { const [host, ...q] = (s.label || t('server')).split(' '); return { host, q: s.quality || q.join(' ') }; };
  const item = (s, i) => { const { host, q } = parts(s); return `<button class="dd-item ${s === cur ? 'on' : ''}" data-i="${i}"><span class="host">${esc(host)}</span>${q ? `<span class="q" data-q="${esc(q)}">${esc(q)}</span>` : ''}${CHECK}</button>`; };
  const group = (name, url) => {
    const g = servers.map(item).filter((_, i) => !!servers[i].url === url);
    return g.length ? `<div class="dd-group">${name}<small>${g.length}</small></div>${g.join('')}` : '';
  };
  const draw = () => {
    const { host, q } = cur ? parts(cur) : {};
    srv.className = 'dd ' + (busy ? 'busy' : cur ? 'live' : 'idle') + (srv.classList.contains('open') ? ' open' : '');
    showPlayBar(!busy && !!cur);
    srv.querySelector('.lbl').innerHTML = cur ? `${esc(host)}${q ? `<small>${esc(q)}</small>` : ''}` : servers.length ? t('chooseServer') : t('searchingServers');
    srv.querySelector('.dd-menu').innerHTML = group(t('mainServers'), false) + group(t('backupServers'), true) + (more ? ddSkel() : '') || `<div class="dd-group">${t('noServers')}</div>`;
  };
  draw();
  Promise.allSettled([fresh, backup]).then(() => { more = false; if (here()) draw(); });
  // try the chosen server, falling through to the next ones (animerco's included) until one resolves
  let seq = 0, picked = false; // picked: chosen in the menu, not given up on just for being slow
  const tryFrom = async (i, n = 0, my = ++seq) => {
    dead = n >= servers.length;
    if (dead) { busy = false; draw(); stage.innerHTML = `<div class="empty"><b>${t('noneWorked')}</b>${t('noneWorkedHint')}</div>`; return; }
    cur = servers[(i + n) % servers.length]; busy = true; draw();
    stream = null; api.player(null); // drop the old video so the spinner shows while the new one loads
    stage.innerHTML = '<div class="spin"></div>';
    let st;
    // a server's page, as is or unwrapped; on the website maybe its stream, for our own player ({ url, native })
    try { st = cur.st || (cur.url ? await Promise.resolve(api.unwrap?.(cur.url) ?? cur.url).then(u => u.url ? u : { url: u, referrer: '' }) : await api.stream(cur.token)); } catch (e) { console.error(e); return my === seq && tryFrom(i, n + 1, my); }
    if (cur.token) { Object.assign(store.streams[epPath] ||= { list: {} }, { at: Date.now() }).list[key(cur)] = st; persist('streams'); }
    if (!here() || my !== seq) return;
    stream = st; busy = false; draw();
    place();
    const s = cur;
    watchServer(() => here() && my === seq, picked, () => {
      store.prefs.server = s.label; (store.prefs.showServer ||= {})[show] = s.label; persist('prefs');
    }, () => {
      if (store.streams[epPath]?.list[key(s)]) { delete store.streams[epPath].list[key(s)]; persist('streams'); } // its saved link is what died: the next visit asks for a fresh one
      picked = false; tryFrom(i, n + 1, my);
    });
  };
  srv.querySelector('.dd-btn').onclick = () => srv.classList.contains('open') ? closeMenu(srv) : openMenu(srv);

  srv.querySelector('.dd-menu').onclick = e => { const b = e.target.closest('.dd-item'); if (b) { closeMenu(); picked = true; tryFrom(+b.dataset.i); } };
  if (servers.length) tryFrom([store.prefs.showServer?.[show], store.prefs.server].filter(l => serverRank({ label: l }) < 3).map(l => servers.findIndex(s => s.label === l)).find(i => i >= 0) ?? 0); // this show's, else the last one anywhere
  else stage.innerHTML = '<div class="spin"></div>'; // nothing on witanime: wait for animerco
  const all = await backup, extra = bestPerHost([...servers, ...all]).filter(s => all.includes(s)); // a host already listed isn't offered twice
  if (!here()) return;
  const from = servers.length;
  servers.push(...extra.sort((a, b) => serverRank(a) - serverRank(b)));
  draw();
  if (dead && extra.length) tryFrom(from); // witanime had nothing that worked: switch to animerco
  else if (!servers.length) stage.innerHTML = limited
    ? `<div class="empty"><b>${t('rateLimited')}</b>${t('rateLimitedHint')}<br><br><button class="btn red" id="again">${t('retry')}</button></div>`
    : `<div class="empty"><b>${t('noServers')}</b>${t('noServersHint')}${why ? `<small class="why" dir="ltr">${esc(why)}</small>` : ''}${api.unblock ? `<br><br><button class="btn red" id="verify">${t('verify')}</button>` : ''}</div>`;
  $('#again')?.addEventListener('click', route);
  $('#verify')?.addEventListener('click', () => api.unblock().then(route, () => toast(t('verifyFailed'), true))); // phones: witanime's Cloudflare check
}
let playerObs;
// a server's video, watched until it's known how it went: works() once there's a video (only then is the server remembered),
// dead() when its page says so or, unless picked by hand (patient), after 25s of nothing on screen. Some hosts wait for a click: one stops that clock
const watchServer = (still, patient, works, dead) => {
  if (!api.playerHealth) return works();
  let waited = 0;
  const tick = async () => {
    if (!still()) return;
    const h = await api.playerHealth();
    if (!still()) return;
    if (h === 'works') return works();
    if (h === 'dead') return dead();
    if (h !== 'clicked' && !patient && !document.hidden && ++waited >= 25) return dead();
    setTimeout(tick, 1000);
  };
  tick();
};
// "skip intro" while the opening plays (scraper.intro). In the header: a server's video is a native view over the page, which
// would cover a button on it. now / seek: the video's time
const skipBtn = `<button class="btn red small" id="skip" hidden>${t('skipIntro')}</button>`;
const skipIntro = async (title, alt, ep, now, seek) => {
  api.playerIntro?.(null);
  if (store.prefs.skipIntro === false) return; // turned off in settings: nothing asked of AniSkip either
  const b = $('#skip'), [from, to] = await scraper.intro(title, alt, ep).catch(e => console.error(e)) || [];
  if (to === undefined || !b.isConnected) return; // left for another episode meanwhile: its own button is its own
  if (api.playerIntro) return api.playerIntro([from, to], t('skipIntro')); // the website: in its player. a host's is another site's page: its time can't be read, nor set
  b.onclick = () => { seek(to); b.hidden = true; };
  const tick = setInterval(async () => {
    if (!b.isConnected) return clearInterval(tick);
    const at = await now();
    b.hidden = !(at >= from && at < to);
  }, 1000);
};
// the episode's filler mark, beside its number in the player's header. An extra: nothing if it can't tell
const markFiller = async (title, alt, ep) => {
  if (!title || !/^\d+$/.test(ep)) return;
  const small = $('.player .ttl small'), k = (await scraper.filler([title, ...(alt || '').split(/\s*[,،]\s*/)]).catch(() => ({})))[ep]; // left for another episode meanwhile: this one's header is gone, the mark lands nowhere
  if (k) small.insertAdjacentHTML('beforeend', epKind(k));
};
// the native video view would cover the menus, so while one is open the view is swapped for a still frame of itself
const openMenu = async dd => {
  dd.classList.add('open');
  const frame = await api.playerSnapshot();
  if (!dd.classList.contains('open') || !$('.stage')) return;
  $('.stage').style.backgroundImage = frame ? `url(${frame})` : '';
  api.playerVisible(false);
};
// close one menu (or all); the video comes back once none is open
const closeMenu = only => {
  const open = [...document.querySelectorAll('.dd.open')].filter(m => !only || m === only);
  open.forEach(m => m.classList.remove('open'));
  if (open.length && !$('.dd.open')) { api.playerVisible(true); $('.stage') && ($('.stage').style.backgroundImage = ''); }
  return open.length > 0;
};
// a tap outside a menu closes it; the .dd itself is the phone sheet's dimmed backdrop
document.addEventListener('click', e => document.querySelectorAll('.dd.open').forEach(m => (!m.contains(e.target) || e.target === m) && closeMenu(m)));
document.addEventListener('click', e => e.target.closest('.player .pfull') && api.playerFull()); // phones: see mobile.js
// the player's ⋮: download, cast, the browser and, when there are several, the episodes in a panel from the side. #dlm, #ext and
// .pcast keep their names: each page wires them as ever. the panel is a menu too, so the video view, back and tapping off all just work
let castInfo = null; // this page's { links: this episode's files, poster }, for casting
let panelNames = null; // the show's names, to look its episodes' stills and names up by (series: none, as on their page)
const playerMore = (eps, pic) => `<div class="pmore">
  <div class="dd" id="pmenu"><button class="icon-btn" id="pmenuBtn" title="${t('more')}" aria-label="${t('more')}" aria-haspopup="menu">${ICON.dots}</button>
    <div class="dd-menu">
      ${eps.length > 1 ? `<button class="dd-item" id="pepsBtn">${ICON.index}<span class="host">${t('episodes')}</span></button>` : ''}
      <button class="dd-item" id="pdl" title="${t('download')}">${ICON.download}<span class="host">${t('downloadShort')}</span></button>
      ${api.cast ? `<button class="dd-item pcast">${ICON.cast}<span class="host">${t('cast')}</span></button>` : ''}
      ${api.adBlockToggle ? `<button class="dd-item" id="padb" title="${t('adBlockHint')}" hidden>${ICON.eyeSlash}<span class="host"></span></button>` : ''}
      <button class="dd-item" id="ext" title="${t('openBrowserTip')}">${ICON.external}<span class="host">${t('openBrowser')}</span></button>
    </div></div>
  <div class="dd dlm" id="dlm"><button class="dd-btn"></button><div class="dd-menu"></div></div>
  ${eps.length > 1 ? `<div class="dd pep" id="pep"><div class="dd-menu" role="dialog" aria-label="${t('episodes')}">
    <div class="pep-head"><b>${t('episodes')} <small>${eps.length}</small></b><button class="icon-btn" id="pepX" title="${t('close')}" aria-label="${t('close')}">${ICON.x}</button></div>
    <div class="pep-list" data-pic="${esc(img(pic))}">${eps.map(e => `<button class="pep-ep ${e.on ? 'on' : ''} ${e.seen && !e.on ? 'seen' : ''}" data-go="${esc(e.go)}" data-n="${esc(e.n)}"><img src="${esc(img(pic))}" alt="" loading="lazy"><span><b>${/^\d/.test(e.n) ? t('ep') + ' ' : ''}${esc(e.n)}</b></span></button>`).join('')}</div>
  </div></div>` : ''}
</div>`;
// the panel's stills, names and filler marks, as on the show page: extras, asked for when it first opens, the numbers stand without them
const fillPanel = list => {
  if (!panelNames || list.dataset.filled) return;
  list.dataset.filled = 1;
  const rows = fn => list.isConnected && list.querySelectorAll('[data-n]').forEach(r => fn(r, +r.dataset.n));
  scraper.episodeInfo(panelNames).then(info => rows((r, n) => {
    const i = info[n], im = r.querySelector('img');
    if (i?.thumb) { im.onerror = () => { im.onerror = null; im.src = list.dataset.pic; }; im.src = img(i.thumb); } // kitsu has dead ones
    if (i?.name) r.querySelector('span').insertAdjacentHTML('beforeend', `<small dir="auto">${esc(i.name)}</small>`);
  })).catch(() => {});
  scraper.filler(panelNames).then(kinds => rows((r, n) => kinds[n] && r.querySelector('b').insertAdjacentHTML('beforeend', epKind(kinds[n])))).catch(() => {});
};
// after the tap-outside listener above: what opens here isn't closed again by the same tap
document.addEventListener('click', e => {
  const el = e.target;
  if (el.closest('#pmenuBtn')) {
    api.castReady?.();
    const ab = $('#padb'), on = api.adBlocked?.(); // the website only: for the host playing now
    if (ab) { ab.hidden = on == null; ab.querySelector('.host').textContent = t(on ? 'adBlockOn' : 'adBlockOff'); }
    return $('#pmenu').classList.contains('open') ? closeMenu($('#pmenu')) : openMenu($('#pmenu')); }
  const item = el.closest('#pmenu .dd-item');
  if (item) {
    $('#pmenuBtn').focus({ preventScroll: true }); // the item is about to hide: a remote's ring comes back here
    if (item.id === 'pdl') $('#dlm .dd-btn').click();
    if (item.id === 'padb') { api.adBlockToggle(); toast(t(api.adBlocked() ? 'adBlockStarted' : 'adBlockStopped')); }
    if (item.id === 'pepsBtn') {
      openMenu($('#pep'));
      const list = $('.pep-list'), on = list.querySelector('.on');
      fillPanel(list);
      if (on) list.scrollTop = on.offsetTop - list.clientHeight / 2; // a long show opens at this episode
    }
    closeMenu($('#pmenu')); // last: with another menu open, the video view stays out of the way
    return;
  }
  if (el.closest('#pepX')) return closeMenu($('#pep'));
  const ep = el.closest('.pep-list [data-go]');
  if (ep) { closeMenu(); if (!ep.classList.contains('on')) location.replace(ep.dataset.go); } // like the next-episode button: back still leaves the player
});
// the play / pause bar under every player's video, in the thumb's reach (MEGA's player has none of its own on phones): a
// downloaded episode's video is in the page; a server's is in its frame, reached through api.playerToggle (phones)
const playBar = (shown = false) => api.playerToggle || shown ? `<div class="pbar" ${shown ? '' : 'hidden'}><button class="icon-btn" id="pp" title="${t('play')}" aria-label="${t('play')}">${ICON.play}</button></div>` : '';
const setPlayIcon = paused => { // what a tap does
  const b = $('#pp');
  if (!b) return;
  b.innerHTML = paused ? ICON.play : ICON.pause;
  b.title = b.ariaLabel = t(paused ? 'play' : 'showPause');
};
const showPlayBar = on => { // shown once a server's video is in; a new one starts paused until it says it plays
  if (!$('.pbar')) return;
  $('.pbar').hidden = !on;
  if (!on) setPlayIcon(true);
};
document.addEventListener('click', e => {
  if (!e.target.closest('.player #pp')) return;
  const v = $('.player video');
  v ? (v.paused ? v.play() : v.pause()) : api.playerToggle();
});
['playing', 'pause', 'ended'].forEach(n => document.addEventListener(n, e => e.target.closest?.('.player') && setPlayIcon(e.target.paused), true));
addEventListener('message', e => typeof e.data?.medPaused === 'boolean' && setPlayIcon(e.data.medPaused)); // the frame's (MainActivity's frame script)
// cast to a TV: the downloaded file (from where it is now), or the video the server's player is playing; once it plays
// there, it stops here. Without Google Play services the screen is mirrored instead (screen: the player stays)
document.addEventListener('click', e => {
  if (!e.target.closest('.player .pcast')) return;
  const v = $('.player video'), title = [...$('.player .ttl')?.children || []].map(x => x.innerText.trim()).filter(Boolean).join(' · '); // the page spaces them with margins, which innerText drops
  api.cast({ title, file: v?.dataset.file, at: v?.currentTime || 0, ...castInfo }).then(r => {
    if (r?.screen) return;
    v?.pause();
    api.player(null);
    if (api.web && $('.stage')) $('.stage').innerHTML = `<div class="empty"><b>${t('casting')}</b></div>`; // nothing plays here now: not a spinner forever
    toast(t('casting'));
  }, e => /cancelled/.test(e.message) || toast(t(/no video/.test(e.message) ? 'castPlayFirst' : /no wifi/.test(e.message) ? 'castWifi' : /no file/.test(e.message) ? 'castNoFile' : /no tv/.test(e.message) ? 'castNoTv' : /not castable/.test(e.message) ? 'castBrowser' : 'castFailed'), true));
});
const closeTrailer = () => { const m = $('.trailer'); m?.remove(); return !!m; };
const back = () => closeContextMenu() || closeSettings() || closeDrawer() || closeSheet() || closeSelect() || closeSearch() || closeMenu() || closeTrailer() || ($('.player') && $('#back').click());
// Android back button (MainActivity.java): true = handled here, otherwise it goes back a page
window.androidBack = () => closeDrawer() || closeSheet() || closeSelect() || closeSearch() || closeMenu() || closeTrailer() || lockedBack();
addEventListener('keydown', e => e.key === 'Escape' && back());
api.onPlayerBack(back);

// ---------- pull to refresh (touch screens) ----------
// Each view sets pageRefresh to reload itself from the site; dragging down at the top of the page runs it.
let pageRefresh = null;
// As on Android: the pull starts once the page is at the top (also mid-swipe, after scrolling up to it), the spinner slides
// out from under the top bar at half the finger's speed (slowing to a stop), its arc filling up; let go past READY and it
// rests at READY, spinning, while the page reloads, then shrinks away. Short of READY it slides back.
(() => {
  const ind = document.createElement('div');
  ind.id = 'ptr';
  ind.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
  document.body.append(ind);
  const arc = ind.querySelector('circle'), C = 2 * Math.PI * 8, READY = 64, MAX = 130, SLOP = 10;
  let x0, y0, start = null, on = false, pulling = false, y = 0, busy = false;
  const draw = () => {
    const p = Math.min(1, y / READY);
    ind.style.transform = `translateY(${y}px) rotate(${y * 3}deg)`;
    ind.style.opacity = Math.min(1, p * 1.5);
    arc.style.strokeDasharray = `${p * C * .8} ${C}`;
    ind.classList.toggle('ready', p >= 1);
  };
  const reset = () => { ind.classList.add('drag'); ind.removeAttribute('style'); arc.removeAttribute('style'); ind.classList.remove('busy', 'ready'); };
  const inBox = e => e.target.closest?.('.ch-scroll')?.scrollTop > 0; // a chapter box scrolled down: dragging down scrolls it back, not a pull
  addEventListener('touchstart', e => {
    // only on the page itself: not while the drawer, a sheet (filters...), a menu, the search or an overlay is open
    on = !busy && !!pageRefresh && e.touches.length === 1 && !$('.player, .sheet-wrap, .dd.open, .trailer, body.searching, body.drawer-open');
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    start = on && scrollY <= 0 && !inBox(e) ? y0 : null; pulling = false; y = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!on || e.touches.length > 1) return;
    const { clientX: x, clientY: cy } = e.touches[0];
    if (start == null) { if (scrollY > 0 || inBox(e)) return; start = cy; x0 = x; } // scrolled up to the top: the pull starts here
    if (!pulling) {
      const dx = Math.abs(x - x0), dy = cy - start;
      if (Math.max(dx, Math.abs(dy)) < SLOP) return;
      if (dx > Math.abs(dy)) return void (on = false); // sideways (a row of cards): not a pull
      if (dy < 0) return void (start = null); // scrolling the page down
      pulling = true; start = cy; ind.classList.add('drag');
    }
    const d = cy - start;
    y = d > 0 ? MAX * Math.tanh(d * .5 / MAX) : 0;
    if (y > 0 && e.cancelable) e.preventDefault(); // the page stays put while the spinner moves (not cancelable mid-scroll: nothing left to scroll then)
    draw();
  }, { passive: false });
  const end = async e => {
    if (!pulling) return;
    pulling = on = false;
    ind.classList.remove('drag'); // from here it animates (see #ptr's transition)
    if (y < READY || e.type === 'touchcancel') { y = 0; ind.style.transform = 'translateY(0)'; ind.style.opacity = 0; return setTimeout(() => pulling || busy || reset(), 250); }
    busy = true;
    ind.style.transform = `translateY(${READY}px)`;
    arc.style.strokeDasharray = `${C * .7} ${C}`;
    ind.classList.add('busy');
    try { await pageRefresh(); toast(t('updated')); } catch (err) { console.error(err); }
    ind.style.transform = `translateY(${READY}px) scale(0)`;
    setTimeout(() => { busy = false; reset(); }, 250);
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
})();

// ---------- router ----------
let routeVersion = 0;
let titleLive = null;
// the player's back button. A host in the player's iframe can add history entries of its own (a redirect, a click on its player), and
// history.back() would only step that iframe, leaving the page where it is: those are counted and stepped over. history.length stops
// growing at 50, so a step that didn't leave goes to the page by its address
let playerFrom = '', playerAt = 0, inPlayer = false;
function leavePlayer(fallback) {
  const here = location.hash;
  if (!playerFrom) return location.replace(fallback); // opened directly or reloaded: going back would leave the site
  history.go(playerAt - history.length - 1);
  setTimeout(() => { if (location.hash === here) location.replace(playerFrom); }, 800);
}
async function route(soft) {
  // background redraws wait while a video plays or a search/sheet/menu is open, rather than reset them
  // (and while a pull-to-refresh runs: a redraw would drop its loads, and its spinner would never stop)
  if (soft && (/^#\/novels\/read\//.test(location.hash) || /^#\/(play|offline|manga\/read)\/|^#\/cinema\/([^/]+\/watch|episode\/)/.test(location.hash) || $('.sheet-wrap, .context-menu, .dd.open, body.searching, #ptr.busy'))) return;
  closeContextMenu();
  const version = ++routeVersion;
  if (soft && titleLive?.hash === location.hash && titleLive.root.isConnected) {
    try { if (await titleLive.refresh() || version !== routeVersion) return; }
    catch (e) { console.error(e); return; } // a failed background update keeps the usable page
  }
  titleLive = null;
  let spinnerT;
  CastInfo.dispose();
  scraper.newView();
  clearInterval(heroTimer);
  if (!soft) document.body.classList.remove('det-open');
  cardData.clear();
  pageRefresh = pagePress = null;
  if (!soft) picks = null;
  closeSearch();
  playerObs?.disconnect();
  api.player(null);
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [, head, ...rest] = h.split('/');
  const a = head.split('?')[0];
  markActive();
  if (!soft) closeDrawer(); // a background redraw (fresher site data, often just after launch) happens behind it
  api.scrollbar?.(!(a === 'manga' && rest[0] === 'read')); // phones: the reader has its own scrollbar
  api.statusBar?.(true); // phones: the reader hides it with its bars (manga.js), every page starts with it
  const watching = a === 'play' || a === 'offline' || (a === 'cinema' && (rest[1] === 'watch' || rest[0] === 'episode'));
  if (watching) { if (!inPlayer) playerAt = history.length; } else playerFrom = location.hash; // the next episode replaces this entry: the count stays
  inPlayer = watching;
  api.keepAwake?.(watching); // phones: the video is in an iframe, which doesn't stop the screen locking mid-episode
  immersed = watching || (['manga', 'novels'].includes(a) && rest[0] === 'read');
  $('#nav').style.display = immersed ? 'none' : '';
  if (!soft) {
    heroState = null;
    const waitingView = view.firstElementChild; // the player can render before its servers finish: don't erase it while awaiting them
    scrollTo(0, 0); spinnerT = setTimeout(() => { if (version === routeVersion && view.firstElementChild === waitingView) spinner(); }, 120);
  }
  view.classList.toggle('still', !!soft); // a redraw with fresher data: no entrance animations, no poster fade-in
  try {
    if (!a) await home();
    else if (a === 'anime') await animeHome();
    else if (a === 'browse' || a === 'movies') await list(a);
    else if (a === 'section') await section(rest[0]);
    else if (a === 'search') await search(rest.join('/'));
    else if (a === 'filter') await filterView();
    else if (a === 'list') myList();
    else if (a === 'hidden') hiddenView();
    else if (a === 'downloads') api.web ? location.replace('#/') : drawDownloads();
    else if (a === 'offline') offline((rest[0] === 'cinema' ? '/' : '/watch/') + rest.join('/'));
    else if (a === 'schedule') await schedule();
    else if (a === 'airing') await airing(rest[0]);
    else if (a === 'novels') await novelsRoute(rest);
    else if (a === 'manga') await mangaRoute(rest);
    else if (a === 'cinema') await cinemaRoute(rest);
    else if (a === 'settings') settingsView();
    else if (a === 'characters') await CastInfo.page(JSON.parse(rest.join('/')));
    else if (a === 'title') await title('/' + rest.join('/'));
    else if (a === 'play') await play('/watch/' + rest.join('/'));
  } catch (e) { if (version === routeVersion) { console.error(e); failed(e); } }
  clearTimeout(spinnerT);
  if (version !== routeVersion) return;
  if (soft) view.querySelectorAll('img').forEach(i => i.complete && i.naturalWidth && i.classList.add('ok')); // already cached
  syncBar();
  if (!soft) { view.style.animation = 'none'; view.offsetHeight; view.style.animation = ''; }
}
let redrawTimer;
scraper.watch(() => { clearTimeout(redrawTimer); const hash=location.hash; redrawTimer=setTimeout(() => { if (location.hash===hash) route(true); }, 80); }); // the site had something newer than the saved copy
// a page left open is asked again every 5 minutes, quietly: the sites post new episodes, films and chapters several times an
// hour, and sooner mostly finds nothing new. not while the app is hidden; back on screen after that, at once
const QUIET_EVERY = 5 * 60e3;
let quietAt = Date.now();
const quietCheck = () => { if (document.visibilityState === 'visible' && Date.now() - quietAt >= QUIET_EVERY) { quietAt = Date.now(); scraper.recheck(); } };
setInterval(quietCheck, 60e3);
document.addEventListener('visibilitychange', quietCheck);
addEventListener('hashchange', () => route()); // not `route` directly: the event would arrive as the `soft` flag and skip the redraw

(async () => {
  await Promise.all(Object.keys(store).map(async k => { store[k] = (await api.get(k)) || {}; }));
  for (const [p, s] of Object.entries(store.streams)) if (!(Date.now() - s.at < STREAMS_KEEP)) delete store.streams[p];
  if (api.web) WebDownloads.cleanupLegacyDownloads().catch(()=>{});
  lang = store.prefs.lang || 'en';
  const ran = (await api.downloadStatus?.().catch(() => null)) || {}; // phones: downloads kept going after the app was swiped away
  for (const d of Object.values(store.downloads)) { // what the service did meanwhile, including items it started on its own (see dlSent)
    const r = ran[d.id];
    if (r && (d.state === 'active' || d.state === 'queued' && r.t > d.at)) Object.assign(d, r);
    else if (d.state === 'active') d.state = 'error'; // cut off when the app last closed
  }
  if (Object.keys(ran).length) saveDownloads();
  applyLang();
  route(); // saved copies show instantly; scraper re-checks the site and redraws on changes
  pumpDownloads(); // what was still queued from last time
  const s = await checkStorage();
  if (s && !s.granted && !store.prefs.storageAsked) return storageSheet(); // one sheet at a time: the update asks next launch
  const u = await api.checkUpdate?.().catch(() => null);
  if (u) updateSheet(u);
})();
