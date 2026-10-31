package com.medanime.app.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.withStarted
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import okio.Path.Companion.toOkioPath

// style.css :root
val Bg = Color(0xFF000000) // amoled black: its pixels off
val Red = Color(0xFFE50914)
val CardC = Color(0xFF181818)
val Muted = Color(0xFF9A9A9A)

sealed interface Screen {
    data object Home : Screen
    data object Anime : Screen
    data class Grid(val title: String, val base: String) : Screen
    data class Search(val q: String = "", val kind: String = "") : Screen // kind: one section only ("anime"...), else all
    data object MyList : Screen
    data class Settings(val part: String = "") : Screen // part: one of its pages ("": its menu)
    data class Title(val path: String) : Screen
    data class Play(val epPath: String) : Screen
    data object Manga : Screen
    data class MangaBrowse(val query: Map<String, String> = emptyMap()) : Screen
    data class MangaSeries(val id: String) : Screen
    data class MangaRead(val cid: String, val title: String = "", val chapter: String = "") : Screen
    data object Cinema : Screen
    data class CinemaBrowse(val cat: String) : Screen
    data class CinemaTitle(val slug: String, val show: Boolean = false) : Screen // show: an episode's card, opening its season
    data class CinemaPlay(val slug: String) : Screen
    data class Downloads(val show: String = "") : Screen // show: that one's episodes or chapters
    data class Offline(val epPath: String) : Screen // a downloaded episode
    data class Section(val name: String) : Screen // a home row's full listing
    data object Hidden : Screen // cards long-pressed away
    data object Schedule : Screen // the anime's air times this week
    data class Trailer(val url: String, val title: String) : Screen // a title's trailer, played in the app
}
// full-screen pages: no dock, no drawer swipe
private fun Screen.full() = this is Screen.Play || this is Screen.CinemaPlay || this is Screen.MangaRead || this is Screen.Offline || this is Screen.Trailer

// the sections (app.js NAV), in the drawer; up to 4 of them in the dock (settings)
val NAV = linkedMapOf<String, Pair<Screen, () -> ImageVector>>(
    "home" to (Screen.Home to { Ic.home }), "anime" to (Screen.Anime to { Ic.series }), "cinema" to (Screen.Cinema to { Ic.cinema }),
    "manga" to (Screen.Manga to { Ic.manga }), "schedule" to (Screen.Schedule to { Ic.schedule }), "myList" to (Screen.MyList to { Ic.myList }), "downloads" to (Screen.Downloads() to { Ic.download }),
    "search" to (Screen.Search() to { Ic.search }),
)
fun navLabel(id: String) = if (id == "search") (if (Store.lang == "ar") "بحث" else "Search") else t(id)

/** the app: one activity, its pages drawn natively (Compose) from what the sites' scrapers give */
class NativeActivity : ComponentActivity() {
    internal var sessionStack: List<Screen> = emptyList()
    internal var restoredStack: List<Screen> = emptyList()
    private var restoreFullscreen = false
    private var stopPipControls: (() -> Unit)? = null
    private val pipControlAction get() = "$packageName.PIP_PLAYBACK"
    private val pipReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context, intent: android.content.Intent) {
            if (intent.action == pipControlAction && playerUp && !PlaybackSession.suspended && intent.hasExtra("playing"))
                PlaybackSession.controls.play(intent.getBooleanExtra("playing", false))
        }
    }
    internal fun takeRestoredFullscreen() = restoreFullscreen.also { restoreFullscreen = false }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)) // light icons on the black app
        Net.activity = this
        Net.app = applicationContext
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) android.webkit.WebView.setWebContentsDebuggingEnabled(true) // chrome://inspect
        Store.init(this)
        gridCols.intValue = Store["prefs"].optInt("gridCols", 3).coerceIn(2, 5)
        Pages.dir = File(filesDir, "pages") // not cacheDir: Android empties that, and pages are kept 90 days for offline
        com.medanime.app.Downloads.init(this)
        // the Cast SDK starts with the app, so the TVs are already found when cast is tapped (no Google Play services: none)
        runCatching { com.google.android.gms.cast.framework.CastContext.getSharedInstance(this) }
        setImageLoader(this)
        // servers' answers (store.streams) are forgotten after 90 days (app.js STREAMS_KEEP)
        Store["streams"].let { st -> st.keys().asSequence().toList().forEach { k -> if (System.currentTimeMillis() - (st.optJSONObject(k)?.optLong("at") ?: 0) > 90 * 24 * 3600_000L) st.remove(k) } }
        Alerts.migrate() // auto-download: from the notifications' switches to the titles' own
        Alerts.schedule(this)
        opening.value = opened(intent)
        PlaybackSession.init(this)
        androidx.core.content.ContextCompat.registerReceiver(this, pipReceiver,
            android.content.IntentFilter(pipControlAction), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED)
        stopPipControls = PlaybackSession.controls.observe {
            if (android.os.Build.VERSION.SDK_INT >= 26) runCatching { setPictureInPictureParams(pipParams().build()) }
        }
        restoredStack = PlaybackSession.navigation()
        restoreFullscreen = restoredStack.isNotEmpty() && PlaybackSession.fullscreen
        inPip.value = false
        setContent { App() }
    }
    override fun onNewIntent(intent: android.content.Intent) { super.onNewIntent(intent); opening.value = opened(intent) } // a notification or the widget tapped
    private fun opened(i: android.content.Intent) = i.getStringExtra("open")?.let(Alerts::screen) ?: i.getStringExtra("resume")?.let(Widget::screen)
    // a player page up: leaving the app (home, another app) keeps its video playing in a small window (Android 8+)
    // android 12+: the window opens by itself as the app goes (a swipe home too, which entering it here came too late for)
    fun pip(on: Boolean) {
        if (android.os.Build.VERSION.SDK_INT >= 31) runCatching { setPictureInPictureParams(pipParams().setAutoEnterEnabled(on && autoPipEnabled(Store["prefs"])).build()) }
    }
    private fun pipParams(): android.app.PictureInPictureParams.Builder {
        val playing = PlaybackSession.controls.paused
        val label = t(if (playing) "play" else "pause")
        val intent = android.content.Intent(pipControlAction).setPackage(packageName).putExtra("playing", playing)
        val pending = android.app.PendingIntent.getBroadcast(this, if (playing) 1 else 2, intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
        val action = android.app.RemoteAction(android.graphics.drawable.Icon.createWithResource(this,
            if (playing) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause), label, label, pending)
        action.isEnabled = PlaybackSession.controls.available
        return android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational(16, 9)).setActions(listOf(action)).apply {
            if (android.os.Build.VERSION.SDK_INT >= 31) setAutoEnterEnabled(playerUp && autoPipEnabled(Store["prefs"]))
        }
    }
    override fun onDestroy() {
        stopPipControls?.invoke()
        unregisterReceiver(pipReceiver)
        super.onDestroy()
    }
    override fun onUserLeaveHint() { // android 8 to 11
        super.onUserLeaveHint()
        if (playerUp && autoPipEnabled(Store["prefs"]) && android.os.Build.VERSION.SDK_INT in 26..30 && packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE))
            runCatching { enterPictureInPictureMode(pipParams().build()) }
    }
    override fun onPictureInPictureModeChanged(on: Boolean, c: android.content.res.Configuration) {
        super.onPictureInPictureModeChanged(on, c)
        inPip.value = on
        // its window closed (✕, or dragged away): the activity is stopped by then. The video stops (its sound with it), but
        // the page stays: the app wasn't closed, so coming back finds the episode where it was (onStart brings the video back)
        if (!on && lifecycle.currentState == Lifecycle.State.CREATED && playerUp) {
            pipStopped.value = true
            PlaybackSession.suspendPlayback(true)
        }
    }
    override fun onPause() {
        if (playerUp) PlaybackSession.navigation(sessionStack)
        super.onPause()
    }
    override fun onStop() {
        // Closing PiP can finish the activity. Pause synchronously; Compose may already be stopped.
        if (playerUp && (android.os.Build.VERSION.SDK_INT < 26 || !isInPictureInPictureMode)) {
            pipStopped.value = true
            PlaybackSession.suspendPlayback(true)
        }
        super.onStop()
    }
    override fun onStart() {
        super.onStart()
        pipStopped.value = false
        PlaybackSession.suspendPlayback(false)
    }
}

/** Coil's loader, for the app and for the background check's notifications (Alerts), whichever starts first */
fun setImageLoader(c: android.content.Context) {
    // posters as the WebView fetched them: its user agent and Cloudflare cookies, and no Referer (witanime 403s hotlinks)
    val images = Net.client.newBuilder().addInterceptor {
        val req = it.request().newBuilder().header("User-Agent", Net.wvUa).build()
        var r = it.proceed(req)
        for (i in 0 until 2) { if (r.code != 429 && r.code != 503) break; r.close(); Thread.sleep(1000L shl i); r = it.proceed(req) } // a grid's burst, rate-limited: once more, later
        // a page sent in place of the image (a block, an error page, as 200) fails here: Coil keeps any 2xx for good and never asks again
        if (r.isSuccessful && r.body?.contentType()?.type == "text") { r.close(); throw java.io.IOException("not an image: ${req.url}") }
        r
    }.build()
    // kept for good, as ImageCache did: in the app's files (Android empties its cache folder), with no practical size cap
    SingletonImageLoader.setSafe { ImageLoader.Builder(it).components { add(OkHttpNetworkFetcherFactory(callFactory = { images })) }
        .diskCache { coil3.disk.DiskCache.Builder().directory(File(c.filesDir, "images-cache").toOkioPath()).maxSizeBytes(Long.MAX_VALUE / 4).build() }
        // a saved copy that won't open (one kept before the check above) goes, so the next look downloads it again
        .eventListener(object : coil3.EventListener() {
            override fun onError(request: coil3.request.ImageRequest, result: coil3.request.ErrorResult) {
                (request.diskCacheKey ?: request.data as? String)?.let { k -> SingletonImageLoader.get(c).diskCache?.remove(k) }
            }
        })
        .crossfade(true).build() }
}

val opening = mutableStateOf<Screen?>(null) // a notification's title or the widget's show, opened over the current page

class Nav(val go: (Screen) -> Unit, val replace: (Screen) -> Unit, val back: () -> Unit, val menu: () -> Unit)

@Composable
fun App() {
    val activity = LocalContext.current as NativeActivity
    val stack = rememberSaveable(saver = Saver<androidx.compose.runtime.snapshots.SnapshotStateList<Screen>, String>(
        save = { encodeScreens(it) }, restore = { runCatching { decodeScreens(it).toMutableStateList() }.getOrNull() }
    )) { activity.restoredStack.ifEmpty { listOf(Screen.Home) }.toMutableStateList() }
    SideEffect { activity.sessionStack = stack.toList() }
    val top = stack.last()
    LaunchedEffect(top) {
        if (top !is Screen.Play && top !is Screen.CinemaPlay && top !is Screen.Offline) PlaybackSession.navigation(null)
    }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    // a section opens over Home: back from it (search included) goes home first, then twice to leave
    val tab: (Screen) -> Unit = { stack.clear(); stack.add(Screen.Home); if (it != Screen.Home) stack.add(it); scope.launch { drawer.close() } }
    val nav = Nav({ stack.add(it) }, { stack[stack.lastIndex] = it }, { if (stack.size > 1) stack.removeAt(stack.lastIndex) }, { scope.launch { drawer.open() } })
    val saved = rememberSaveableStateHolder() // each page keeps its scroll when it's come back to
    var backAt by remember { mutableLongStateOf(0L) }
    val ctx = LocalContext.current
    BackHandler(stack.size == 1) { // the first page: back twice to leave the app
        if (System.currentTimeMillis() - backAt < 2000) (ctx as? android.app.Activity)?.finish()
        else { backAt = System.currentTimeMillis(); toast(t("backAgain")) }
    }
    BackHandler(stack.size > 1) { nav.back() }
    LaunchedEffect(opening.value) { opening.value?.let { stack.add(it); opening.value = null } }
    BackHandler(drawer.isOpen) { scope.launch { drawer.close() } }
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(owner) { // back from Android's "all files access" page
        val o = androidx.lifecycle.LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) Store.check() }
        owner.lifecycle.addObserver(o)
        onDispose { owner.lifecycle.removeObserver(o) }
    }
    Store.version.intValue // a language change redraws everything
    var update by remember { mutableStateOf<Updater.Release?>(null) }
    var askStorage by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        // Android takes the folder's permission away on uninstall: asked right away, once per install (one sheet at a time)
        if (!Store.granted() && !Store["prefs"].has("storageAsked")) askStorage = true
        else update = runCatching { Updater.check() }.getOrNull()
    }
    // the layout stays left to right in Arabic too (bars, rows, icons where they are in English; a phone set to Arabic
    // would mirror it otherwise): only the text runs right to left. Text's direction follows its own words (the default
    // in a left-to-right layout), so an Arabic paragraph reads and aligns from the right on its own
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        MaterialTheme(darkColorScheme(primary = Red, background = Bg, surface = Bg, surfaceContainer = CardC, onPrimary = Color.White, secondaryContainer = Red)) {
            ModalNavigationDrawer({ Drawer(top, tab, { scope.launch { drawer.close() } }) { feedback = true; scope.launch { drawer.close() } } }, drawerState = drawer, gesturesEnabled = !top.full() || drawer.isOpen) {
                Scaffold(containerColor = Bg, bottomBar = { if (!top.full()) Dock(top, tab) }) { pad ->
                    // the reader takes the whole screen, under the phone's bars, so its pages don't move as they hide; its own bars pad themselves
                    Box(Modifier.padding(if (top is Screen.MangaRead) PaddingValues() else pad).fillMaxSize()) {
                        saved.SaveableStateProvider(top.toString()) {
                            when (top) {
                                Screen.Home -> HomeScreen(nav)
                                Screen.Anime -> AnimeScreen(nav)
                                is Screen.Grid -> Column { PageTitle(top.title, nav); CardGrid(top.base, nav) }
                                is Screen.Search -> SearchScreen(top.q, nav, top.kind)
                                Screen.MyList -> MyListScreen(nav)
                                is Screen.Settings -> SettingsScreen(top.part, nav)
                                is Screen.Title -> TitleScreen(top.path, nav)
                                is Screen.Play -> PlayerScreen(top.epPath, nav)
                                Screen.Manga -> MangaHomeScreen(nav)
                                is Screen.MangaBrowse -> MangaBrowseScreen(top.query, nav)
                                is Screen.MangaSeries -> MangaSeriesScreen(top.id, nav)
                                is Screen.MangaRead -> MangaReaderScreen(top.cid, nav, top.title, top.chapter)
                                Screen.Cinema -> CinemaHomeScreen(nav)
                                is Screen.CinemaBrowse -> Column { PageTitle(Cinema.catName(top.cat), nav); PagedGrid(top.cat, { f -> flow { emit(Cinema.list(top.cat, 1, f)) } }, { Cinema.list(top.cat, it) }, nav) }
                                is Screen.CinemaTitle -> CinemaTitleScreen(top.slug, top.show, nav)
                                is Screen.CinemaPlay -> CinemaPlayScreen(top.slug, nav)
                                is Screen.Downloads -> DownloadsScreen(top.show, nav)
                                is Screen.Offline -> OfflineScreen(top.epPath, nav)
                                is Screen.Section -> SectionScreen(top.name, nav)
                                Screen.Hidden -> HiddenScreen(nav)
                                Screen.Schedule -> ScheduleScreen(nav)
                                is Screen.Trailer -> TrailerScreen(top.url, top.title, nav)
                            }
                        }
                    }
                }
            }
            cardMenu?.let { CardMenu(it) { cardMenu = null } }
            if (askStorage) StorageSheet { askStorage = false }
            update?.let { u -> UpdateSheet(u) { update = null } }
            if (feedback) FeedbackSheet { feedback = false }
        }
    }
    // composed last, so it goes first: Cloudflare's check over the app is closed by back (its requests fail, the next asks again)
    BackHandler(Net.checking.value) { Net.dropChecks() }
}

@Composable
private fun Dock(top: Screen, tab: (Screen) -> Unit) {
    NavigationBar(containerColor = Color(0xF0000000)) {
        val colors = NavigationBarItemDefaults.colors(selectedIconColor = Color.White, selectedTextColor = Color.White, indicatorColor = Red, unselectedIconColor = Muted, unselectedTextColor = Muted)
        Store.dock().forEach { id ->
            val (s, icon) = NAV.getValue(id)
            NavigationBarItem(section(top) == id, { tab(s) }, { Icon(icon(), null, Modifier.size(24.dp)) }, label = { Text(if (id == "schedule") t("scheduleShort") else navLabel(id), fontSize = 11.sp, maxLines = 1) }, colors = colors)
        }
    }
}

// the section a page belongs to (app.js markActive)
private fun section(s: Screen) = when (s) {
    Screen.Home -> "home"
    Screen.Anime, is Screen.Grid, is Screen.Title, is Screen.Play, is Screen.Section, is Screen.Trailer -> "anime" // a trailer: full screen, no dock to light
    Screen.Cinema, is Screen.CinemaBrowse, is Screen.CinemaTitle, is Screen.CinemaPlay -> "cinema"
    Screen.Manga, is Screen.MangaBrowse, is Screen.MangaSeries, is Screen.MangaRead -> "manga"
    Screen.Schedule -> "schedule"
    Screen.MyList -> "myList"
    is Screen.Downloads, is Screen.Offline -> "downloads"
    is Screen.Search -> "search"
    is Screen.Settings, Screen.Hidden -> "settings"
}

/** the side drawer: every section, settings, feedback, language (app.js renderNav) */
@Composable
private fun Drawer(top: Screen, tab: (Screen) -> Unit, close: () -> Unit, feedback: () -> Unit) {
    // Material 3's navigation drawer, as its spec lays it out: a header, pill rows inset 12dp, a divider between groups.
    // the scheme's own drawer colour is a purple-tinted grey: the app's card colour instead
    ModalDrawerSheet(drawerContainerColor = CardC) {
        Row(Modifier.fillMaxWidth().padding(start = 28.dp, end = 12.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Logo(Modifier.weight(1f))
            IconButton(close) { Icon(Ic.x, t("close"), Modifier.size(22.dp)) } // a plain way out: not everyone knows to swipe it away or tap beside it
        }
        val colors = NavigationDrawerItemDefaults.colors(selectedContainerColor = Color(0x40E50914), selectedIconColor = Red, selectedTextColor = Color.White,
            unselectedContainerColor = Color.Transparent, unselectedIconColor = Color(0xFFCCCCCC), unselectedTextColor = Color(0xFFCCCCCC))
        val item = @Composable { label: String, on: Boolean, icon: ImageVector, go: () -> Unit ->
            NavigationDrawerItem({ Text(label) }, on, go, Modifier.padding(NavigationDrawerItemDefaults.ItemPadding), { Icon(icon, null, Modifier.size(24.dp)) }, colors = colors)
        }
        // the rows scroll and the language stays pinned below them: on shorter phones they no longer fit with it
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            NAV.forEach { (id, v) -> item(navLabel(id), section(top) == id, v.second()) { tab(v.first) } }
            HorizontalDivider(Modifier.padding(horizontal = 28.dp, vertical = 8.dp), color = Color(0x22FFFFFF))
            item(navLabel("settings"), section(top) == "settings", Ic.settings) { tab(Screen.Settings()) }
            item(t("feedback"), false, Ic.info, feedback)
        }
        LangSwitch(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 16.dp))
    }
}

/** the app's mark (icons.js logo: its gradients and clip, drawn natively) and "edFlix", one word left to right in Arabic too */
@Composable
fun Logo(modifier: Modifier = Modifier, size: Dp = 26.dp) = CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
    Row(modifier, verticalAlignment = Alignment.Bottom) {
        androidx.compose.foundation.Canvas(Modifier.size(size * 340f / 385f, size)) {
            // the SVG's viewBox is 80 55 340 385
            fun p(x: Float, y: Float) = androidx.compose.ui.geometry.Offset((x - 80) * this.size.width / 340, (y - 55) * this.size.height / 385)
            fun poly(vararg pts: Pair<Float, Float>) = androidx.compose.ui.graphics.Path().apply { pts.forEachIndexed { i, (x, y) -> p(x, y).let { if (i == 0) moveTo(it.x, it.y) else lineTo(it.x, it.y) } }; close() }
            val clip = androidx.compose.ui.graphics.Path().apply { p(60f, 70f).let { moveTo(it.x, it.y) }; p(440f, 70f).let { lineTo(it.x, it.y) }; p(440f, 430f).let { lineTo(it.x, it.y) }
                val c = p(250f, 405f); val e = p(60f, 430f); quadraticTo(c.x, c.y, e.x, e.y); close() }
            val pillar = Brush.verticalGradient(0f to Color(0xFFB1060F), .5f to Color(0xFF83050C), 1f to Color(0xFF5A0207), startY = p(0f, 60f).y, endY = p(0f, 440f).y)
            clipPath(clip) {
                drawRect(pillar, p(90f, 60f), androidx.compose.ui.geometry.Size(p(160f, 0f).x - p(90f, 0f).x, p(0f, 440f).y - p(0f, 60f).y))
                drawRect(pillar, p(340f, 60f), androidx.compose.ui.geometry.Size(p(410f, 0f).x - p(340f, 0f).x, p(0f, 440f).y - p(0f, 60f).y))
                drawPath(poly(340f to 60f, 410f to 60f, 285f to 360f, 215f to 360f), Brush.linearGradient(0f to Red, .6f to Color(0xFFC80711), 1f to Color(0xFF83050C), start = p(410f, 60f), end = p(215f, 360f)))
                drawPath(poly(90f to 60f, 160f to 60f, 285f to 360f, 215f to 360f), Brush.linearGradient(0f to Red, .7f to Red, 1f to Color(0xFFB1060F), start = p(90f, 60f), end = p(285f, 360f)))
            }
        }
        Text("edFlix", Modifier.offset(x = (-1).dp), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * 1.05f).sp, lineHeight = (size.value * 1.05f).sp, letterSpacing = (-0.5).sp)
    }
}

@Composable
/** the language: Material's segmented buttons, one of two side by side (the drawer and settings) */
fun LangSwitch(modifier: Modifier = Modifier) = SingleChoiceSegmentedButtonRow(modifier) {
    val langs = listOf("ar" to "العربية", "en" to "English")
    langs.forEachIndexed { i, (l, label) ->
        // no checkmark (it squeezed the label in the drawer: the red fill says which), and a faint border, not the theme's purple-grey outline
        SegmentedButton(Store.lang == l, { Store["prefs"].put("lang", l); Store.persist("prefs") }, SegmentedButtonDefaults.itemShape(i, langs.size),
            colors = SegmentedButtonDefaults.colors(activeContainerColor = Red, activeContentColor = Color.White, activeBorderColor = Red,
                inactiveContainerColor = Color.Transparent, inactiveContentColor = Color(0xFFCCCCCC), inactiveBorderColor = Color(0x33FFFFFF)),
            icon = {}) { Text(label, maxLines = 1) }
    }
}

/**
 * a section's top bar: the logo, search, and ☰ for the drawer (app.js phones' top bar). solid: over a section's slider
 * it's see-through (a shade keeps its icons readable), going black once the page scrolls under it
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopBar(nav: Nav, modifier: Modifier = Modifier, solid: Boolean = true) {
    val bg by androidx.compose.animation.animateColorAsState(if (solid) Bg else Color.Transparent, label = "bar")
    TopAppBar({ Logo(size = 22.dp) }, modifier.background(Brush.verticalGradient(listOf(Color(0xCC000000), Color.Transparent))),
        navigationIcon = { IconButton(nav.menu) { Icon(Ic.menu, t("more"), Modifier.size(24.dp)) } }, // ☰ at the start, as Android's own apps have it
        actions = { IconButton({ nav.go(Screen.Search()) }) { Icon(Ic.search, navLabel("search"), Modifier.size(24.dp)) } }, windowInsets = WindowInsets(0), colors = TopAppBarDefaults.topAppBarColors(containerColor = bg)) // the scaffold already pads the status bar
}

/**
 * a page's title: Material's top app bar, kept above the page (the page scrolls under it, never it). back: an inner page's;
 * a section's own (my list, downloads) has ☰ for the drawer in its place
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PageTitle(title: String, nav: Nav, back: Boolean = true, actions: @Composable RowScope.() -> Unit = {}) = TopAppBar({ Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
    navigationIcon = { if (back) IconButton(nav.back) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) } else IconButton(nav.menu) { Icon(Ic.menu, t("more"), Modifier.size(24.dp)) } },
    actions = actions,
    windowInsets = WindowInsets(0), colors = TopAppBarDefaults.topAppBarColors(containerColor = Bg))

/** a page's title with a search button: tapped, the bar becomes the search box; back (or its arrow) closes it, clearing it */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchTitle(title: String, nav: Nav, q: String, set: (String) -> Unit, hint: String, back: Boolean = true, actions: @Composable RowScope.() -> Unit = {}) {
    var open by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(q.isNotEmpty()) } // a search kept (schedule): open on coming back
    if (!open) return PageTitle(title, nav, back) { IconButton({ open = true }) { Icon(Ic.search, navLabel("search"), Modifier.size(22.dp)) }; actions() }
    val close = { open = false; set("") }
    BackHandler(onBack = close)
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    TopAppBar({
        TextField(q, set, Modifier.fillMaxWidth().focusRequester(focus), placeholder = { Text(hint, maxLines = 1) }, singleLine = true,
            colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent, focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
    }, navigationIcon = { IconButton(close) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) } },
        actions = { if (q.isNotEmpty()) IconButton({ set("") }) { Icon(Ic.x, t("clear"), Modifier.size(20.dp)) } },
        windowInsets = WindowInsets(0), colors = TopAppBarDefaults.topAppBarColors(containerColor = Bg))
}

// ---------- loading: a page's data as its flow gives it (saved copy, then the site's if it changed) ----------
class Loaded<T>(val data: T?, val error: Throwable?, val busy: Boolean)

// how often a page left open is asked again, quietly (quiet = true): the sites post new episodes, films and chapters several
// times an hour, and asking sooner than this mostly finds nothing new (and spends data and battery)
const val QUIET_EVERY = 5 * 60_000L

// the last answer of each page: a screen left (another section, back) drops its state, and reading + parsing the saved copy
// again took long enough to flash the spinner on every switch. it's drawn from here at once, then checked as before
private val shown = android.util.LruCache<List<Any?>, Any>(40)

@Composable
fun <T> loaded(vararg keys: Any?, quiet: Boolean = false, src: (force: Boolean) -> Flow<T>): Pair<Loaded<T>, () -> Unit> {
    var nonce by remember(*keys) { mutableIntStateOf(0) }
    val life = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    val id = keys.toList() + src.javaClass // the call site too: two screens may share a key (a slug, an id) with different data
    @Suppress("UNCHECKED_CAST")
    val st = produceState(Loaded(shown[id] as T?, null, false), *keys, nonce) {
        val pulled = nonce > 0 // only a pull shows the refresh spinner: coming back to a page re-reads it quietly behind what's shown
        src(pulled)
            .flowOn(Dispatchers.Default) // parsing a page (Jsoup, ~0.5MB of HTML) on the main thread stalls scrolling while rows load
            .onStart { value = Loaded(value.data, null, pulled) }
            .onCompletion { value = Loaded(value.data, value.error, false) }
            .catch { android.util.Log.w("medflix", "load", it); if (value.data == null) value = Loaded(null, it, false) else toast(noNames(it.message)) } // a refresh that failed keeps the page
            .collect { if (it != value.data) value = Loaded(it, null, pulled); it?.let { d -> shown.put(id, d) } } // the same page again: no redraw
        // while it's shown: the sites' own answer now and then, with no spinner, and nothing said if it fails (offline).
        // the app in the background waits, and is asked at once when it's back if the time has passed meanwhile
        while (quiet && value.data != null) {
            delay(QUIET_EVERY)
            life.withStarted {}
            try { src(true).flowOn(Dispatchers.Default).collect { if (it != value.data) { value = Loaded(it, null, false); it?.let { d -> shown.put(id, d) } } } }
            catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { android.util.Log.w("medflix", "quiet", e) }
        }
    }
    return st.value to { nonce++ }
}
/** a page built from several requests: one answer (saved copies first; pulled down, the sites' own) */
@Composable
fun <T> loadedOnce(vararg keys: Any?, quiet: Boolean = false, block: suspend (force: Boolean) -> T) = loaded(*keys, block.javaClass, quiet = quiet) { f -> flow { emit(block(f)) } }

@Composable
fun <T> Body(l: Loaded<T>, retry: () -> Unit, content: @Composable (T) -> Unit) = when {
    l.data != null -> content(l.data)
    l.error != null -> Empty(t("unreachable"), noNames(l.error.message)) { Button(retry, colors = ButtonDefaults.buttonColors(Red)) { Text(t("retry")) } }
    else -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = Red) }
}

@Composable
fun Empty(title: String, hint: String, action: @Composable () -> Unit = {}) =
    Column(Modifier.fillMaxSize().padding(32.dp), Arrangement.Center, Alignment.CenterHorizontally) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.height(6.dp))
        Text(hint, color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(16.dp))
        action()
    }

// error text without the sources' names or addresses (app.js noNames)
fun noNames(m: String?) = (m ?: "").replace(Regex("https?://\\S+|\\b[\\w.-]*(wit ?anime|anime ?rco|egy ?dead|my ?seed|arab ?seed|appswat|mesh ?manga|manga ?swat|olympus ?staff|team-?x|anime ?schedule|mega ?max)[\\w.-]*", RegexOption.IGNORE_CASE),
    t("theSite"))

fun toast(msg: String) { if (Net.hasWindow()) Toast.makeText(Net.activity, msg, Toast.LENGTH_SHORT).show() } // none from a background check (Alerts)

private fun listType(c: Card) = if (c.type == "episode") (if (c.showPath.startsWith("/movie")) "movie" else "anime") else c.type
fun listToggle(c: Card) {
    val on = Store.toggleList(c.showPath, c.title, c.poster, listType(c))
    toast(if (on) t("added", c.title) else t("removed"))
}

// ---------- long-press a card: hide it from every page, or (un)list it (app.js cardMenu) ----------
var cardMenu by mutableStateOf<Card?>(null)
private var cardMenuPicks: Picks? = null // the grid the card was pressed in: its menu can start picking there
fun isHidden(c: Card) = Store["hidden"].has(c.showPath)
fun setHidden(c: Card, on: Boolean, quiet: Boolean = false) {
    if (on) Store["hidden"].put(c.showPath, JSONObject().put("path", c.showPath).put("title", c.title).put("poster", c.poster).put("type", listType(c)).put("at", System.currentTimeMillis()))
    else Store["hidden"].remove(c.showPath)
    Store.persist("hidden")
    if (!quiet) toast(if (on) t("hiddenN", c.title) else t("shown"))
}
private fun hideLabel(c: Card) = t(when { c.type == "manga" -> "hideManga"; c.type != "cinema" -> "hideAnime"; Regex("^/cinema/(serie|season|episode)/").containsMatchIn(c.showPath) -> "hideSeries"; else -> "hideMovie" })

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CardMenu(c: Card, done: () -> Unit) = ModalBottomSheet(done, containerColor = CardC) {
    Row(Modifier.padding(horizontal = 24.dp).padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        AsyncImage(c.poster, null, Modifier.width(48.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
        Text(c.title, Modifier.padding(start = 14.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
    val hidden = isHidden(c); val listed = Store.inList(c.showPath)
    val opt = @Composable { icon: ImageVector, label: String, go: () -> Unit ->
        Row(Modifier.fillMaxWidth().clickable { go(); done() }.padding(horizontal = 24.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(22.dp)); Text(label, Modifier.padding(start = 16.dp), fontSize = 16.sp)
        }
    }
    if (!c.showPath.startsWith("/airing/")) opt(if (listed) Ic.check else Ic.plus, t(if (listed) "listRemove" else "listAdd")) { listToggle(c) } // a schedule card isn't a show page yet
    if (Alerts.can(c.showPath)) Alerts.on(c.showPath).let { on -> opt(if (on) Ic.bellFill else Ic.bell, t(if (on) "notifyStop" else "notify")) { Alerts.toggleCard(c) } }
    opt(if (hidden) Ic.eye else Ic.eyeSlash, if (hidden) t("unhide") else hideLabel(c)) { setHidden(c, !hidden) }
    cardMenuPicks?.let { p -> opt(Ic.check, t("select")) { p.start(c.showPath) } }
    Spacer(Modifier.navigationBarsPadding().height(16.dp))
}

/** where a card leads (app.js card's href) */
fun screenFor(c: Card): Screen = c.open?.let { open ->
    if (open is Screen.MangaRead && open.title.isBlank()) open.copy(title = c.title) else open
} ?: when {
    c.type == "episode" -> Screen.Play(c.path)
    c.showPath.startsWith("/manga/series/") -> Screen.MangaSeries(c.showPath.substringAfterLast('/'))
    c.showPath.startsWith("/cinema/") -> Screen.CinemaTitle(c.showPath.removePrefix("/cinema/"))
    // a schedule card: its title searched (witanime may not list it yet, or under another spelling)
    c.showPath.startsWith("/airing/") -> Screen.Search(c.title, "anime")
    else -> Screen.Title(c.showPath)
}

// ---------- builders (app.js card / row / grid / heroPage) ----------
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PosterCard(c: Card, nav: Nav, width: Dp? = 112.dp) {
    val p = LocalPicks.current
    val on = p?.has(c.showPath) == true
    Column((if (width != null) Modifier.width(width) else Modifier.fillMaxWidth())
        .combinedClickable(onLongClick = { if (p?.on == true) p.toggle(c.showPath) else { cardMenuPicks = p; cardMenu = c } }) { if (p?.on == true) p.toggle(c.showPath) else nav.go(screenFor(c)) }) {
        Box(Modifier.fillMaxWidth().aspectRatio(2 / 3f).picked(on).clip(RoundedCornerShape(4.dp)).background(CardC)) {
            AsyncImage(c.poster, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            if (c.badge.isNotEmpty()) Text(c.badge.replace(Regex("\\bEP\\b|الحلقة"), t("ep")), Modifier.padding(4.dp).background(Red, RoundedCornerShape(3.dp)).padding(horizontal = 5.dp, vertical = 1.dp),
                fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            PickMark(on)
        }
        Text(c.title, Modifier.padding(top = 4.dp), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (c.rating.isNotEmpty() || c.year.isNotEmpty()) Text(listOf(c.rating.let { if (it.isEmpty()) "" else "★ $it" }, c.year).filter { it.isNotEmpty() }.joinToString("  "), color = Muted, fontSize = 11.sp)
    }
}

@Composable
fun CardRowView(title: String, items0: List<Card>?, nav: Nav, more: Screen? = null) {
    Store.version.intValue
    val items = items0?.filter { !isHidden(it) } // hidden cards: off every page (the hidden page lists them)
    if (items.isNullOrEmpty()) return
    Row(Modifier.fillMaxWidth().then(if (more != null) Modifier.clickable { nav.go(more) } else Modifier).padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
        if (more != null) Icon(Ic.next, null, Modifier.padding(start = 4.dp).size(16.dp), tint = Muted)
    }
    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(items, { it.path }) { PosterCard(it, nav) } }
}

/** section chips under the slider */
@Composable
fun Chips(links: List<Pair<String, Screen>>, nav: Nav) = Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    links.forEach { (label, s) -> AssistChip({ nav.go(s) }, { Text(label) }, shape = RoundedCornerShape(99.dp)) }
}

/** a listing, page after page as its end nears the screen (app.js lazyGrid); pulled down, its first page again from the site */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PagedGrid(key: Any, first: (force: Boolean) -> Flow<Listing>, page: suspend (Int) -> Listing, nav: Nav, header: @Composable () -> Unit = {}) {
    val (l, reload) = loaded(key, quiet = true) { first(it) }
    val more = remember(key) { mutableStateListOf<Card>() }
    var next by remember(key) { mutableIntStateOf(2) }
    var pages by remember(key) { mutableIntStateOf(0) } // the last page's count: the latest episodes' pager only knows one past itself
    val refresh = { more.clear(); next = 2; pages = 0; reload() } // the pages after it are asked again as it scrolls
    Column {
        header()
        androidx.compose.material3.pulltorefresh.PullToRefreshBox(l.busy && l.data != null, refresh) { Body(l, refresh) { d ->
            val seen = HashSet<String>()
            Store.version.intValue
            val all = (d.items + more).filter { seen.add(it.path) && !isHidden(it) }
            if (all.isEmpty()) return@Body Empty(t("nothing"), t("tryElse"))
            val grid = rememberLazyGridState()
            val nearEnd by remember { derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= grid.layoutInfo.totalItemsCount - 12 } }
            LaunchedEffect(nearEnd, next, d.pages) {
                if (nearEnd && next <= maxOf(d.pages, pages)) runCatching { withContext(Dispatchers.Default) { page(next) } }.onSuccess { more += it.items; pages = it.pages; next++ }.onFailure { delay(5000) }
            }
            CardsGrid(all, nav, grid)
        } }
    }
}
// cards per row in the poster grids (my list, listings), 2 to 5: pinched out for bigger cards, in for smaller; remembered
val gridCols = mutableIntStateOf(0)
private fun setCols(n: Int) {
    val c = n.coerceIn(2, 5)
    if (c == gridCols.intValue) return
    gridCols.intValue = c
    Store["prefs"].put("gridCols", c); Store.persist("prefs")
}
/** cards per row, picked from a menu (the same setting as pinching the grid) */
@Composable
fun GridColsMenu() {
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton({ open = true }) {
            Icon(Ic.series, null, Modifier.size(16.dp), tint = Muted); Spacer(Modifier.width(6.dp))
            Text("${gridCols.intValue}", color = Color.White, fontSize = 14.sp); Icon(Ic.caretDown, null, Modifier.padding(start = 4.dp).size(12.dp), tint = Muted)
        }
        DropdownMenu(open, { open = false }, containerColor = CardC) {
            (2..5).forEach { n ->
                DropdownMenuItem({ Text(if (Store.lang == "ar") "$n في الصف" else "$n per row") }, { open = false; setCols(n) },
                    trailingIcon = { if (n == gridCols.intValue) Icon(Ic.check, null, Modifier.size(16.dp), tint = Red) })
            }
        }
    }
}

/** two fingers on a grid step its columns (and are taken before the grid sees them, so it doesn't scroll); one finger scrolls */
fun Modifier.pinchColumns() = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        var zoom = 1f
        do {
            val e = awaitPointerEvent(PointerEventPass.Initial)
            if (e.changes.size >= 2) {
                zoom *= e.calculateZoom()
                if (zoom > 1.25f) { setCols(gridCols.intValue - 1); zoom = 1f } // apart: fewer, bigger cards
                else if (zoom < .8f) { setCols(gridCols.intValue + 1); zoom = 1f }
                e.changes.forEach { it.consume() }
            }
        } while (e.changes.any { it.pressed })
    }
}

/** a poster grid: pinch or the menu for its columns; long-press a card, then Select, to pick several (cardActs) */
@Composable
fun CardsGrid(all: List<Card>, nav: Nav, grid: androidx.compose.foundation.lazy.grid.LazyGridState = rememberLazyGridState(), header: @Composable RowScope.() -> Unit = {}) {
    val picks = remember { Picks() }
    val byId = all.associateBy { it.showPath }
    if (picks.on) SelectBar(picks, { all.map { it.showPath } }, { ids -> cardActs(ids.mapNotNull(byId::get)) }, { v, ids -> cardRun(v, ids.mapNotNull(byId::get)) })
    else Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { header(); Spacer(Modifier.weight(1f)); GridColsMenu() }
    CompositionLocalProvider(LocalPicks provides picks) {
        LazyVerticalGrid(GridCells.Fixed(gridCols.intValue), Modifier.fillMaxSize().pinchColumns(), grid, PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(all, { it.path }) { Box(Modifier.animateItem()) { PosterCard(it, nav, null) } }
        }
    }
}

@Composable
fun CardGrid(base: String, nav: Nav, header: @Composable () -> Unit = {}) =
    PagedGrid(base, { Witanime.list(base, 1, it) }, { Witanime.list(base, it).first() }, nav, header)

/** a cover slide: info opens the title, play starts it */
class Slide(val banner: String, val title: String, val desc: String, val info: Screen, val play: Screen? = null)

/** the cover slider: Ken Burns slides, one every 8s, swiped the way pages turn */
@Composable
fun HeroPager(hero: List<Slide>, nav: Nav) {
    if (hero.isEmpty()) return Spacer(Modifier.height(64.dp))
    val pager = rememberPagerState { hero.size }
    LaunchedEffect(pager.settledPage, hero.size) { delay(8000); pager.animateScrollToPage((pager.settledPage + 1) % hero.size) }
    val zoom by rememberInfiniteTransition().animateFloat(1f, 1.12f, infiniteRepeatable(tween(16000), RepeatMode.Reverse))
    Box(Modifier.fillMaxWidth().height(480.dp).clipToBounds()) { // the zoomed slide stays inside
        HorizontalPager(pager) { i ->
            Box(Modifier.fillMaxSize()) {
                AsyncImage(hero[i].banner, null, Modifier.fillMaxSize().graphicsLayer { scaleX = zoom; scaleY = zoom }, contentScale = ContentScale.Crop)
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, .45f to Color(0x33000000), 1f to Bg)))
            }
        }
        val h = hero[pager.currentPage.coerceAtMost(hero.size - 1)]
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Text(h.title, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, lineHeight = 30.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(h.desc, Modifier.fillMaxWidth().padding(vertical = 8.dp), color = Color(0xFFDDDDDD), fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis,
                style = LocalTextStyle.current.copy(textDirection = androidx.compose.ui.text.style.TextDirection.Content), textAlign = androidx.compose.ui.text.style.TextAlign.Start)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                h.play?.let { p ->
                    Button({ nav.go(p) }, colors = ButtonDefaults.buttonColors(Color.White, Color.Black), shape = RoundedCornerShape(4.dp)) {
                        Icon(Ic.play, null, Modifier.size(18.dp), tint = Color.Black); Spacer(Modifier.width(6.dp)); Text(t("play"), fontWeight = FontWeight.Bold)
                    }
                }
                Button({ nav.go(h.info) }, colors = ButtonDefaults.buttonColors(Color(0x996D6D6E), Color.White), shape = RoundedCornerShape(4.dp)) {
                    Icon(Ic.info, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(t("moreInfo"), fontWeight = FontWeight.Bold)
                }
            }
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(hero.size) { Box(Modifier.size(if (it == pager.currentPage) 18.dp else 6.dp, 4.dp).clip(CircleShape).background(if (it == pager.currentPage) Red else Color(0x66FFFFFF))) }
            }
        }
    }
}

/** a section's front page: the top bar over its slider, then its rows; pulled down, everything again from the sites */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> SectionPage(l: Loaded<T>, refresh: () -> Unit, nav: Nav, hero: (T) -> List<Slide>, rows: LazyListScope.(T) -> Unit) {
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { d ->
            Store.version.intValue
            Box {
                val list = androidx.compose.foundation.lazy.rememberLazyListState()
                val scrolled by remember { derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 0 } }
                androidx.compose.foundation.lazy.LazyColumn(Modifier.fillMaxSize(), list, contentPadding = PaddingValues(bottom = 24.dp)) {
                    item { HeroPager(hero(d), nav) }
                    rows(d)
                }
                TopBar(nav, solid = scrolled)
            }
        }
    }
}

// ---------- the user's lists ----------
private fun JSONObject.values() = keys().asSequence().mapNotNull { optJSONObject(it) }.toList()
/** what was being watched or read, latest first (app.js continued) */
fun continued(kinds: Set<String>): List<Card> {
    val watch = Store["history"].values().map { h ->
        if (h.has("slug")) "cinema" to Card(h.optString("show"), "cinema", h.optString("title"), h.optString("poster"), "", "",
            if (h.has("ep")) "${t("ep")} ${h.optString("ep")}" else "", null, h.optString("show"), open = Screen.CinemaPlay(h.optString("slug"))) to h.optLong("at")
        else "anime" to Card(h.optString("epPath"), "episode", h.optString("title"), h.optString("poster"), "", "", "${t("ep")} ${h.optString("ep")}", h.optString("ep"), h.optString("show")) to h.optLong("at")
    }
    val read = Store["manga"].values().map { r ->
        "manga" to Card("/manga/series/${r.optString("id")}", "manga", r.optString("title"), r.optString("poster"), "", "", "${t("chShort")} ${Manga.chNum(r.opt("n"))}", null,
            "/manga/series/${r.optString("id")}", open = Screen.MangaRead(r.optString("chapterId"), r.optString("title"), Manga.chNum(r.opt("n")))) to r.optLong("at")
    }
    return (watch + read).filter { it.first.first in kinds }.sortedByDescending { it.second }.map { it.first.second }
}
fun listed() = Store["list"].values().sortedByDescending { it.optLong("at") }.map {
    Card(it.optString("path"), it.optString("type"), it.optString("title"), it.optString("poster"), "", "", "", null, it.optString("path"))
}

@Composable
fun openUrl(): (String) -> Unit {
    val ctx = LocalContext.current
    return { runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(it))) } }
}
