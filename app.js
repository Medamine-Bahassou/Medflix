const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
// images go through the platform's cache (Electron: medimg://; Android caches them natively, see ImageCache.java)
const img = url => url && api.imgSrc ? api.imgSrc(url) : url || '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// ---------- language (Arabic by default, RTL) ----------
const STR = {
  ar: {
    home: 'الرئيسية', anime: 'أنمي', remove: 'إزالة', series: 'المسلسلات', movies: 'أفلام الأنمي', cinema: 'أفلام ومسلسلات', dubbed: 'مدبلج', schedule: 'مواعيد الأنمي', myList: 'قائمتي', searchPh: 'ابحث عن أنمي أو فيلم…', cancel: 'إلغاء', clear: 'مسح',
    settings: 'الإعدادات', more: 'المزيد', storage: 'مجلد التطبيق', storageHint: 'احفظ التنزيلات والإعدادات وقائمتك وسجل المشاهدة في مجلد MEDFLIX على الهاتف، لتبقى حتى بعد حذف التطبيق وإعادة تثبيته.', storageAllow: 'السماح بالوصول', storageOn: 'مفعّل', storageOff: 'يحتاج إذن الوصول إلى كل الملفات', storageReady: 'تم حفظ بياناتك في مجلد MEDFLIX', storageAsk: 'اسمح للتطبيق بالوصول إلى الملفات ليحفظ قائمتك وسجل المشاهدة والإعدادات والتنزيلات في مجلد MEDFLIX على الهاتف. هكذا تبقى بعد حذف التطبيق، وتعود تلقائيًا عند إعادة تثبيته والسماح مرة أخرى.', later: 'لاحقًا', close: 'إغلاق', reverse: 'عكس الترتيب', dockTitle: 'أزرار الشريط السفلي', dockHint: 'اختر حتى 4 أزرار تظهر في الشريط السفلي على الهاتف، والباقي تجده في القائمة الجانبية ☰.',
    inDock: 'في الشريط', available: 'أزرار أخرى', dockFull: 'الشريط ممتلئ: أزل زرًا أولًا', dockMin: 'يجب أن يبقى زر واحد على الأقل', language: 'اللغة',
    moveUp: 'تحريك للأعلى', moveDown: 'تحريك للأسفل', removeDock: 'إزالة من الشريط', addDock: 'إضافة إلى الشريط',
    manga: 'مانجا', browseAll: 'تصفح الكل', continueReading: 'تابع القراءة', mHot: 'الأعمال الرائجة', mLatest: 'آخر الفصول', mPopular: 'الأكثر قراءة', mNew: 'أعمال جديدة',
    mSearchPh: 'ابحث عن مانجا أو مانهوا…', mSortNew: 'الأحدث', mSortViews: 'الأكثر قراءة', mSortRating: 'الأعلى تقييمًا', mSortTitle: 'أبجديًا',
    chapter: 'الفصل', chShort: 'ف', chapters: 'الفصول', read: 'ابدأ القراءة', resumeCh: n => `تابع الفصل ${n}`, prevCh: 'الفصل السابق', nextCh: 'الفصل التالي',
    jumpCh: 'انتقل إلى فصل…', readMode: 'قراءة أفقية / عمودية', autoScroll: 'تمرير تلقائي', slower: 'أبطأ', faster: 'أسرع', views: n => `${n} مشاهدة`, noImages: 'لا توجد صفحات في هذا الفصل', endOfChapter: 'نهاية الفصل', chRead: 'مقروء', fullscreen: 'ملء الشاشة', notOnSite: 'هذا الأنمي غير متوفر بعد.', mainServers: 'السيرفرات', backupServers: 'سيرفرات احتياطية', theSite: 'الموقع', backAgain: 'اضغط رجوع مرة أخرى للخروج', lockUi: 'قفل الأزرار', unlockUi: 'إلغاء القفل', scheduleShort: 'المواعيد',
    filter: 'تصفية', apply: 'تطبيق', reset: 'إعادة ضبط', all: 'الكل',
    f_sort: 'الترتيب', f_type: 'النوع', f_status: 'الحالة', f_year: 'السنة', f_season: 'الموسم', seasons: 'المواسم', f_version: 'الترجمة',
    f_country: 'البلد', f_source: 'المصدر', f_genres: 'التصنيفات',
    added: n => `تمت إضافة «\u2068${n}\u2069» إلى قائمتي`, hiddenN: n => `أُخفي «\u2068${n}\u2069»`, hiddenTitle: 'العناصر المخفية', hiddenHint: 'اضغط مطولاً على أي بطاقة لإخفائها من كل الصفحات. اضغط ✕ على العنصر هنا لإظهاره مجددًا.', unhide: 'إظهار مجددًا', noHidden: 'لا توجد عناصر مخفية', shown: 'سيظهر مجددًا',
    hideAnime: 'إخفاء هذا الأنمي', hideManga: 'إخفاء هذه المانجا', hideMovie: 'إخفاء هذا الفيلم', hideSeries: 'إخفاء هذا المسلسل', listAdd: 'إضافة إلى قائمتي', listRemove: 'إزالة من قائمتي', openHidden: n => `العناصر المخفية (${n})`, removed: 'تمت الإزالة من قائمتي', ep: 'الحلقة', epShort: 'ح', episode: 'الحلقة',
    nothing: 'لا يوجد شيء هنا', tryElse: 'جرّب شيئًا آخر.', unreachable: 'تعذّر الوصول إلى الموقع', retry: 'إعادة المحاولة',
    continueWatching: 'تابع المشاهدة', refreshSite: 'تحديث من الموقع', refresh: 'تحديث', updated: 'تم التحديث', updateTitle: 'تحديث متوفر', updateText: 'يوجد إصدار أحدث من التطبيق. حدّثه الآن، ستبقى بياناتك كما هي.', updateGo: 'تحديث الآن', updateGetting: 'جارٍ التنزيل', updateAllow: 'اسمح للتطبيق بتثبيت التحديثات، ثم اضغط تحديث الآن مرة أخرى', updateFailed: 'تعذّر التحديث، يتم التنزيل من المتصفح',
    play: 'تشغيل', moreInfo: 'المزيد', prev: 'السابق', next: 'التالي',
    results: q => `نتائج البحث عن «${q}»`, listEmpty: 'قائمتك فارغة', listHint: 'مرّر على أي عنوان واضغط + لحفظه هنا.',
    resume: e => `متابعة الحلقة ${e}`, inList: 'في قائمتي', trailer: 'الإعلان', episodes: 'الحلقات', jump: 'انتقل إلى حلقة…', moreLike: 'أعمال مشابهة',
    back: 'رجوع (Esc)', loadingServers: 'جارٍ تحميل السيرفرات…', openBrowser: 'فتح في المتصفح', openBrowserTip: 'إذا لم يعمل المشغّل داخل التطبيق', cast: 'عرض على التلفاز', casting: 'يُعرض الآن على التلفاز', castPlayFirst: 'شغّل الفيديو هنا أولاً، ثم اعرضه على التلفاز', castWifi: 'اتصل بشبكة الواي فاي نفسها التي يتصل بها التلفاز', castFailed: 'تعذّر التشغيل على التلفاز، جرّب سيرفراً آخر',
    prevEp: 'الحلقة السابقة', nextEp: 'الحلقة التالية', chooseServer: 'اختر سيرفرًا', searchingServers: 'جارٍ البحث عن سيرفرات…', searching: 'جارٍ البحث…',
    server: 'سيرفر', noneWorked: 'لم يعمل أي سيرفر', noneWorkedHint: 'جرّب سيرفرًا آخر من القائمة أو افتح الحلقة في المتصفح.',
    rateLimited: 'الموقع يطلب الانتظار قليلًا', rateLimitedHint: 'طلبات كثيرة في وقت قصير. انتظر دقيقة أو دقيقتين ثم أعد المحاولة.', noServers: 'لا توجد سيرفرات لهذه الحلقة', noServersHint: 'لم يتم العثور عليها في أي مصدر.', noServersEdHint: 'لم يتم العثور عليها في المصدر.', verify: 'التحقق من الوصول', verifyFailed: 'لم يكتمل التحقق', today: 'اليوم',
    downloads: 'التنزيلات', download: 'تحميل الحلقة', dlPreparing: 'جارٍ تجهيز التحميل…', dlStarted: 'بدأ التحميل', dlFinished: n => `اكتمل تحميل «\u2068${n}\u2069»`,
    dlFailed: 'فشل التحميل', dlNoHost: 'لا يوجد رابط تحميل مدعوم لهذه الحلقة (MediaFire)', dlActive: 'الحلقة قيد التحميل بالفعل', dlDone: 'الحلقة محمّلة بالفعل',
    dlCancelled: 'أُلغي التحميل', dlNotifActive: 'جارٍ تحميل الحلقات', dlNotifMany: '%d حلقات', dlNotifDone: 'اكتمل التحميل', downloadShort: 'تحميل', playOffline: 'تشغيل النسخة المحمّلة', inApp: 'داخل التطبيق', browser: 'المتصفح', dlNone: 'لا توجد روابط تحميل', openedBrowser: 'تم الفتح في المتصفح', dlOpenList: 'قيد التحميل · عرض التنزيلات', del: 'حذف', offline: 'بدون إنترنت', noDownloads: 'لا توجد تنزيلات', noDownloadsHint: 'افتح أي حلقة أو فصل واضغط زر التحميل.',
    dlQueued: 'في الانتظار', dlPaused: 'متوقف مؤقتًا', pauseAll: 'إيقاف الكل مؤقتًا', resumeAll: 'استئناف الكل', dlPausedAll: 'التحميلات متوقفة مؤقتًا', confirmDel: n => `حذف «\u2068${n}\u2069»؟`, confirmDelAll: n => `حذف كل تنزيلات هذا العمل (${n})؟`, confirmDelHint: 'سيُحذف الملف المحمّل من الجهاز، ولا يمكن التراجع.', showPause: 'إيقاف مؤقت', showResume: 'استئناف', dlQueuedN: n => `أُضيف ${n} للتحميل`, pagesOf: (r, n) => `${r} / ${n} صفحة`, pagesN: n => `${n} صفحة`,
    epCount: n => `${n} حلقة`, chCount: n => `${n} فصل`, dlActiveN: n => `${n} قيد التحميل`, deleteAll: 'حذف الكل', kindAnime: 'أنمي',
    markRead: 'تحديد كمقروء', markUnread: 'تحديد كغير مقروء', markPrevRead: 'تحديد الفصول السابقة كمقروءة', markWatched: 'تحديد كمُشاهَد', markUnwatched: 'تحديد كغير مُشاهَد', delDownload: 'حذف التنزيل',
    select: 'تحديد', actions: 'إجراءات', delDownloads: 'حذف التنزيلات', confirmDelN: n => `حذف ${n} من التنزيلات؟`,
    selectedN: n => `${n} محدد`, selectAll: 'تحديد الكل',
    schedSearch: 'ابحث عن أنمي في المواعيد…', schedNone: 'غير موجود في مواعيد هذا الأسبوع', schedNoneHint: 'جرّب اسمه بالإنجليزية أو اليابانية.',
  },
  en: {
    home: 'Home', anime: 'Anime', remove: 'Remove', series: 'Series', movies: 'Anime Movies', cinema: 'Movies & TV', dubbed: 'Dubbed', schedule: 'Anime Schedule', myList: 'My List', searchPh: 'Titles, series, movies…', cancel: 'Cancel', clear: 'Clear',
    settings: 'Settings', more: 'More', storage: 'App folder', storageHint: 'Keep downloads, settings, your list and watch history in a MEDFLIX folder on the phone, so they survive uninstalling and reinstalling the app.', storageAllow: 'Allow access', storageOn: 'Active', storageOff: 'Needs all-files access', storageReady: 'Your data is now saved in the MEDFLIX folder', storageAsk: 'Allow file access so your list, watch history, settings and downloads are kept in a MEDFLIX folder on the phone. They then survive uninstalling the app, and come back when you reinstall and allow access again.', later: 'Later', close: 'Close', reverse: 'Reverse order', dockTitle: 'Bottom bar buttons', dockHint: "Pick up to 4 buttons for the phone's bottom bar; everything else is in the side menu ☰.",
    inDock: 'In the bar', available: 'Other buttons', dockFull: 'The bar is full: remove one first', dockMin: 'Keep at least one button', language: 'Language',
    moveUp: 'Move up', moveDown: 'Move down', removeDock: 'Remove from bar', addDock: 'Add to bar',
    manga: 'Manga', browseAll: 'Browse all', continueReading: 'Continue Reading', mHot: 'Trending', mLatest: 'Latest Chapters', mPopular: 'Most Read', mNew: 'New Series',
    mSearchPh: 'Search manga, manhwa…', mSortNew: 'Newest', mSortViews: 'Most read', mSortRating: 'Top rated', mSortTitle: 'A-Z',
    chapter: 'Chapter', chShort: 'Ch', chapters: 'Chapters', read: 'Start reading', resumeCh: n => `Resume Ch ${n}`, prevCh: 'Previous chapter', nextCh: 'Next chapter',
    jumpCh: 'Jump to chapter…', readMode: 'Horizontal / vertical reading', autoScroll: 'Auto-scroll', slower: 'Slower', faster: 'Faster', views: n => `${n} views`, noImages: 'This chapter has no pages', endOfChapter: 'End of chapter', chRead: 'Read', fullscreen: 'Fullscreen', notOnSite: "This anime isn't available yet.", mainServers: 'Servers', backupServers: 'Backup servers', theSite: 'the site', backAgain: 'Press back again to leave', lockUi: 'Lock controls', unlockUi: 'Unlock', scheduleShort: 'Schedule',
    filter: 'Filters', apply: 'Apply', reset: 'Reset', all: 'All',
    f_sort: 'Sort', f_type: 'Type', f_status: 'Status', f_year: 'Year', f_season: 'Season', seasons: 'Seasons', f_version: 'Language',
    f_country: 'Country', f_source: 'Source', f_genres: 'Genres',
    added: n => `Added “\u2068${n}\u2069” to My List`, hiddenN: n => `Hid “\u2068${n}\u2069”`, hiddenTitle: 'Hidden items', hiddenHint: 'Long-press any card to hide it from every page. Press ✕ on an item here to show it again.', unhide: 'Show again', noHidden: 'Nothing hidden', shown: 'It will show again',
    hideAnime: 'Hide this anime', hideManga: 'Hide this manga', hideMovie: 'Hide this movie', hideSeries: 'Hide this series', listAdd: 'Add to My List', listRemove: 'Remove from My List', openHidden: n => `Hidden items (${n})`, removed: 'Removed from My List', ep: 'EP', epShort: 'Ep', episode: 'Episode',
    nothing: 'Nothing here', tryElse: 'Try something else.', unreachable: "Couldn't reach the site", retry: 'Retry',
    continueWatching: 'Continue Watching', refreshSite: 'Refresh from site', refresh: 'Refresh', updated: 'Updated', updateTitle: 'Update available', updateText: 'A newer version of the app is out. Update now; your data stays.', updateGo: 'Update now', updateGetting: 'Downloading', updateAllow: 'Allow the app to install updates, then tap Update now again', updateFailed: 'Update failed, downloading in the browser instead',
    play: 'Play', moreInfo: 'More Info', prev: 'Prev', next: 'Next',
    results: q => `Results for “${q}”`, listEmpty: 'Your list is empty', listHint: 'Hover any title and press + to save it here.',
    resume: e => `Resume Ep ${e}`, inList: 'In My List', trailer: 'Trailer', episodes: 'Episodes', jump: 'Jump to ep…', moreLike: 'More Like This',
    back: 'Back (Esc)', loadingServers: 'Loading servers…', openBrowser: 'Open in browser', openBrowserTip: "If the in-app player won't load", cast: 'Cast to TV', casting: 'Playing on the TV', castPlayFirst: 'Start the video here first, then cast it', castWifi: 'Connect to the same Wi-Fi as the TV', castFailed: "Couldn't play it on the TV, try another server",
    prevEp: 'Previous', nextEp: 'Next', chooseServer: 'Choose server', searchingServers: 'Searching servers…', searching: 'Searching…',
    server: 'Server', noneWorked: 'No server worked', noneWorkedHint: 'Try another one above, or open in browser.',
    rateLimited: 'The site asks to slow down', rateLimitedHint: 'Too many requests in a short time. Wait a minute or two, then retry.', noServers: 'No servers for this episode', noServersHint: 'Not found on any source.', noServersEdHint: 'Not found on the source.', verify: 'Verify access', verifyFailed: 'Check not passed', today: 'Today',
    downloads: 'Downloads', download: 'Download episode', dlPreparing: 'Preparing download…', dlStarted: 'Download started', dlFinished: n => `Downloaded “\u2068${n}\u2069”`,
    dlFailed: 'Download failed', dlNoHost: 'No supported download link for this episode (MediaFire)', dlActive: 'Already downloading', dlDone: 'Already downloaded',
    dlCancelled: 'Download cancelled', dlNotifActive: 'Downloading', dlNotifMany: '%d episodes', dlNotifDone: 'Download complete', downloadShort: 'Download', playOffline: 'Play downloaded copy', inApp: 'In app', browser: 'Browser', dlNone: 'No download links', openedBrowser: 'Opened in browser', dlOpenList: 'Downloading · open Downloads', del: 'Delete', offline: 'Offline', noDownloads: 'No downloads yet', noDownloadsHint: 'Open any episode or chapter and press the download button.',
    dlQueued: 'Queued', dlPaused: 'Paused', pauseAll: 'Pause all', resumeAll: 'Resume all', dlPausedAll: 'Downloads are paused', confirmDel: n => `Delete “\u2068${n}\u2069”?`, confirmDelAll: n => `Delete all ${n} downloads of this show?`, confirmDelHint: 'The downloaded files are removed from this device. This can’t be undone.', showPause: 'Pause', showResume: 'Resume', dlQueuedN: n => `${n} added to downloads`, pagesOf: (r, n) => `${r} / ${n} pages`, pagesN: n => `${n} pages`,
    epCount: n => `${n} episodes`, chCount: n => `${n} chapters`, dlActiveN: n => `${n} downloading`, deleteAll: 'Delete all', kindAnime: 'Anime',
    markRead: 'Mark as read', markUnread: 'Mark as unread', markPrevRead: 'Mark earlier chapters as read', markWatched: 'Mark as watched', markUnwatched: 'Mark as unwatched', delDownload: 'Delete download',
    select: 'Select', actions: 'Actions', delDownloads: 'Delete downloads', confirmDelN: n => `Delete ${n} downloads?`,
    selectedN: n => `${n} selected`, selectAll: 'Select all',
    schedSearch: 'Find a show in the schedule…', schedNone: 'Not on this week’s schedule', schedNoneHint: 'Try its English or Japanese name.',
    // the site's own section titles
    'الأكثر مشاهدة': 'Most Watched', 'أحدث الحلقات': 'Latest Episodes', 'أحدث الأفلام': 'Latest Movies', 'تابع المشاهدة': 'Continue Watching',
    'أكثر الأنميات مشاهدة': 'Most Watched Anime', 'أكثر الأفلام مشاهدة': 'Most Watched Movies', 'أشهر أنميات الموسم': 'Popular This Season',
  },
};
let lang = 'ar';
// t('key') or t('key', args…); unknown keys (e.g. untranslated site text) come back as-is
const t = (k, ...a) => { const v = STR[lang][k] ?? k; return typeof v === 'function' ? v(...a) : v; };
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => el.textContent = t(el.dataset.t));
  document.querySelectorAll('[data-tp]').forEach(el => el.placeholder = t(el.dataset.tp));
  document.querySelectorAll('[data-ta]').forEach(el => el.ariaLabel = t(el.dataset.ta));
  renderNav();
  document.querySelectorAll('.lang [data-l]').forEach(b => b.classList.toggle('on', b.dataset.l === lang));
}
document.addEventListener('click', e => { // language buttons: nav pill, drawer and settings
  const l = e.target.closest('.lang [data-l]')?.dataset.l;
  if (!l || l === lang) return;
  lang = store.prefs.lang = l; persist('prefs');
  applyLang(); route();
});

// ---------- navigation ----------
// Desktop: every section in the top bar. Phones: a dock with up to 4 of them (chosen in settings), and ☰ in the top bar
// opens a drawer with everything.
const NAV = [
  { id: 'home', href: '#/' },
  { id: 'anime', href: '#/anime' },
  { id: 'cinema', href: '#/cinema' },
  { id: 'manga', href: '#/manga' },
  { id: 'schedule', href: '#/schedule' },
  { id: 'myList', href: '#/list' },
  { id: 'downloads', href: '#/downloads' },
];
const DOCK_DEFAULT = ['home', 'anime', 'manga', 'myList'];
const navSvg = id => ICON[id === 'anime' ? 'series' : id]; // nav icons share the section ids
const navItem = id => NAV.find(n => n.id === id);
// series and movies were one section each before Anime held both
const dockIds = () => [...new Set((store.prefs.dock?.length ? store.prefs.dock : DOCK_DEFAULT).map(id => id === 'series' || id === 'movies' ? 'anime' : id))].filter(navItem);
function renderNav() {
  const dock = dockIds();
  $('#links').innerHTML = NAV.map(n => `<a href="${n.href}" class="${dock.includes(n.id) ? 'dock' : ''}" style="--o:${dock.indexOf(n.id)}">${navSvg(n.id)}`
      + (n.id === 'schedule' ? `<span class="long">${t('schedule')}</span><span class="short">${t('scheduleShort')}</span>` : `<span>${t(n.id)}</span>`) + '</a>').join('');
  $('#drawer').innerHTML = `<div class="dr-head"><a href="#/" class="logo">${ICON.logo}<span class="logo-word" aria-hidden="true">edFlix</span></a><button class="icon-btn" id="drClose" data-ta="close" aria-label="${t('close')}">${ICON.x}</button></div>
    <nav class="dr-links">${NAV.map(n => `<a href="${n.href}">${navSvg(n.id)}<span>${t(n.id)}</span></a>`).join('')}</nav>
    <div class="dr-sep"></div>
    <nav class="dr-links"><a href="#/settings">${ICON.settings}<span>${t('settings')}</span></a></nav>
    <div class="lang dr-lang"><button data-l="ar">ع</button><button data-l="en">EN</button></div>`;
  markActive();
}
function markActive() {
  let a = location.hash.split('/')[1] || '';
  if (a === 'browse' || a === 'movies' || a === 'section') a = 'anime'; // pages inside the Anime section
  document.querySelectorAll('.links a, .dr-links a').forEach(l => l.classList.toggle('active', l.getAttribute('href').split('/')[1] === a));
}
const closeDrawer = () => document.body.classList.contains('drawer-open') && (document.body.classList.remove('drawer-open'), true);
document.addEventListener('click', e => {
  if (e.target.closest('#dockMore')) document.body.classList.add('drawer-open');
  else if (e.target.closest('#drClose, #drawer-bg')) closeDrawer();
});
// while the drawer or a sheet is open, a drag anywhere but its own list doesn't scroll the page behind
// (Android ignores overflow: hidden for touch scrolling)
document.addEventListener('touchmove', e => {
  if (document.body.classList.contains('drawer-open') ? !e.target.closest('#drawer') : $('.sheet-wrap') && !e.target.closest('.sheet-list, .sheet .genres')) e.preventDefault();
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

function settingsView() {
  const dock = dockIds();
  const btn = (act, id, label, txt, off) => `<button class="icon-btn" data-act="${act}" data-id="${id}" title="${label}" aria-label="${label}" ${off ? 'disabled' : ''}>${txt}</button>`;
  const line = (n, i) => `<div class="set-row ${i >= 0 ? 'on' : ''}"><i class="set-tile">${navSvg(n.id)}</i><span>${t(n.id)}</span>${i >= 0
    ? `<div class="set-acts">${btn('up', n.id, t('moveUp'), ICON.caretUp, i === 0) + btn('down', n.id, t('moveDown'), ICON.caretDown, i === dock.length - 1) + btn('del', n.id, t('removeDock'), ICON.minus)}</div>`
    : btn('add', n.id, t('addDock'), ICON.plus).replace('class="icon-btn"', `class="icon-btn${dock.length >= 4 ? ' full' : ''}"`)}</div>`; // full: still tappable, says why
  const head = (title, hint) => `<h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}`;
  const hidden = Object.keys(store.hidden).length;
  view.innerHTML = `<div class="page settings"><h1>${t('settings')}</h1><div class="set-grid">
    <section class="set-card set-dock">${head(t('dockTitle'), t('dockHint'))}
      <div class="dock-preview">${dock.map((id, i) => `<span class="${i ? '' : 'on'}">${navSvg(id)}<small>${t(id === 'schedule' ? 'scheduleShort' : id)}</small></span>`).join('')}</div>
      <h3>${t('inDock')} <small>${dock.length}/4</small></h3>
      <div class="set-list">${dock.map((id, i) => line(navItem(id), i)).join('')}</div>
      <h3>${t('available')}</h3>
      <div class="set-list">${NAV.filter(n => !dock.includes(n.id)).map(n => line(n, -1)).join('')}</div>
    </section>
    <div class="set-side">
    ${api.storage ? `<section class="set-card">${head(t('storage'), t('storageHint'))}<div class="set-stor" id="stor"></div></section>` : ''}
    <section class="set-card">${head(t('hiddenTitle'), t('hiddenHint'))}
      <div class="set-list"><a class="set-row set-link" href="#/hidden"><i class="set-tile">${ICON.eyeSlash}</i><span>${t('openHidden', hidden)}</span>${ICON.caretRight}</a></div></section>
    <section class="set-card">${head(t('language'))}
      <div class="lang set-lang"><button data-l="ar" class="${lang === 'ar' ? 'on' : ''}">العربية</button><button data-l="en" class="${lang === 'en' ? 'on' : ''}">English</button></div>
    </section>${window.BUILD ? `<p class="set-build" dir="ltr">Build ${esc(BUILD)}</p>` : ''}</div></div></div>`;
  if (api.storage) drawStorage();
  $('.settings').onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const d = [...dock], i = d.indexOf(b.dataset.id);
    if (b.dataset.act === 'add') { if (d.length >= 4) return toast(t('dockFull'), true); d.push(b.dataset.id); }
    if (b.dataset.act === 'del') { if (d.length <= 1) return toast(t('dockMin'), true); d.splice(i, 1); }
    if (b.dataset.act === 'up') [d[i - 1], d[i]] = [d[i], d[i - 1]];
    if (b.dataset.act === 'down') [d[i + 1], d[i]] = [d[i], d[i + 1]];
    store.prefs.dock = d; persist('prefs');
    renderNav(); settingsView();
  };
}

// ---------- user state (persisted in main process JSON) ----------
const store = { list: {}, history: {}, seen: {}, prefs: {}, downloads: {}, manga: {}, mangaSeen: {}, hidden: {}, streams: {} }; // hidden: cards long-pressed away, by path; streams: see play()
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
  cardData.set(id, { ...c, path: show, type: c.type === 'episode' ? (show.startsWith('/movie') ? 'movie' : 'anime') : c.type, href: c.href || (c.type === 'episode' ? playHash(c.path) : /^\/(manga|cinema|airing)\//.test(c.path) ? '#' + c.path : '#/title' + c.path) });
  const h = store.history[show];
  return `<div class="card" data-id="${id}" style="--i:${i % 12}">
    <div class="img"><img src="${esc(img(c.poster))}" loading="lazy" alt="" draggable="false"></div>
    ${c.badge ? `<span class="badge">${esc(c.badge.replace(/\bEP\b|الحلقة/, t('ep')))}</span>` : ''}
    ${c.rm ? `<button class="fav rm" title="${t('remove')}" aria-label="${t('remove')}">${ICON.x}</button>`
      : show.startsWith('/airing/') ? '' // a schedule card: not a show page yet (found on witanime when opened), so nothing to list
      : `<button class="fav ${inList(show) ? 'on' : ''}" title="${t('myList')}">${inList(show) ? ICON.check : ICON.plus}</button>`}
    <div class="meta"><div class="t" dir="auto" title="${esc(c.title)}">${esc(c.title)}</div>
      <div class="s">${c.rating ? `<span class="star">${ICON.star}${esc(c.rating)}</span>` : ''}${c.year ? `<span>${esc(c.year)}</span>` : ''}${h?.ep ? `<span>${t('epShort')} ${esc(h.ep)}</span>` : ''}</div></div>
  </div>`;
}
const row = (title, items, href) => !items?.length ? '' : `<section class="row"><h3>${href ? `<a href="${href}">${esc(t(title))} ${ICON.next}</a>` : esc(t(title))}</h3>
  <div class="track-wrap"><button class="arrow l" aria-label="${t('prev')}">${ICON.caretLeft}</button><div class="track">${items.map(card).join('')}</div><button class="arrow r" aria-label="${t('next')}">${ICON.caretRight}</button></div></section>`;
const grid = items => items.length ? `<div class="grid">${items.map(card).join('')}</div>` : `<div class="empty"><b>${t('nothing')}</b>${t('tryElse')}</div>`;
const spinner = () => { view.innerHTML = '<div class="center"><div class="spin"></div></div>'; };
// error text shown on screen, without the sources' names or addresses ("no answer from witanime.site" -> "no answer from the site")
const noNames = m => String(m || '').replace(/https?:\/\/\S+|\b[\w.-]*(wit ?anime|anime ?rco|egy ?dead|my ?seed|arab ?seed|appswat|mesh ?manga|manga ?swat|manga ?tek|anime ?schedule|mega ?max)[\w.-]*/gi, t('theSite'));
const failed = e => { view.innerHTML = `<div class="center"><div class="empty"><b>${t('unreachable')}</b>${esc(noNames(e.message))}<br><br><button class="btn red">${t('retry')}</button></div></div>`; $('.empty .btn').onclick = route; };

// event delegation for cards, arrows, image fade-in
// long-press a card: a menu to hide it from every page (its path goes in store.hidden; #/hidden lists them) or (un)list it
const hideLabel = d => t(d.type === 'manga' ? 'hideManga' : d.type !== 'cinema' ? 'hideAnime' : /^\/cinema\/(serie|season|episode)\//.test(d.path) ? 'hideSeries' : 'hideMovie');
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
// Long-press (or right-click) menus: cards' above; a page sets pagePress = [selector, open(el)] for its own elements
// (chapter tiles, download rows). pressOf: [the pressed element, its menu (none: a card without data)]
let pressT, pressAt, pressed = null, pagePress = null; // pressed: the element whose menu opened
const pressOf = e => {
  const c = e.target.closest('.card'), d = c && cardData.get(c.dataset.id);
  if (c) return [c, d && (() => cardMenu(d))];
  const el = pagePress && e.target.closest(pagePress[0]), open = pagePress?.[1];
  return el && [el, () => open(el)];
};
function pressMenu([el, open]) {
  if (pressed || !open) return; // the timer and the browser's own long-press (contextmenu) both fire: one menu
  pressed = el;
  clearTimeout(pressT);
  navigator.vibrate?.(20);
  open();
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
  pressMenu(p);
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
  location.hash = d.href;
});
document.addEventListener('load', e => e.target.tagName === 'IMG' && e.target.classList.add('ok'), true);
document.addEventListener('error', e => e.target.tagName === 'IMG' && e.target.classList.add('ok', 'broken'), true); // broken: offline posters etc.
let barColor;
const syncBar = () => {
  const c = $('.player') ? '#000000' : $('#nav').classList.toggle('solid', scrollY > 40) ? '#0a0a0a' : '#000000';
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
$('#search').onsubmit = e => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  if (q) { closeSearch(); location.hash = '#/search/' + encodeURIComponent(q); }
};

// ---------- views ----------
// Continue Watching: anime episodes and films (store.history) and manga chapters (store.manga), newest first.
// `rm` names the stored entry, so the card's × can drop it.
function continued(kinds) {
  return [
    ...Object.values(store.history).map(h => h.slug
      ? { kind: 'cinema', at: h.at, path: h.show, type: 'cinema', title: h.title, poster: h.poster, href: h.ep ? edHref(h.slug) : `#/cinema/${encodeURIComponent(h.slug)}/watch`, badge: h.ep && t('ep') + ' ' + h.ep, rm: 'history:' + h.show }
      : { kind: 'anime', at: h.at, path: h.epPath, showPath: h.show, type: 'episode', title: h.title, poster: h.poster, badge: t('ep') + ' ' + h.ep, rm: 'history:' + h.show }),
    ...Object.values(store.manga).map(r => ({ kind: 'manga', at: r.at, path: '/manga/series/' + r.id, type: 'manga', title: r.title, poster: r.poster,
      badge: `${t('chShort')} ${chNum(r.n)}`, href: '#/manga/read/' + r.chapterId, rm: 'manga:' + r.id })),
  ].filter(c => kinds.includes(c.kind)).sort((a, b) => b.at - a.at);
}

// a page under a cover slider of { banner, title, desc, info: hash, play?: hash }; refresh redraws it with fresh data
let heroTimer;
function heroPage(hero, rows, refresh) {
  view.innerHTML = `
    <div class="hero">${hero.map((h, i) => `<div class="slide ${i ? '' : 'on'}"><img src="${esc(img(h.banner))}" alt=""></div>`).join('')}
      <div class="info"></div><div class="dots">${hero.map((_, i) => `<i data-i="${i}" class="${i ? '' : 'on'}"></i>`).join('')}</div></div>
    <div class="rows">${rows}
      <div style="padding:0 4%"><button class="btn ghost small refresh" id="rf">${ICON.refresh} ${t('refreshSite')}</button></div>
    </div>`;
  pageRefresh = refresh;
  $('#rf').onclick = () => pageRefresh().then(() => toast(t('updated')));
  if (!hero.length) $('.hero').style.height = '120px';
  let cur = 0;
  const show = i => {
    const was = cur;
    cur = (i + hero.length) % hero.length;
    const h = hero[cur];
    // the one leaving keeps its zoom going while it fades (dropping it snapped the picture back mid-fade: a flicker)
    document.querySelectorAll('.hero .slide').forEach((s, j) => { s.classList.toggle('on', j === cur); s.classList.toggle('out', j === was && j !== cur); });
    document.querySelectorAll('.dots i').forEach((s, j) => s.classList.toggle('on', j === cur));
    $('.hero .info').innerHTML = `<h2>${esc(h.title)}</h2><p dir="auto">${esc(h.desc)}</p>
      <div class="actions">${h.play ? `<a class="btn play" href="${esc(h.play)}">${ICON.play} ${t('play')}</a>` : ''}
      <a class="btn ghost" href="${esc(h.info)}">${ICON.info} ${t('moreInfo')}</a></div>`;
  };
  if (hero.length) {
    show(0);
    $('.dots').onclick = e => e.target.dataset.i && (show(+e.target.dataset.i), restart());
    const restart = () => { clearInterval(heroTimer); heroTimer = setInterval(() => show(cur + 1), 8000); };
    restart();
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
const animeRows = d => d.rows.map(r => row(r.title, r.items, '#/section/' + encodeURIComponent(r.title))).join('');

// Home: a bit of every section. A site that doesn't answer just leaves its rows out.
async function home(force) {
  const hotP = load('mangaList', mUrl('series/', { is_hot: true, page_size: 30 }), force).catch(e => (console.error(e), null));
  const filmsP = edList('all', 1, force).catch(e => (console.error(e), null));
  const [d, hot, latest, films, tLatest, m, f] = await Promise.all([
    scraper.home(force),
    hotP,
    load('mangaLatest', mUrl('chapters/', { page_size: 60, order_by: '-created_at' }), force),
    filmsP,
    tekLatest(force),
    hotP.then(h => mangaHero(h?.items.slice(0, 3) || [])),
    filmsP.then(fl => cinemaHero(fl?.items.slice(0, 3) || [])),
  ].map(p => p.catch(e => (console.error(e), null))));
  if (!d && !hot && !films) throw new Error(t('unreachable'));
  // the slider takes turns: anime, manga, film, anime…
  const a = d ? animeHero(d).slice(0, 3) : [];
  const hero = [...Array(3)].flatMap((_, i) => [a[i], m?.[i], f?.[i]]).filter(Boolean);
  heroPage(hero, `
      ${row(t('continueWatching'), continued(['anime', 'cinema', 'manga']))}
      ${row(t('myList'), Object.values(store.list).sort((a, b) => b.at - a.at), '#/list')}
      ${d ? animeRows({ rows: d.rows.slice(0, 2) }) : ''}
      ${row(t('mHot'), hot?.items, '#/manga/browse/1?is_hot=true')}
      ${row(t('mLatest'), mMerge([latest?.items, tLatest?.items]), '#/manga')}
      ${row(t('cinema'), dubbed(films?.items), '#/cinema')}
      ${d ? animeRows({ rows: d.rows.slice(2) }) : ''}`, () => home(true));
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
  view.innerHTML = `<div class="page"><h1>${esc(t(label))} <button class="btn ghost small refresh" id="rf">${ICON.refresh} ${t('refresh')}</button></h1>${grid(d.items)}</div>`;
  $('#rf').onclick = pageRefresh = refresh;
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
  const items = (await scraper.home(force)).rows.find(r => r.title === name)?.items || [];
  listView(name, { items, pages: 1 }, null, refresh);
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
  view.innerHTML = `<div class="page sched"><h1>${t('schedule')} <button class="btn ghost small refresh" id="rf">${ICON.refresh} ${t('refresh')}</button></h1>
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
  $('#rf').onclick = () => pageRefresh().then(() => toast(t('updated')));
}

// a schedule card (#/airing/<animeschedule slug>): the show on witanime, searched by each of its names (romaji, English...)
// until one gives a title that matches, and last by its first word (witanime's search wants the start of its own spelling:
// "Ranma ½ (2024) 3rd Season" finds nothing, "Ranma" finds "Ranma1/2 3rd Season"); the page is replaced by it, so back returns to the schedule
async function airing(route) {
  const s = (await scraper.airTimes()).find(x => x.route === route);
  const names = [...new Set([...await scraper.airNames(route).catch(() => []), s?.title || route.replace(/-/g, ' ')])].slice(0, 4);
  const w = names[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  for (const q of [...names, w[0].length >= 5 ? w[0] : w.slice(0, 2).join(' ')].filter(Boolean)) {
    const [score, hit] = (await scraper.search(q).catch(() => ({ items: [] }))).items
      .map(i => [Math.max(...names.map(n => scraper.airScore(i.title, n))), i]).sort((a, b) => b[0] - a[0])[0] || [];
    if (score >= .6) return location.replace('#/title' + hit.path);
  }
  view.innerHTML = `<div class="center"><div class="empty"><b>${esc(s?.title || names[0])}</b>${t('notOnSite')}<br><br>
    <a class="btn ghost" href="#/schedule">${t('schedule')}</a></div></div>`;
}

// loading placeholders: n cards (their image box already shimmers, see .card .img), and rows of them
const skel = n => Array.from({ length: n }, (_, i) => `<div class="card skel" style="--i:${i}"><div class="img"></div><div class="meta"><span class="bar"></span></div></div>`).join('');
const skelRows = n => Array.from({ length: n }, () => `<section class="row"><h3><span class="bar"></span></h3><div class="track">${skel(8)}</div></section>`).join('');

// ---------- search: what the user meant ----------
// The sites match titles literally: "spiderman" doesn't find "Spider-Man", "naurto" finds nothing, and "solo leveling"
// isn't what witanime calls it. What was typed is asked first; when that finds little, it's asked again as the names that
// typo-tolerant title searches suggest (Kitsu for anime and manga, IMDb for films and series) and as its other spellings,
// and everything found is ranked by how close its title is to what was typed or to one of those names.
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const pairs = s => { s = ` ${s.replace(/ /g, '')} `; return new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))); };
const dice = (a, b) => { const x = pairs(a), y = pairs(b); return 2 * [...x].filter(p => y.has(p)).length / (x.size + y.size); };
// 0..1: 1 when the title holds the query (spaces and punctuation aside), else the most letter pairs it shares with the
// whole title or with a run of as many title words
function closeness(q, title) {
  const a = fold(q), b = fold(title);
  if (!a || !b) return 0;
  if (b.replace(/ /g, '').includes(a.replace(/ /g, ''))) return 1;
  const n = a.split(' ').length, w = b.split(' ');
  return Math.max(dice(a, b), ...w.map((_, i) => dice(a, w.slice(i, i + n).join(' '))));
}
// "spider-man" -> "spider man", "spiderman", "spider-man", "spider"
const spellings = q => {
  const w = fold(q).split(' ').filter(Boolean);
  return [w.join(' '), w.join(''), w.join('-'), ...(w.length > 1 ? w.filter(x => x.length >= 4).sort((a, b) => b.length - a.length).slice(0, 1) : [])];
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
  if (!suggested.has(k)) suggested.set(k, SUGGEST[kind](q).then(l => [...new Set(l.filter(n => n.some(x => closeness(q, x) >= .45)).flat().filter(Boolean))].slice(0, 4), () => []));
  return suggested.get(k);
};
// ask(text) -> cards. Cards only found by a suggestion or another spelling must be close to one of the names.
async function fuzzySearch(q, kind, ask) {
  const found = new Map(), add = (l, other) => (l || []).forEach(c => found.has(c.path) || found.set(c.path, { c, other }));
  add(await ask(q).catch(() => []), false);
  let names = [q];
  if ([...found.values()].filter(x => closeness(q, x.c.title) >= .6).length < 3) {
    const sug = await suggest(kind, q);
    names = [q, ...sug];
    const more = [...new Set([...sug, ...spellings(q)])].filter(v => v !== q).slice(0, 5);
    (await Promise.all(more.map(v => ask(v).catch(() => [])))).forEach(l => add(l, true));
  }
  const score = c => Math.max(...names.map(n => closeness(n, c.title)));
  return [...found.values()].map(x => ({ ...x, s: score(x.c) })).filter(x => !x.other || x.s >= .5)
    .sort((a, b) => b.s - a.s || a.c.title.length - b.c.title.length).map(x => x.c); // as close: the shorter title (the show, before its spin-offs)
}

async function search(q) {
  $('#search').q.value = q;
  const head = `<h1>${esc(t('results', q))} <a class="btn ghost small h1-btn" href="#/filter/1?search=${encodeURIComponent(q)}">${ICON.filter} ${t('filter')}</a></h1>`;
  view.innerHTML = `<div class="page">${head}<div class="grid">${skel(12)}</div></div><div class="rows sched-rows">${skelRows(2)}</div>`;
  const d = { items: await fuzzySearch(q, 'anime', v => scraper.search(v).then(r => r.items)) };
  // "nothing here" only once the manga and film rows came back empty too
  view.innerHTML = `<div class="page">${head}${d.items.length ? grid(d.items) : ''}</div><div class="rows sched-rows" id="mres">${skelRows(2)}</div>`;
  const more = await moreResults({ search: q }, { search: q }, d.items);
  if (!$('#mres')) return;
  $('#mres').innerHTML = more;
  if (!more && !d.items.length) $('.page').insertAdjacentHTML('beforeend', grid([]));
}
// manga and film matches, as rows (the search page, and the filter page). mq: a manga browse query (MangaSwat's terms; and:
// more genre ids each card must have), fq: films (see filmQuery in filter.js; { search } alone for the search page); either
// null to leave that section out. egydead's anime films are already dropped by category; this also drops one it filed
// elsewhere when witanime listed the same film (same title, same year)
async function moreResults(mq, fq, anime = []) {
  const { and = [], ...api } = mq || {}, tq = mq && !and.length && tekQuery(new URLSearchParams(api));
  const ask = (kind, fn, s) => s ? fuzzySearch(s, kind, fn) : fn(); // a search: what was meant too (see fuzzySearch)
  const [m, tm, f] = await Promise.all([
    mq && ask('manga', s => load('mangaList', mUrl('series/', { ...api, ...(s && { search: s }), page_size: and.length ? 60 : 20 })).then(r => r.items), api.search).catch(() => null),
    tq && ask('manga', s => load('mangaTekList', tUrl('manga', { ...tq, ...(s && { search: s }), limit: 20 })).then(r => r.items), tq.search).catch(() => null),
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
  return (manga.length ? row(t('manga'), manga, '#/manga/browse/1' + (Object.keys(api).length ? '?' + new URLSearchParams(api) : '')) : '')
    + row(t('cinema'), films, fq && !fq.search ? '#/cinema/browse/all' : '');
}

// ---------- downloads ----------
const offlineHash = epPath => '#/offline/' + epPath.replace(/^\/watch\//, '');
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

const IN_APP = 'mediafire'; // the one host the app can download from itself (see main.js)
// Each show (an anime, a manga series) has its own queue: one episode/chapter at a time, oldest first, while
// different shows download side by side. A show can be paused on its own; Pause all holds every show.
const held = show => store.prefs.dlHeld?.[show] ?? !!store.prefs.dlPaused; // a show's own choice beats Pause all
function startDownload(item, quality = item.quality || store.prefs.dlQuality) {
  const cur = store.downloads[item.id];
  if (cur?.state === 'active' || cur?.state === 'done') return toast(t(cur.state === 'done' ? 'dlDone' : 'dlActive'));
  const wait = held(item.show), busy = Object.values(store.downloads).some(d => d.show === item.show && d.state === 'active');
  store.downloads[item.id] = { ...item, quality, state: wait ? 'paused' : 'queued', received: 0, total: 0, at: Date.now() };
  saveDownloads(); drawDownloads();
  toast(t(wait ? 'dlPausedAll' : busy ? 'dlQueued' : 'dlPreparing'));
  pumpDownloads();
}
document.addEventListener('visibilitychange', () => { // back in the app: anything queued meanwhile goes to the service
  if (document.hidden) return;
  api.downloadHold?.(dlBusy, dlLabels());
  pumpDownloads();
});
async function runEpisode(d) {
  let links = [];
  try { links = (await api.downloadLinks(d.epPath)).filter(l => l.label === IN_APP); } catch (e) { console.error(e); }
  const rank = l => l.quality === d.quality ? -1 : QUALITY.indexOf(l.quality);
  links.sort((a, b) => rank(a) - rank(b));
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
  const links = (await api.downloadLinks(d.epPath)).filter(l => l.label === IN_APP);
  links.sort((a, b) => (a.quality === d.quality ? -1 : QUALITY.indexOf(a.quality)) - (b.quality === d.quality ? -1 : QUALITY.indexOf(b.quality)));
  for (const l of links) { try { return { url: await api.downloadUrl(l.token), quality: l.quality }; } catch (e) { console.error(e); } }
  return {};
}
function prefetch() {
  for (;;) {
    const d = Object.values(store.downloads).filter(d => dlSent.has(d.id) && !dlFetched.has(d.id) && d.state === 'queued'
      && (isManga(d) ? dlFetching.pages < 3 : !dlFetching.episode)).sort((a, b) => a.at - b.at)[0];
    if (!d) return;
    const k = isManga(d) ? 'pages' : 'episode';
    dlFetched.add(d.id); dlFetching[k]++;
    dlSources(d).then(src => dlSent.has(d.id) && Object.keys(src).length && api.downloadEnqueue({ ...dlJob(d), ...src }), e => console.error(e))
      .finally(() => { dlFetching[k]--; prefetch(); });
  }
}
// starts the next waiting item of every show that isn't paused and has nothing downloading (phones: see dlSent)
function pumpDownloads() {
  if (api.downloadEnqueue) {
    for (const d of Object.values(store.downloads).filter(d => d.state === 'queued' && !held(d.show) && !dlSent.has(d.id)).sort((a, b) => a.at - b.at)) {
      dlSent.add(d.id);
      api.downloadEnqueue(dlJob(d));
    }
    return prefetch();
  }
  const shows = {};
  for (const d of Object.values(store.downloads)) (shows[d.show] ||= []).push(d);
  for (const [show, items] of Object.entries(shows)) {
    if (held(show) || items.some(d => d.state === 'active')) continue;
    const d = items.filter(d => d.state === 'queued').sort((a, b) => a.at - b.at)[0];
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
    if (p.state === 'done') toast(t('dlFinished', `${d.title} ${isManga(d) ? t('chapter') : t('ep')} ${d.ep}`));
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
          <small>${isManga(d0) ? t('manga') : t('kindAnime')} · ${isManga(d0) ? t('chCount', done) : t('epCount', done)}${act.length ? ' · ' + t('dlActiveN', act.length) : ''}</small>
          ${act.length ? `<div class="dl-bar"><i style="width:${tot ? r / tot * 100 : 0}%"></i></div>` : ''}</div>
        ${showToggle(show, items)}<span class="chev">${ICON.next}</span></a>`;
    }).join('')}</div>` : `<div class="empty"><b>${t('noDownloads')}</b>${t('noDownloadsHint')}</div>`}</div>`;
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
      <div><a class="dl-title" href="${key.startsWith('/manga/') ? '#' + key : '#/title' + key}" dir="auto">${esc(d0.title)}</a>
        <small>${isManga(d0) ? t('manga') : t('kindAnime')} · ${isManga(d0) ? t('chCount', items.length) : t('epCount', items.length)}${size ? ' · ' + mb(size) : ''}</small></div>
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
  if (d?.state !== 'done') return location.replace(playHash(epPath));
  store.history[d.show] = { show: d.show, epPath, ep: d.ep, title: d.title, poster: d.poster, at: Date.now() };
  store.seen[epPath] = 1;
  persist('history'); persist('seen');
  view.innerHTML = `<div class="player">
    <header>
      <button class="icon-btn" id="back" title="${t('back')}" aria-label="${t('back')}">${ICON.back}</button>
      <div class="ttl"><a href="#/title${esc(d.show)}">${esc(d.title)}</a><small>${t('episode')} ${esc(d.ep)}</small></div>
      <div class="sp"></div>
      ${api.cast ? `<button class="icon-btn pcast" title="${t('cast')}" aria-label="${t('cast')}">${ICON.cast}</button>` : ''}
      <span class="chip">${ICON.download} ${t('offline')}</span>
    </header>
    <div class="stage"><video controls autoplay playsinline src="${esc(api.fileSrc(d.file))}" data-file="${esc(d.file)}"></video></div>
    ${playBar(true)}
  </div>`;
  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/downloads'));
}

function myList() {
  const items = Object.values(store.list).sort((a, b) => b.at - a.at), nh = Object.keys(store.hidden).length;
  view.innerHTML = `<div class="page"><h1>${t('myList')}${nh ? ` <a class="btn ghost small h1-btn" href="#/hidden">${ICON.eyeSlash} ${t('openHidden', nh)}</a>` : ''}</h1>${items.length ? grid(items) : `<div class="empty"><b>${t('listEmpty')}</b>${t('listHint')}</div>`}</div>`;
}

// #/hidden: what was long-pressed away, by kind; ✕ (the card's remove button) brings one back
function unhidden() { toast(t('shown')); hiddenView(); }
function hiddenView() {
  const all = Object.values(store.hidden).sort((a, b) => b.at - a.at).map(h => ({ ...h, rm: 'hidden:' + h.path }));
  const kinds = [['anime', h => h.type !== 'manga' && h.type !== 'cinema'], ['manga', h => h.type === 'manga'], ['cinema', h => h.type === 'cinema']];
  view.innerHTML = `<div class="page hidden-page"><h1>${t('hiddenTitle')}</h1><p class="hint">${t('hiddenHint')}</p>
    ${all.length ? kinds.map(([k, f]) => (l => l.length ? `<h2>${t(k)} <small>${l.length}</small></h2>${grid(l)}` : '')(all.filter(f))).join('')
      : `<div class="empty"><b>${t('noHidden')}</b></div>`}</div>`;
}

async function title(path, force) {
  const d = await scraper.details(path, force);
  const h = store.history[path];
  const type = path.startsWith('/movie') ? 'movie' : 'anime';
  const first = h?.epPath || d.episodes[0]?.path;
  view.innerHTML = `
    <div class="det-hero"><div class="bg" style="background-image:url('${esc(img(d.banner))}')"></div>
      <div class="det">
        ${d.poster ? `<img class="poster" src="${esc(img(d.poster))}" alt="">` : ''}
        <div>
          <h1>${esc(d.title)}</h1>${d.alt ? `<div class="alt">${esc(d.alt)}</div>` : ''}
          <div class="chips">${d.tags.map((t, i) => `<span class="chip ${i === 2 ? 'red' : ''}">${esc(t)}</span>`).join('')}${d.genres.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</div>
          <p class="desc" dir="auto">${esc(d.desc)}</p>
          <div class="actions">
            ${first ? `<a class="btn red" href="${playHash(first)}">${ICON.play} ${h ? esc(t('resume', h.ep)) : t('play')}</a>` : ''}
            <button class="btn ghost" id="fav">${inList(path) ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList')}</button>
            ${d.trailer ? `<button class="btn ghost" id="trl">${ICON.play} ${t('trailer')}</button>` : ''}
            <button class="btn ghost" id="rf">${ICON.refresh} ${t('refresh')}</button>
          </div>
        </div>
      </div>
    </div>
    ${d.info.length ? `<div class="infos">${d.info.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>` : ''}
    ${d.episodes.length > 1 || type === 'anime' ? `<div class="section"><h2>${t('episodes')} <small>${d.episodes.length}</small>
      <div class="ep-tools"><input id="epf" placeholder="${t('jump')}" type="number"><button class="btn ghost small" id="rev" aria-label="${t('reverse')}" title="${t('reverse')}">${ICON.sort}</button></div></h2>
      <div class="eps" id="eps"></div></div>` : ''}
    ${d.related.length ? row(t('moreLike'), d.related) : ''}`;

  const eps = $('#eps');
  let rev = false;
  const drawEps = (f = '') => eps && (eps.innerHTML = (rev ? [...d.episodes].reverse() : d.episodes)
    .filter(e => !f || String(e.ep).startsWith(f))
    .map(e => `<a class="ep ${store.seen[e.path] ? 'seen' : ''} ${h?.epPath === e.path ? 'last' : ''}" href="${playHash(e.path)}">${/^\d/.test(e.ep) ? t('ep') + ' ' : ''}${esc(e.ep)}</a>`).join(''));
  drawEps();
  if (eps) {
    $('#epf').oninput = e => drawEps(e.target.value);
    $('#rev').onclick = () => { rev = !rev; drawEps($('#epf').value); };
  }
  $('#fav').onclick = e => { const on = toggleList({ path, title: d.title, poster: d.poster, type }); e.currentTarget.innerHTML = on ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList'); };
  pageRefresh = () => title(path, true);
  $('#rf').onclick = () => pageRefresh().then(() => toast(t('updated')));
  if (d.trailer) $('#trl').onclick = () => showTrailer(d.trailer);
}
// a full-screen overlay (a tap, back or Esc closes it): trailers, and posters shown full size
function overlay(html) {
  const m = document.createElement('div');
  m.className = 'trailer';
  m.innerHTML = html;
  m.onclick = () => m.remove();
  document.body.append(m);
}
const showTrailer = url => overlay(`<iframe src="${esc(url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`);
// a tap on a details page's poster, or a downloaded show's, shows it full size
document.addEventListener('click', e => {
  const p = e.target.closest('.det .poster, .dl-hero > img');
  if (p) overlay(`<img class="viewer" src="${esc(p.src)}" alt="">`);
});

// Sites list one host several times in different qualities: keep the first (best) one of each.
const QUALITY = ['4K', 'FHD', 'HD', 'SD'];
const STREAMS_KEEP = 90 * 24 * HOUR; // store.streams: servers' answers, anime episodes' (play) and films' (cinema.js)
const bestPerHost = list => { const seen = new Set(); return list.filter(s => { const h = (s.label || '').toLowerCase().split(' ')[0]; return !seen.has(h) && seen.add(h); }); };

async function play(epPath) {
  if (store.downloads[epPath]?.state === 'done') return location.replace(offlineHash(epPath)); // downloaded: no need to stream
  const show = showOf(epPath);
  let d = { title: '', poster: '', episodes: [] };
  try { d = await scraper.details(show); } catch {}
  const idx = d.episodes.findIndex(e => e.path === epPath);
  const ep = d.episodes[idx]?.ep ?? epPath.split('/').pop();
  store.history[show] = { show, epPath, ep, title: d.title, poster: d.poster, at: Date.now() };
  store.seen[epPath] = 1;
  persist('history'); persist('seen');

  const prev = d.episodes[idx - 1], next = d.episodes[idx + 1];
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
      ${api.cast ? `<button class="icon-btn pcast" title="${t('cast')}" aria-label="${t('cast')}">${ICON.cast}</button>` : ''}
      <div class="dd dlm" id="dlm">
        <button class="dd-btn" title="${t('download')}">${ICON.download}<span class="lbl">${t('downloadShort')}</span></button>
        <div class="dd-menu"></div>
      </div>
      <button class="btn ghost small" id="ext" title="${t('openBrowserTip')}">${ICON.external} <span>${t('openBrowser')}</span></button>
      <button class="icon-btn" id="prev" title="${t('prevEp')}" aria-label="${t('prevEp')}" ${prev ? '' : 'disabled'}>${ICON.skipBack}</button>
      <button class="icon-btn" id="next" title="${t('nextEp')}" aria-label="${t('nextEp')}" ${next ? '' : 'disabled'}>${ICON.skipForward}</button>
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
    api.player(stream.url, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }, stream.referrer);
  };
  playerObs = new ResizeObserver(place);
  playerObs.observe(stage);

  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/title' + show));
  $('#ext').onclick = () => api.openExternal(scraper.SITE + epPath);
  if (prev) $('#prev').onclick = () => location.replace(playHash(prev.path));
  if (next) $('#next').onclick = () => location.replace(playHash(next.path));

  const here = () => decodeURIComponent(location.hash) === playHash(epPath);
  // animerco's and WeCima's servers for the same episode are looked up alongside and appended as backups
  const backup = Promise.all([scraper.animerco, scraper.wecima].map(f => f(d.title, d.alt, ep, epPath.startsWith('/watch/movie/')).catch(e => (console.error(e), [])))).then(l => l.flat());
  // witanime servers played before: the host's link they led to stays put (witanime's tokens die with the session), so they
  // play straight away and witanime's fresh list is only merged in behind them. Forgotten after STREAMS_KEEP.
  const known = store.streams[epPath]?.list || {}, key = s => s.label + '|' + s.quality;
  const fresh = api.sources(epPath).then(l => bestPerHost(l.sort((a, b) => QUALITY.indexOf(a.quality) - QUALITY.indexOf(b.quality))));
  let servers = Object.entries(known).map(([k, st]) => ({ label: k.split('|')[0], quality: k.split('|')[1], st }));
  let limited = false, why = ''; // witanime is rate-limiting this session: say so instead of "no servers"; why: what refused it
  if (servers.length) fresh.then(l => { // after the remembered ones, before animerco's
    const add = bestPerHost([...servers.filter(s => s.st), ...l]).filter(s => !s.st);
    servers.splice(servers.filter(s => s.st).length, 0, ...add);
    if (here()) draw();
  }, e => console.error(e));
  else try { servers = await fresh; } catch (e) { console.error(e); limited = /rate-limited/.test(e.message); why = noNames(e.message); }
  if (!here()) return; // navigated away meanwhile
  const srv = $('#srv');
  let cur = null, busy = false, dead = !servers.length;
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
    srv.querySelector('.dd-menu').innerHTML = group(t('mainServers'), false) + group(t('backupServers'), true) || `<div class="dd-group">${t('searching')}</div>`;
  };
  draw();
  // try the chosen server, falling through to the next ones (animerco's included) until one resolves
  let seq = 0;
  const tryFrom = async (i, n = 0, my = ++seq) => {
    dead = n >= servers.length;
    if (dead) { busy = false; draw(); stage.innerHTML = `<div class="empty"><b>${t('noneWorked')}</b>${t('noneWorkedHint')}</div>`; return; }
    cur = servers[(i + n) % servers.length]; busy = true; draw();
    stream = null; api.player(null); // drop the old video so the spinner shows while the new one loads
    stage.innerHTML = '<div class="spin"></div>';
    let st;
    try { st = cur.st || (cur.url ? { url: await (api.unwrap?.(cur.url) ?? cur.url), referrer: '' } : await api.stream(cur.token)); } catch (e) { console.error(e); return my === seq && tryFrom(i, n + 1, my); }
    if (cur.token) { Object.assign(store.streams[epPath] ||= { list: {} }, { at: Date.now() }).list[key(cur)] = st; persist('streams'); }
    if (!here() || my !== seq) return;
    stream = st; busy = false; draw();
    store.prefs.server = cur.label; persist('prefs');
    place();
  };
  srv.querySelector('.dd-btn').onclick = () => srv.classList.contains('open') ? closeMenu(srv) : openMenu(srv);

  // download menu: every download link by quality. MediaFire downloads in the app, other hosts open in the browser.
  const dlm = $('#dlm');
  let links = null; // fetched on first open
  const drawDl = () => {
    const have = store.downloads[epPath];
    const top = have?.state === 'done' ? `<button class="dd-item go" data-act="offline">${ICON.play}<span class="host">${t('playOffline')}</span></button>`
      : have?.state === 'active' ? `<button class="dd-item go" data-act="list">${ICON.download}<span class="host">${t('dlOpenList')}</span></button>` : '';
    const item = l => `<button class="dd-item ${l.quality === store.prefs.dlQuality && l.label === store.prefs.dlHost ? 'on' : ''}" data-i="${links.indexOf(l)}">
      <span class="host">${esc(l.label)}</span><span class="tag ${l.label === IN_APP ? 'app' : ''}">${l.label === IN_APP ? t('inApp') : ICON.external + ' ' + t('browser')}</span>
      ${CHECK}</button>`;
    const groups = !links ? `<div class="dd-group">${t('searching')}</div>` : !links.length ? `<div class="dd-group">${t('dlNone')}</div>`
      : QUALITY.map(q => links.filter(l => l.quality === q).sort((a, b) => (b.label === IN_APP) - (a.label === IN_APP)))
          .filter(g => g.length).map(g => `<div class="dd-group">${g[0].quality}<small>${g.length}</small></div>${g.map(item).join('')}`).join('');
    dlm.querySelector('.dd-menu').innerHTML = top + groups;
  };
  dlm.querySelector('.dd-btn').onclick = async () => {
    if (dlm.classList.contains('open')) return closeMenu(dlm);
    drawDl();
    openMenu(dlm);
    if (links) return;
    try { links = await api.downloadLinks(epPath); } catch (e) { console.error(e); links = []; }
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
    if (l.label === IN_APP) startDownload({ id: epPath, epPath, show, title: d.title, ep, poster: d.poster }, l.quality);
    else api.openDownloadPage(l.token).then(() => toast(t('openedBrowser')), () => toast(t('dlFailed'), true));
  };
  srv.querySelector('.dd-menu').onclick = e => { const b = e.target.closest('.dd-item'); if (b) { closeMenu(); tryFrom(+b.dataset.i); } };
  if (servers.length) tryFrom(Math.max(0, servers.findIndex(s => s.label === store.prefs.server)));
  else stage.innerHTML = '<div class="spin"></div>'; // nothing on witanime: wait for animerco
  const all = await backup, extra = bestPerHost([...servers, ...all]).filter(s => all.includes(s)); // a host already listed isn't offered twice
  if (!here()) return;
  const from = servers.length;
  servers.push(...extra);
  draw();
  if (dead && extra.length) tryFrom(from); // witanime had nothing that worked: switch to animerco
  else if (!servers.length) stage.innerHTML = limited
    ? `<div class="empty"><b>${t('rateLimited')}</b>${t('rateLimitedHint')}<br><br><button class="btn red" id="again">${t('retry')}</button></div>`
    : `<div class="empty"><b>${t('noServers')}</b>${t('noServersHint')}${why ? `<small class="why" dir="ltr">${esc(why)}</small>` : ''}${api.unblock ? `<br><br><button class="btn red" id="verify">${t('verify')}</button>` : ''}</div>`;
  $('#again')?.addEventListener('click', route);
  $('#verify')?.addEventListener('click', () => api.unblock().then(route, () => toast(t('verifyFailed'), true))); // phones: witanime's Cloudflare check
}
let playerObs;
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
  const v = $('.player video'), title = $('.player .ttl')?.innerText.replace(/\s+/g, ' ').trim() || '';
  api.cast({ title, file: v?.dataset.file, at: v?.currentTime || 0 }).then(r => {
    if (r?.screen) return;
    v?.pause();
    api.player(null);
    toast(t('casting'));
  }, e => /cancelled/.test(e.message) || toast(t(/no video/.test(e.message) ? 'castPlayFirst' : /no wifi/.test(e.message) ? 'castWifi' : 'castFailed'), true));
});
const closeTrailer = () => { const m = $('.trailer'); m?.remove(); return !!m; };
const back = () => closeDrawer() || closeSheet() || closeSelect() || closeSearch() || closeMenu() || closeTrailer() || ($('.player') && $('#back').click());
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
  addEventListener('touchstart', e => {
    // only on the page itself: not while the drawer, a sheet (filters...), a menu, the search or an overlay is open
    on = !busy && !!pageRefresh && e.touches.length === 1 && !$('.player, .sheet-wrap, .dd.open, .trailer, body.searching, body.drawer-open');
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    start = on && scrollY <= 0 ? y0 : null; pulling = false; y = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!on || e.touches.length > 1) return;
    const { clientX: x, clientY: cy } = e.touches[0];
    if (start == null) { if (scrollY > 0) return; start = cy; x0 = x; } // scrolled up to the top: the pull starts here
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
async function route(soft) {
  // background redraws wait while a video plays or a search/sheet/menu is open, rather than reset them
  // (and while a pull-to-refresh runs: a redraw would drop its loads, and its spinner would never stop)
  if (soft && (/^#\/(play|offline|manga\/read)\/|^#\/cinema\/([^/]+\/watch|episode\/)/.test(location.hash) || $('.sheet-wrap, .dd.open, body.searching, #ptr.busy'))) return;
  scraper.newView();
  clearInterval(heroTimer);
  cardData.clear();
  pageRefresh = pagePress = null;
  if (!soft) picks = null;
  closeSearch();
  playerObs?.disconnect();
  api.player(null);
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [, a, ...rest] = h.split('/');
  markActive();
  if (!soft) closeDrawer(); // a background redraw (fresher site data, often just after launch) happens behind it
  api.scrollbar?.(!(a === 'manga' && rest[0] === 'read')); // phones: the reader has its own scrollbar
  $('#nav').style.display = a === 'play' || a === 'offline' || (a === 'manga' && rest[0] === 'read') || (a === 'cinema' && (rest[1] === 'watch' || rest[0] === 'episode')) ? 'none' : '';
  if (!soft) { scrollTo(0, 0); spinner(); }
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
    else if (a === 'downloads') drawDownloads();
    else if (a === 'offline') offline('/watch/' + rest.join('/'));
    else if (a === 'schedule') await schedule();
    else if (a === 'airing') await airing(rest[0]);
    else if (a === 'manga') await mangaRoute(rest);
    else if (a === 'cinema') await cinemaRoute(rest);
    else if (a === 'settings') settingsView();
    else if (a === 'title') await title('/' + rest.join('/'));
    else if (a === 'play') await play('/watch/' + rest.join('/'));
  } catch (e) { console.error(e); failed(e); }
  if (soft) view.querySelectorAll('img').forEach(i => i.complete && i.naturalWidth && i.classList.add('ok')); // already cached
  syncBar();
  if (!soft) { view.style.animation = 'none'; view.offsetHeight; view.style.animation = ''; }
}
scraper.watch(() => route(true)); // the site had something newer than the saved copy
addEventListener('hashchange', () => route()); // not `route` directly: the event would arrive as the `soft` flag and skip the redraw

(async () => {
  for (const k of Object.keys(store)) store[k] = (await api.get(k)) || {};
  for (const [p, s] of Object.entries(store.streams)) if (!(Date.now() - s.at < STREAMS_KEEP)) delete store.streams[p];
  lang = store.prefs.lang || 'ar';
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
