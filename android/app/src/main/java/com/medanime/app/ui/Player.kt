package com.medanime.app.ui

import android.net.Uri
import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.graphics.Color as AColor
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import org.json.JSONObject

private fun showOf(epPath: String) = epPath.split('/').let { if (it[2] == "movie") "/movie/${it[3]}" else "/anime/${it[2]}" }

@Composable
fun PlayerScreen(epPath: String, nav: Nav) {
    if (com.medanime.app.Downloads.done(epPath)) return LaunchedEffect(epPath) { nav.replace(Screen.Offline(epPath)) } // downloaded: no need to stream
    val show = showOf(epPath)
    val d by produceState<Details?>(null, show) { Witanime.details(show).catch {}.collect { value = it } }
    val idx = d?.episodes?.indexOfFirst { it.path == epPath } ?: -1
    val ep = d?.episodes?.getOrNull(idx)?.ep ?: epPath.substringAfterLast('/')
    val prev = d?.episodes?.getOrNull(idx - 1)
    val next = d?.episodes?.getOrNull(idx + 1).takeIf { idx >= 0 }
    LaunchedEffect(epPath, d != null) { if (d != null) Store.watched(show, epPath, ep, d!!.title, d!!.poster) }

    var servers by remember(epPath) { mutableStateOf<List<Server>?>(null) }
    var why by remember(epPath) { mutableStateOf("") } // what refused the servers' list
    var cur by remember(epPath) { mutableStateOf<Server?>(null) }
    var url by remember(epPath) { mutableStateOf<String?>(null) }
    var dead by remember(epPath) { mutableStateOf(false) }
    var extra by remember(epPath) { mutableStateOf<List<Server>>(emptyList()) } // ristoanime's, after witanime's
    fun all() = (servers ?: emptyList()) + extra
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<Job?>(null) }
    // the chosen server, falling through to the next ones until one gives its player (app.js tryFrom)
    fun tryFrom(i: Int) {
        job?.cancel()
        job = scope.launch {
            val l = all().ifEmpty { return@launch }
            dead = false
            for (n in l.indices) {
                val s = l[(i + n) % l.size]
                cur = s; url = null
                try {
                    url = s.url ?: Witanime.stream(s.token).also { u -> // played: its host link stays put (witanime's tokens die with the session)
                        val st = Store["streams"]
                        val e = st.optJSONObject(epPath) ?: JSONObject().put("list", JSONObject())
                        e.getJSONObject("list").put("${s.label}|${s.quality}", JSONObject().put("url", u).put("referrer", ""))
                        st.put(epPath, e.put("at", System.currentTimeMillis())); Store.persist("streams")
                    }
                    PlaybackSession.server(epPath, s.label, s.quality)
                    Store["prefs"].put("server", s.label); Store.persist("prefs")
                    return@launch
                } catch (e: CancellationException) { throw e } catch (e: Exception) { android.util.Log.w("medflix", "server ${s.label}", e) }
            }
            cur = null; dead = true
        }
    }
    LaunchedEffect(epPath) {
        // servers played before (kept 90 days): they play straight away, and witanime's fresh list is merged in behind them
        val known = Store["streams"].optJSONObject(epPath)?.optJSONObject("list")?.let { l ->
            l.keys().asSequence().mapNotNull { k -> l.optJSONObject(k)?.optString("url")?.takeIf { it.isNotEmpty() }?.let { Server(k.substringBefore('|'), k.substringAfter('|', ""), "", it) } }.toList()
        } ?: emptyList()
        val first = { l: List<Server> ->
            l.indexOfFirst { "${it.label}|${it.quality}" == PlaybackSession.server(epPath) }.takeIf { it >= 0 }
                ?: l.indexOfFirst { it.label == Store["prefs"].optString("server") }.coerceAtLeast(0)
        }
        if (known.isNotEmpty()) { servers = known; tryFrom(first(known)) }
        try {
            val l = Witanime.sources(epPath)
            val have = known.map { it.label.lowercase().substringBefore(' ') }.toSet()
            servers = known + l.filter { it.label.lowercase().substringBefore(' ') !in have } // a host already there isn't listed twice
            if (known.isEmpty() && all().isNotEmpty()) tryFrom(first(l))
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            android.util.Log.w("medflix", "sources", e)
            if (known.isEmpty()) { why = e.message ?: e.toString(); servers = emptyList(); if (extra.isNotEmpty()) tryFrom(0) }
        }
    }
    // the same episode on ristoanime, once its title is known: backups, tried when witanime's are done and none played
    LaunchedEffect(epPath, d != null) {
        val dd = d ?: return@LaunchedEffect
        if (epPath.startsWith("/watch/movie/")) return@LaunchedEffect
        try { extra = Witanime.ristoanime(dd.title, dd.alt, ep) } catch (e: CancellationException) { throw e } catch (e: Exception) { android.util.Log.w("medflix", "ristoanime", e) }
        if (cur == null && extra.isNotEmpty()) servers?.let { tryFrom(it.size) }
    }

    val open = openUrl()
    PlayerChrome(d?.title ?: "", if (ep.firstOrNull()?.isDigit() == true) "${t("episode")} $ep" else ep, nav,
        all().takeIf { servers != null || extra.isNotEmpty() }?.map { it.label to it.quality }, all().indexOf(cur), url == null && cur != null, { tryFrom(it) },
        prev?.let { { nav.replace(Screen.Play(it.path)) } }, next?.let { { nav.replace(Screen.Play(it.path)) } }, { nav.go(Screen.Title(show)) }, { DownloadMenu(epPath, show, ep, d, nav) }, { castTo("${d?.title ?: ""} · ${t("episode")} $ep", null, url) }) {
        val u = url
        when {
            u != null -> HostPlayer(u, epPath)
            dead -> Empty(t("noneWorked"), t("noneWorkedHint")) { OutlinedButton({ open(SITE + epPath) }) { Text(t("openBrowser"), color = Color.White) } }
            servers?.isEmpty() == true && extra.isEmpty() -> if ("rate-limited" in why) Empty(t("rateLimited"), t("rateLimitedHint"))
                else Empty(t("noServers"), noNames(why)) { OutlinedButton({ open(SITE + epPath) }) { Text(t("openBrowser"), color = Color.White) } }
            else -> CircularProgressIndicator(color = Red)
        }
    }
}

/** casts what the player is playing (page: its address, for MEGA's), or a downloaded file, to a TV (Cast.java) */
fun castTo(title: String, file: String?, page: String?) {
    com.medanime.app.Cast.start(Net.activity, title, file, 0.0, page, object : com.medanime.app.Cast.Done {
        override fun ok(screen: Boolean) { if (!screen) toast(t("casting")) }
        override fun fail(why: String) { when (why) { "no video" -> toast(t("castPlayFirst")); "no wifi" -> toast(t("castWifi")); "cancelled" -> {}; else -> toast(t("castFailed")) } }
    })
}

// picture-in-picture (NativeActivity): offered while a player page is up; in its window, only the video. Its window closed
// (✕, or dragged away): pause the retained video. Checkpoints restore it if Android finishes the activity.
val inPip = mutableStateOf(false)
val pipStopped = mutableStateOf(false)
var playerUp = false

/**
 * a player page: back and the title, then a bar with the server menu, download, cast, fullscreen and previous / next; the
 * video below. Fullscreen (ours: some hosts' own only fill their box) hides the rest, landscape; back leaves it.
 * servers: null while they're looked up
 */
@Composable
fun PlayerChrome(title: String, sub: String, nav: Nav, servers: List<Pair<String, String>>?, cur: Int, busy: Boolean, pick: (Int) -> Unit,
                 prev: (() -> Unit)?, next: (() -> Unit)?, onTitle: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {},
                 cast: (() -> Unit)? = null, stage: @Composable BoxScope.() -> Unit) {
    val act = Net.activity
    var full by rememberSaveable { mutableStateOf((act as? NativeActivity)?.takeRestoredFullscreen() ?: false) }
    SideEffect { PlaybackSession.fullscreen = full }
    val bars = remember { WindowCompat.getInsetsController(act.window, act.window.decorView) }
    val on = full // the value this effect ran for: its cleanup reading `full` itself saw the new one (false) and skipped
    DisposableEffect(on) {
        if (on) {
            bars.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            bars.hide(WindowInsetsCompat.Type.systemBars())
            act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
        // leaving it: back to the normal player, upright. Just freeing the rotation left a phone still held sideways in
        // landscape; it stays upright until the player page closes
        onDispose { if (on) { bars.show(WindowInsetsCompat.Type.systemBars()); act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT } }
    }
    DisposableEffect(Unit) { playerUp = true; (act as? NativeActivity)?.pip(true); onDispose { playerUp = false; (act as? NativeActivity)?.pip(false); act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED } } // the page closed: rotation as the phone likes
    val bare = full || inPip.value
    BackHandler(full) { full = false }
    Column(Modifier.fillMaxSize().background(Color.Black)) {
        // (conditional rows above the video: it keeps its place in the tree, so its WebView and video carry on)
        if (!bare) Row(Modifier.fillMaxWidth().padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(nav.back) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) }
            Column(Modifier.weight(1f).then(if (onTitle != null) Modifier.clickable(onClick = onTitle) else Modifier)) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (sub.isNotEmpty()) Text(sub, color = Muted, fontSize = 12.sp, maxLines = 1)
            }
        }
        if (!bare) Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (servers != null) ServerMenu(servers, cur, busy, pick)
            Spacer(Modifier.weight(1f))
            actions()
            if (cast != null) IconButton(cast) { Icon(Ic.cast, t("cast"), Modifier.size(20.dp)) }
            IconButton({ full = true }) { Icon(Ic.expand, t("fullscreen"), Modifier.size(20.dp)) }
            if (prev != null || next != null) {
                IconButton({ prev?.invoke() }, enabled = prev != null) { Icon(Ic.prev, t("prevEp"), Modifier.size(20.dp)) }
                IconButton({ next?.invoke() }, enabled = next != null) { Icon(Ic.next, t("nextEp"), Modifier.size(20.dp)) }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth(), Alignment.Center) { stage() } // retain the video and its position; PlaybackSession pauses it after PiP is dismissed
    }
}

/** the servers: (host, quality), the one playing checked; busy: its player is being looked up */
@Composable
fun ServerMenu(servers: List<Pair<String, String>>, cur: Int, busy: Boolean, pick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton({ open = true }, enabled = servers.isNotEmpty()) {
            if (busy) CircularProgressIndicator(Modifier.size(12.dp), Red, strokeWidth = 2.dp)
            else Box(Modifier.size(8.dp).background(if (cur >= 0) Color(0xFF46D369) else Muted, androidx.compose.foundation.shape.CircleShape))
            Spacer(Modifier.width(6.dp))
            Text(servers.getOrNull(cur)?.let { "${it.first} ${it.second}".trim() } ?: t("chooseServer"), color = Color.White, fontSize = 13.sp, maxLines = 1)
            Icon(Ic.caretDown, null, Modifier.padding(start = 4.dp).size(14.dp), tint = Color.White)
        }
        DropdownMenu(open && !inPip.value, { open = false }, containerColor = CardC) {
            servers.forEachIndexed { i, (label, q) ->
                DropdownMenuItem({ Text("$label  $q".trim()) }, { open = false; pick(i) }, trailingIcon = { if (i == cur) Icon(Ic.check, null, Modifier.size(18.dp), tint = Red) })
            }
        }
    }
}

/**
 * an episode's download links, by quality (app.js download menu): MediaFire's downloads in the app, the other hosts open in
 * the browser; a downloaded (or downloading) copy first
 */
@Composable
private fun DownloadMenu(epPath: String, show: String, ep: String, d: Details?, nav: Nav) {
    var open by remember { mutableStateOf(false) }
    var links by remember(epPath) { mutableStateOf<List<Server>?>(null) } // fetched on first open
    val scope = rememberCoroutineScope()
    val browse = openUrl()
    com.medanime.app.Downloads.tick.intValue
    Box {
        IconButton({
            open = true
            if (links == null) scope.launch { links = runCatching { Witanime.downloadLinks(epPath) }.getOrElse { if (it is CancellationException) throw it; emptyList() } }
        }) { Icon(Ic.download, t("download"), Modifier.size(20.dp)) }
        DropdownMenu(open && !inPip.value, { open = false }, containerColor = CardC) {
            when (com.medanime.app.Downloads.of(epPath)?.optString("state")) {
                "done" -> DropdownMenuItem({ Text(t("playOffline")) }, { open = false; nav.replace(Screen.Offline(epPath)) }, leadingIcon = { Icon(Ic.play, null, Modifier.size(18.dp), tint = Red) })
                "active", "queued" -> DropdownMenuItem({ Text(t("dlOpenList")) }, { open = false; nav.go(Screen.Downloads(show)) }, leadingIcon = { Icon(Ic.download, null, Modifier.size(18.dp), tint = Red) })
            }
            val l = links
            if (l == null) DropdownMenuItem({ Text(t("searching"), color = Muted) }, {}, enabled = false)
            else if (l.isEmpty()) DropdownMenuItem({ Text(t("dlNone"), color = Muted) }, {}, enabled = false)
            else Witanime.QUALITY.forEach { q ->
                val g = l.filter { it.quality == q }.sortedBy { if (it.label == "mediafire") 0 else 1 }
                if (g.isEmpty()) return@forEach
                Text(q, Modifier.padding(horizontal = 16.dp, vertical = 6.dp), color = Muted, fontSize = 12.sp)
                g.forEach { s ->
                    val inApp = s.label == "mediafire" // the one host the app can download from itself
                    DropdownMenuItem({ Text(s.label) }, {
                        open = false
                        Store["prefs"].put("dlQuality", s.quality).put("dlHost", s.label); Store.persist("prefs")
                        if (inApp) com.medanime.app.Downloads.episode(epPath, show, d?.title ?: "", ep, d?.poster ?: "", s.quality)
                        else scope.launch { runCatching { browse(Witanime.downloadPage(s.token)); toast(t("openedBrowser")) }.onFailure { toast(t("dlFailed")) } }
                    }, trailingIcon = { Text(if (inApp) t("inApp") else t("browser"), color = if (inApp) Red else Muted, fontSize = 12.sp) })
                }
            }
        }
    }
}

/** a film's download links: third-party hosts, opened in the browser (cinema.js) */
@Composable
fun LinksMenu(links: List<Link>?) {
    var open by remember { mutableStateOf(false) }
    val browse = openUrl()
    Box {
        IconButton({ open = true }, enabled = links != null) { Icon(Ic.download, t("download"), Modifier.size(20.dp)) }
        DropdownMenu(open && !inPip.value, { open = false }, containerColor = CardC) {
            if (links.isNullOrEmpty()) DropdownMenuItem({ Text(t("dlNone"), color = Muted) }, {}, enabled = false)
            links?.forEach { l ->
                DropdownMenuItem({ Text("${l.label}  ${l.quality}".trim()) }, { open = false; browse(l.url); toast(t("openedBrowser")) },
                    trailingIcon = { Icon(Ic.external, null, Modifier.size(16.dp), tint = Muted) })
            }
        }
    }
}

/**
 * the video host's own player, in an iframe on a page of ours as the WebView app has it (mobile.js player): hosts' embed
 * pages are made to be framed, and MEGA's came up dimmed and empty opened as the page itself. Several hosts refuse to play
 * sandboxed, so what a sandbox would stop is refused here (MainActivity does the same): popups, the page taken to an ad,
 * and alert boxes
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HostPlayer(url: String, playbackKey: String = url) = key(url, playbackKey) { HostPlayerView(url, playbackKey) }

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun HostPlayerView(url: String, playbackKey: String) {
    var full by remember { mutableStateOf<Pair<View, WebChromeClient.CustomViewCallback>?>(null) }
    var loading by remember { mutableStateOf(true) } // the host's page still coming: black until then, so a spinner over it
    val act = Net.activity
    var detach by remember { mutableStateOf<(() -> Unit)?>(null) }
    val bars = remember { WindowCompat.getInsetsController(act.window, act.window.decorView) }
    // leaving fullscreen can come from the player, back, or the page closing (its WebView may be going): each step on its own
    fun exit() {
        val (v, cb) = full ?: return
        full = null
        runCatching { (v.parent as? ViewGroup)?.removeView(v) }
        bars.show(WindowInsetsCompat.Type.systemBars())
        // back upright, as after our own fullscreen (freeing the rotation left a phone held sideways in landscape); the
        // player page frees it when it closes (PlayerChrome)
        act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        runCatching { cb.onCustomViewHidden() }
    }
    BackHandler(full != null) { exit() }
    DisposableEffect(Unit) { onDispose { exit() } }
    Box(Modifier.fillMaxSize(), Alignment.Center) {
    AndroidView({ ctx ->
        WebView(ctx).apply {
            detach = PlaybackSession.attach(this, playbackKey)
            keepScreenOn = !PlaybackSession.suspended // the host's player holds no wake lock: the screen stays on mid-episode
            setBackgroundColor(AColor.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportMultipleWindows(true) // window.open goes to onCreateWindow (refused), never this page
            android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, true) // the host is a third party in its frame
            webViewClient = object : WebViewClient() {
                // our page never navigates: the frame taking the whole page somewhere is an ad
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest) = r.isForMainFrame
                override fun onPageFinished(v: WebView, u: String?) { loading = false } // our page's load waits for the host's frame
                // the players' video, for casting to a TV
                override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): android.webkit.WebResourceResponse? { com.medanime.app.Cast.sniff(r); return null }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(v: WebView, dialog: Boolean, gesture: Boolean, msg: Message) = false
                // a video with no poster of its own: Android's default is a green robot, drawn until it plays
                override fun getDefaultVideoPoster() = android.graphics.Bitmap.createBitmap(1, 1, android.graphics.Bitmap.Config.ARGB_8888)
                override fun onJsAlert(v: WebView, u: String, m: String, r: JsResult): Boolean { r.cancel(); return true }
                override fun onJsConfirm(v: WebView, u: String, m: String, r: JsResult): Boolean { r.cancel(); return true }
                override fun onJsPrompt(v: WebView, u: String, m: String, d: String?, r: JsPromptResult): Boolean { r.cancel(); return true }
                // the player's fullscreen button: its video over everything, landscape, bars hidden (a swipe shows them briefly)
                override fun onShowCustomView(view: View, cb: CustomViewCallback) {
                    if (full != null) return cb.onCustomViewHidden()
                    full = view to cb
                    view.setBackgroundColor(AColor.BLACK)
                    (act.window.decorView as ViewGroup).addView(view, FrameLayout.LayoutParams(-1, -1))
                    bars.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    bars.hide(WindowInsetsCompat.Type.systemBars())
                    act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                }
                override fun onHideCustomView() = exit()
            }
        }
    }, Modifier.fillMaxSize(), onRelease = { detach?.invoke(); exit(); it.destroy() }, update = {
        if (it.tag != url) {
            it.tag = url
            loading = true
            com.medanime.app.Cast.reset() // casting takes the video of what's playing now
            // no-referrer: as mobile.js frames it (some hosts refuse other sites' pages). myseed's gateway is the other way round:
            // with no referrer, or ours, it shows a "visit the official site" banner; framed from its front site (front=), its player
            val front = Uri.parse(url).takeIf { u -> u.host == "d.myseed.tv" }?.getQueryParameter("front") // the site's domain of the day (Cinema.myseedUrl)
            // YouTube (trailers) refuses to play with no referrer (error 153); in an app's WebView it wants the app's id as one
            val yt = Uri.parse(url).host?.contains("youtube") == true
            it.loadDataWithBaseURL(if (front != null) "https://$front/" else if (yt) "https://com.medanime.app/" else "https://localhost/", "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>" +
                "<style>body{margin:0;background:#000}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>" +
                "<iframe src=\"${android.text.Html.escapeHtml(url)}\" allow=\"autoplay; fullscreen; encrypted-media; picture-in-picture\" allowfullscreen referrerpolicy=\"${if (front != null || yt) "origin" else "no-referrer"}\"></iframe>",
                "text/html", "utf-8", null)
        }
    })
    if (loading) CircularProgressIndicator(color = Red) // draws no touch handler: the player under it still gets taps
    }
}

/** a title's trailer in the app (app.js showTrailer): its player 16:9 on black, playing at once; back closes it */
@Composable
fun TrailerScreen(url: String, title: String, nav: Nav) = Box(Modifier.fillMaxSize().background(Color.Black)) {
    Box(Modifier.fillMaxWidth().aspectRatio(16 / 9f).align(Alignment.Center)) { HostPlayer(url + (if ('?' in url) "&" else "?") + "autoplay=1") }
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(nav.back) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) }
        Text(title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
