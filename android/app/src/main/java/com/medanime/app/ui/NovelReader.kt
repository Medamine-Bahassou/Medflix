package com.medanime.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextIndent
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.medanime.app.Downloads
import com.medanime.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

// the page's colours: the app's own black, and the paper ones a reader needs (the app's tokens have no light colours)
private class Paper(val bg: Color, val fg: Color, val muted: Color, val light: Boolean, val mark: Color, val speak: Color)
private val PAPERS = linkedMapOf(
    "black" to Paper(Color.Black, Color(0xFFD8D8D8), Muted, false, Color(0x40F5C518), Color(0x33E50914)),
    "dim" to Paper(CardC, Color(0xFFCFCFCF), Muted, false, Color(0x40F5C518), Color(0x33E50914)),
    "sepia" to Paper(Color(0xFFF4ECD8), Color(0xFF3F3122), Color(0xFF85745C), true, Color(0x66E6B422), Color(0x26E50914)),
    "light" to Paper(Color.White, Color(0xFF1C1C1C), Color(0xFF757575), true, Color(0x66F5C518), Color(0x1FE50914)),
)
// bundled: Android's Arabic is one font on most phones, its serif and sans the same, so there was nothing to choose from
private val AMIRI = FontFamily(Font(R.font.amiri)); private val ALMARAI = FontFamily(Font(R.font.almarai)); private val TAJAWAL = FontFamily(Font(R.font.tajawal))
private val FONTS = listOf("" to "fontSystem", "amiri" to "fontAmiri", "almarai" to "fontAlmarai", "tajawal" to "fontTajawal")
private fun family(k: String) = when (k) { "amiri" -> AMIRI; "almarai" -> ALMARAI; "tajawal" -> TAJAWAL; else -> FontFamily.Default }

/** how the reader looks and behaves, remembered (prefs.nv) */
private data class Look(val size: Int = 19, val line: Float = 1.8f, val font: String = "", val paper: String = "black", val margin: Int = 20, val gap: Int = 14,
                        val justify: Boolean = true, val indent: Boolean = false, val paged: Boolean = false, val cont: Boolean = true, val keepOn: Boolean = false,
                        val vol: Boolean = true, val bright: Float = -1f, val rotate: String = "", val speed: Float = 3f) {
    fun save() {
        Store["prefs"].put("nv", JSONObject().put("size", size).put("line", line.toDouble()).put("font", font).put("paper", paper).put("margin", margin).put("gap", gap).put("justify", justify)
            .put("indent", indent).put("paged", paged).put("cont", cont).put("keepOn", keepOn).put("vol", vol).put("bright", bright.toDouble()).put("rotate", rotate).put("speed", speed.toDouble()))
        Store.persist("prefs", true)
    }
    companion object {
        fun load(): Look {
            val o = Store["prefs"].optJSONObject("nv") ?: return Look()
            val d = Look()
            return Look(o.optInt("size", d.size), o.optDouble("line", d.line.toDouble()).toFloat(), o.optString("font"), o.optString("paper", d.paper), o.optInt("margin", d.margin), o.optInt("gap", d.gap),
                o.optBoolean("justify", d.justify), o.optBoolean("indent"), o.optBoolean("paged"), o.optBoolean("cont", d.cont), o.optBoolean("keepOn"), o.optBoolean("vol", d.vol),
                o.optDouble("bright", -1.0).toFloat(), o.optString("rotate"), o.optDouble("speed", d.speed.toDouble()).toFloat())
        }
    }
}

private data class Spot(val slug: String, val at: Double, val soft: Boolean = false) // soft: reading aloud moved on: glide there, if it's off the screen

/** the reader's state: the views below read and move it; a chapter's paragraphs are counted from 0, its heading is before them */
private class Rd(val novel: String, start: String) {
    val chain = mutableStateListOf<NovelChapter>() // the chapters in the list (scrolling on): newest added as they come up
    var cur by mutableStateOf(start)
    var at by mutableDoubleStateOf(Novels.spot(novel, start)) // the paragraph at the top + how far down it
    var want by mutableStateOf<Spot?>(Spot(start, at)) // a chapter to open
    var jump by mutableStateOf<Spot?>(null) // a place to go to in what's open
    var nextFailed by mutableStateOf<String?>(null)
    var copies by mutableStateOf(listOf(novel)) // this novel on the sites that have it: looked for when the menu's first opened
    var looking by mutableStateOf(false)
    var looked = false
    var switching by mutableStateOf(false)
    var bars by mutableStateOf(true)
    var auto by mutableStateOf(false)
    var seekAt = 0L
    var find by mutableStateOf<String?>(null) // the search box open: what's typed
    var findAt by mutableIntStateOf(0)
    var pressed by mutableStateOf<Pair<NovelChapter, Int>?>(null)
    var turn: (Int) -> Unit = {} // a page on or back (volume keys): the view showing fills it in
    val c get() = chain.find { it.slug == cur } ?: chain.firstOrNull()

    fun place(c: NovelChapter, a: Double) { cur = c.slug; at = a; Novels.keep(novel, c.slug, a) }
    /** to a place: moved to if its chapter is open, else it's opened; reading aloud goes with it within a chapter */
    fun go(slug: String, a: Double? = null) {
        val to = a ?: Novels.spot(novel, slug)
        val r = ReadAloud.now?.takeIf { it.novel == novel }
        if (r != null) { if (r.c.slug == slug) { ReadAloud.seek(to.toInt()); return } else ReadAloud.stop() }
        if (chain.any { it.slug == slug }) { cur = slug; at = to; jump = Spot(slug, to) } else want = Spot(slug, to)
    }
}

/** the two text styles: the paragraphs' and the heading's */
private fun bodyStyle(l: Look, p: Paper) = TextStyle(color = p.fg, fontFamily = family(l.font), fontSize = l.size.sp, lineHeight = (l.size * l.line).sp,
    textDirection = TextDirection.ContentOrRtl, textAlign = if (l.justify) TextAlign.Justify else TextAlign.Start,
    textIndent = if (l.indent) TextIndent(firstLine = (l.size * 1.5f).sp) else null)
private fun headStyle(l: Look, p: Paper) = TextStyle(color = p.fg, fontFamily = family(l.font), fontSize = (l.size + 5).sp, lineHeight = ((l.size + 5) * 1.5f).sp, fontWeight = FontWeight.Bold,
    textDirection = TextDirection.ContentOrRtl, textAlign = TextAlign.Center)
private fun headText(c: NovelChapter) = "${t("chapter")} ${c.n}" + c.title.takeIf { it.isNotEmpty() }?.let { "\n$it" }.orEmpty()

/** two fingers apart or together: the text bigger or smaller, a step at a time (and the list doesn't scroll under them) */
private fun Modifier.pinchSize(size: () -> Int, set: (Int) -> Unit) = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        var zoom = 1f
        do {
            val e = awaitPointerEvent(PointerEventPass.Initial)
            if (e.changes.count { it.pressed } >= 2) {
                zoom *= e.calculateZoom()
                if (zoom > 1.08f) { set((size() + 1).coerceAtMost(40)); zoom = 1f } else if (zoom < .92f) { set((size() - 1).coerceAtLeast(12)); zoom = 1f }
                e.changes.forEach { it.consume() }
            }
        } while (e.changes.any { it.pressed })
    }
}

/**
 * a novel's reader: scrolled, chapter after chapter (the default), or in pages turned right to left as an Arabic book's. A tap
 * shows or hides the bars (in pages, its sides turn), a long press on a paragraph gives its actions, pinching sizes the text.
 * Chapters change in place, not as new screens (Screen.NovelRead's toString), so nothing flashes between them
 */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun NovelReaderScreen(novel: String, start: String, nav: Nav, title0: String = "", n0: String = "") {
    val r = remember(novel) { Rd(novel, start) }
    var look by remember { mutableStateOf(Look.load()) }
    val setLook = { l: Look -> look = l; l.save() }
    val paper = PAPERS[look.paper] ?: PAPERS.getValue("black")
    val (book, _) = loaded(novel) { f -> Novels.fullFlow(novel, f, whole = false) }
    val saved = remember(novel) { Novels.place(novel) }
    val title = book.data?.n?.title ?: title0.ifEmpty { saved?.optString("title").orEmpty() }
    val poster = book.data?.n?.poster ?: saved?.optString("poster").orEmpty()
    val scope = rememberCoroutineScope()
    var failed by remember(novel) { mutableStateOf<Throwable?>(null) }
    var attempt by remember(novel) { mutableIntStateOf(0) }
    LaunchedEffect(r.want, attempt) {
        val w = r.want ?: return@LaunchedEffect
        failed = null
        try {
            val c = Novels.chapter(novel, w.slug)
            r.chain.clear(); r.chain.add(c)
            r.cur = c.slug; r.at = w.at; r.jump = Spot(c.slug, w.at); r.want = null; r.nextFailed = null
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            // a page is up: it stays, its end offers the next chapter's button
            if (r.chain.isEmpty()) failed = e else { toast(noNames(e.message)); r.nextFailed = w.slug; r.want = null }
        }
    }
    val c = r.c
    LaunchedEffect(c?.id, title, poster) { if (c != null) { Novels.opened(novel, title, poster, c); nav.replace(Screen.NovelRead(novel, c.slug, title, c.n)) } }
    // the next one fetched ahead: it opens at once, and reading on survives losing the connection for a while
    LaunchedEffect(c?.next) { c?.next?.let { n -> runCatching { Novels.chapter(novel, n) } } }
    // reading aloud moves on by itself, also with the screen off: the page catches up
    val speaking = ReadAloud.now?.takeIf { it.novel == novel }
    LaunchedEffect(speaking?.c?.id, speaking?.para) {
        val s = speaking ?: return@LaunchedEffect
        if (r.chain.none { it.id == s.c.id }) { r.chain.clear(); r.chain.add(s.c) }
        r.cur = s.c.slug; r.at = s.para.toDouble(); r.jump = Spot(s.c.slug, s.para.toDouble(), soft = true)
    }

    // the phone: its bars go with the reader's, the chosen brightness and turn of the screen hold only here; on a light page its status bar icons go dark
    val ctx = LocalContext.current; val view = LocalView.current
    val win = remember { Net.activity.window }
    val sys = remember { androidx.core.view.WindowCompat.getInsetsController(win, win.decorView) }
    val findOpen = r.find != null
    val showBars = r.bars || findOpen
    LaunchedEffect(showBars) {
        sys.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (showBars) sys.show(androidx.core.view.WindowInsetsCompat.Type.systemBars()) else sys.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
    }
    LaunchedEffect(paper.light) { sys.isAppearanceLightStatusBars = paper.light; sys.isAppearanceLightNavigationBars = paper.light }
    LaunchedEffect(look.bright) { win.attributes = win.attributes.apply { screenBrightness = look.bright } }
    LaunchedEffect(look.rotate) {
        Net.activity.requestedOrientation = when (look.rotate) { "p" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT; "l" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE; else -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED }
    }
    DisposableEffect(look.keepOn, r.auto) { view.keepScreenOn = look.keepOn || r.auto; onDispose { view.keepScreenOn = false } }
    DisposableEffect(Unit) {
        onDispose {
            sys.show(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            sys.isAppearanceLightStatusBars = false; sys.isAppearanceLightNavigationBars = false
            win.attributes = win.attributes.apply { screenBrightness = android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE }
            Net.activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }
    // auto-scrolling: the first back only warns, a second one within 2s leaves. Before find's: the last one composed goes first, so back still closes find
    var autoBackAt by remember { mutableLongStateOf(0L) }
    BackHandler(r.auto && !look.paged) { if (System.currentTimeMillis() - autoBackAt < 2000) nav.back() else { autoBackAt = System.currentTimeMillis(); toast(t("backAgain")) } }
    BackHandler(findOpen) { r.find = null }

    // pages are laid out once, so theirs run under the bars: opened without them, or the first page would start hidden
    LaunchedEffect(Unit) { if (look.paged) r.bars = false }
    // how tall the bars are right now (nothing once they've gone): running text keeps clear of them, rather than sliding under them
    var topH by remember { mutableIntStateOf(0) }
    var bottomH by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val clearTop by animateDpAsState(with(density) { topH.toDp() }, tween(150), label = "clearTop")
    val clearBottom by animateDpAsState(with(density) { bottomH.toDp() }, tween(150), label = "clearBottom")

    var sheet by remember { mutableStateOf("") } // "look", "index", "voice", or none
    val focus = remember { FocusRequester() }
    LaunchedEffect(sheet, findOpen, r.pressed) { if (sheet.isEmpty() && !findOpen && r.pressed == null) runCatching { focus.requestFocus() } } // the volume keys come here; a sheet or the search box took them

    Box(Modifier.fillMaxSize().background(paper.bg).focusRequester(focus).focusable().onPreviewKeyEvent { e ->
        val d = when (e.key) { Key.VolumeDown -> 1; Key.VolumeUp -> -1; else -> 0 }
        if (d == 0 || !look.vol || speaking != null) false else { if (e.type == KeyEventType.KeyDown) r.turn(d); true } // listening: they're the speech's volume
    }) {
        CompositionLocalProvider(LocalContentColor provides paper.fg) {
            if (c != null) {
                if (look.paged) PagedText(r, look, paper, setLook, nav) else Box(Modifier.padding(top = clearTop, bottom = clearBottom)) { ScrollText(r, look, paper, setLook, nav) }
            } else if (failed != null) Empty(t("unreachable"), noNames(failed?.message)) { Button({ attempt++ }, colors = ButtonDefaults.buttonColors(Red)) { Text(t("retry")) } }
            if ((r.want != null && failed == null) || r.switching) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Red)

            Box(Modifier.align(Alignment.TopCenter).onSizeChanged { topH = it.height }) {
                AnimatedVisibility(findOpen, enter = fadeIn(), exit = fadeOut()) { if (c != null) FindBar(r, c, paper) }
                AnimatedVisibility(showBars && !findOpen, enter = fadeIn(), exit = fadeOut()) { TopBarOf(r, c, title, n0, poster, paper, book.data, nav, look, setLook, scope) }
            }
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().onSizeChanged { bottomH = it.height }) {
                if (speaking != null) SpeechBar(speaking, paper) { sheet = "voice" }
                AnimatedVisibility(showBars && !findOpen, enter = fadeIn(), exit = fadeOut()) {
                    if (c != null) BottomBarOf(r, c, look, setLook, paper) { sheet = it }
                }
                if (!showBars && c != null && speaking == null) StatusLine(r, c, paper)
            }
        }
        if (sheet == "look") LookSheet(look, setLook, { sheet = "" })
        if (sheet == "index") IndexSheet(r, c, book.data, paper, { sheet = "" })
        if (sheet == "voice") VoiceSheet { sheet = "" }
        r.pressed?.let { (ch, para) -> ParaSheet(r, ch, para, title, poster) { r.pressed = null } }
    }
}

/** how far along, once the bars are away: the chapter, how much of it, the minutes left, the time */
@Composable
private fun StatusLine(r: Rd, c: NovelChapter, p: Paper) {
    val clock by produceState("") { val f = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()); while (isActive) { value = f.format(java.util.Date()); delay(20_000) } }
    Text("⁦${t("chShort")} ${c.n} · ${progress(r.at, c)}% · ${t("minLeft", minutesLeft(r.at, c))} · $clock⁩", Modifier.fillMaxWidth().background(p.bg.copy(alpha = .85f)).padding(vertical = 3.dp),
        color = p.muted, fontSize = 11.sp, textAlign = TextAlign.Center, maxLines = 1)
}
private fun progress(at: Double, c: NovelChapter) = if (c.paras.isEmpty()) 100 else ((at / c.paras.size) * 100).toInt().coerceIn(0, 100)
private fun minutesLeft(at: Double, c: NovelChapter) = Math.ceil((1 - at / maxOf(1, c.paras.size)).coerceIn(0.0, 1.0) * c.words / 180).toInt() // reading Arabic: ~180 words a minute

@Composable
private fun Heading(c: NovelChapter, l: Look, p: Paper, r: Rd) = Column(Modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures(onTap = { r.bars = !r.bars }) }.padding(horizontal = l.margin.dp).padding(top = 12.dp, bottom = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Text(headText(c), Modifier.fillMaxWidth(), style = headStyle(l, p))
    if (c.words > 0) Text(t("minRead", minutesLeft(0.0, c)), Modifier.padding(top = 4.dp), color = p.muted, fontSize = 12.sp)
}

/** a chapter's end: a line between chapters running on; the last one's has what's next */
@Composable
private fun ChapterEnd(r: Rd, c: NovelChapter, l: Look, p: Paper, nav: Nav, last: Boolean) = Column(Modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures(onTap = { r.bars = !r.bars }) }.padding(horizontal = l.margin.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    if (c.paras.isEmpty()) Text(t("nvNoText"), Modifier.padding(bottom = 12.dp), fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    Text("${t("endOfChapter")} ${c.n}", color = p.muted, fontSize = 13.sp)
    if (last) {
        Spacer(Modifier.height(14.dp))
        when {
            c.next == null -> { Text(t("nvFinished"), Modifier.padding(bottom = 12.dp), color = p.muted, fontSize = 13.sp, textAlign = TextAlign.Center); OutlinedButton({ nav.replace(Screen.NovelTitle(r.novel)) }) { Text(t("chapters"), color = p.fg) } }
            l.cont && r.nextFailed != c.next -> CircularProgressIndicator(Modifier.size(26.dp), color = Red, strokeWidth = 2.dp)
            else -> RedButton(t("nextCh")) { r.nextFailed = null; r.go(c.next) }
        }
    }
}

/** a paragraph, with what's marked on it; a tap is the bars, a long press its actions */
@Composable
private fun Para(r: Rd, c: NovelChapter, i: Int, style: TextStyle, l: Look, p: Paper, q: Regex?, hl: Boolean, mark: Boolean) {
    val haptic = LocalHapticFeedback.current
    val text = c.paras[i]
    val shown = remember(text, q) {
        if (q == null) AnnotatedString(text) else buildAnnotatedString { append(text); q.findAll(text).forEach { addStyle(SpanStyle(background = Color(0x99F5C518)), it.range.first, it.range.last + 1) } }
    }
    val speaking = ReadAloud.now?.let { it.c.id == c.id && it.para == i } == true
    Box(Modifier.fillMaxWidth().background(if (speaking) p.speak else if (hl) p.mark else Color.Transparent).pointerInput(c.id, i) {
        detectTapGestures(onTap = { r.bars = !r.bars }, onLongPress = { haptic.performHapticFeedback(HapticFeedbackType.LongPress); r.pressed = c to i })
    }.padding(horizontal = l.margin.dp).padding(bottom = l.gap.dp)) {
        Text(shown, Modifier.fillMaxWidth(), style = style)
        if (mark) Icon(Ic.bookmarkFill, null, Modifier.align(Alignment.TopEnd).offset(x = (l.margin / 2 + 8).dp).size(14.dp), tint = Red)
    }
}

@OptIn(FlowPreview::class)
@Composable
private fun ScrollText(r: Rd, l: Look, p: Paper, setLook: (Look) -> Unit, nav: Nav) {
    val list = remember(r.novel) { LazyListState() }
    val look by rememberUpdatedState(l)
    val scope = rememberCoroutineScope()
    // item i: its chapter and paragraph (-1 the heading, its count the end)
    fun of(i: Int): Pair<NovelChapter, Int> {
        var b = 0
        r.chain.forEach { ch -> val n = ch.paras.size + 2; if (i < b + n) return ch to (i - b - 1); b += n }
        return r.chain.last().let { it to it.paras.size }
    }
    fun indexOf(slug: String, para: Int): Int {
        var b = 0
        r.chain.forEach { ch -> if (ch.slug == slug) return b + 1 + para.coerceIn(-1, ch.paras.size); b += ch.paras.size + 2 }
        return 0
    }
    // a push up at the very top of the list: nothing scrolls there, so lastScrolledBackward never says so (opened on a chapter's start)
    var pulled by remember { mutableStateOf(false) }
    val pull = remember { object : NestedScrollConnection {
        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource) = Offset.Zero.also { if (available.y > 0) pulled = true }
    } }
    r.turn = { d -> if (d < 0 && !list.canScrollBackward) pulled = true; scope.launch { list.animateScrollBy(d * list.layoutInfo.viewportSize.height * .85f) } }
    // going somewhere: the paragraph, then how far down it (known once it's laid out)
    LaunchedEffect(r.jump, r.chain.size) {
        val j = r.jump?.takeIf { s -> r.chain.any { it.slug == s.slug } } ?: return@LaunchedEffect
        val para = j.at.toInt().coerceAtMost(1_000_000)
        val i = indexOf(j.slug, if (j.at == 0.0) -1 else para)
        if (j.soft) { if (list.layoutInfo.visibleItemsInfo.none { it.index == i }) list.animateScrollToItem(i) }
        else {
            list.scrollToItem(i)
            list.layoutInfo.visibleItemsInfo.firstOrNull { it.index == i }?.let { list.scrollToItem(i, ((j.at - para) * it.size).toInt()) }
        }
        r.jump = null
    }
    // where the reader is, twice a second as it moves; chapters scrolled past are read
    LaunchedEffect(list) {
        snapshotFlow { list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset }.sample(500).collect { (i, off) ->
            if (r.chain.isEmpty() || r.jump != null || r.want != null) return@collect
            val (ch, para) = of(i)
            val left = r.chain.indexOfFirst { it.slug == r.cur }
            val size = list.layoutInfo.visibleItemsInfo.firstOrNull()?.size ?: 1
            r.place(ch, if (para < 0) 0.0 else para + minOf(.999, off.toDouble() / maxOf(1, size)))
            if (i > 0 && list.isScrollInProgress && !r.auto && System.currentTimeMillis() - r.seekAt > 1000) r.bars = false // reading: the bars go; not while sliding the progress in them
            // the chapter just scrolled out of is read; one put before this one (scrolling back up) isn't
            if (left in 0 until r.chain.indexOfFirst { it.id == ch.id }) Novels.finished(r.chain[left])
            val (lastCh, lastP) = of(list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: i)
            if (lastP >= lastCh.paras.size) Novels.finished(lastCh)
        }
    }
    // the next chapter joins on as this one's end comes up; the one before as the top's reached scrolling back up
    val nearEnd by remember { derivedStateOf { list.layoutInfo.let { (it.visibleItemsInfo.lastOrNull()?.index ?: 0) >= it.totalItemsCount - 6 } } }
    val nearTop by remember { derivedStateOf { list.firstVisibleItemIndex < 2 && (list.lastScrolledBackward || pulled) } }
    val tailNext = r.chain.lastOrNull()?.next; val headPrev = r.chain.firstOrNull()?.prev
    LaunchedEffect(nearEnd, tailNext, l.cont) {
        if (nearEnd && l.cont && tailNext != null) try { Novels.chapter(r.novel, tailNext).let { x -> if (r.chain.none { it.id == x.id }) r.chain.add(x) } }
        catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; r.nextFailed = tailNext }
    }
    LaunchedEffect(nearTop, headPrev, l.cont) {
        if (nearTop && l.cont && headPrev != null) try { Novels.chapter(r.novel, headPrev).let { x -> if (r.chain.none { it.id == x.id }) r.chain.add(0, x) } }
        catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e }
        pulled = false // failed: the next push asks again
    }
    // auto-scroll: the text glides at 0.5x-10x, a finger taking over meanwhile
    val dens = LocalDensity.current.density
    LaunchedEffect(r.auto) {
        if (!r.auto) return@LaunchedEffect
        var last = withFrameNanos { it }
        while (r.auto) {
            val now = withFrameNanos { it }
            val dy = (now - last) / 1e9f * 8f * look.speed * dens; last = now
            // a finger's fling goes on to its end: same priority as this, so a scrollBy now would cancel it
            if (!list.isScrollInProgress) try { list.scrollBy(dy) } catch (e: kotlinx.coroutines.CancellationException) { if (!kotlinx.coroutines.currentCoroutineContext().isActive) throw e }
        }
    }
    Store.version.intValue // a mark added or removed
    val marks = Novels.marks(r.novel)
    val hls = remember(marks) { marks.filter { it.optString("kind") == "hl" }.map { it.optString("ch") to it.optInt("p") }.toSet() }
    val bms = remember(marks) { marks.filter { it.optString("kind") == "mark" }.map { it.optString("ch") to it.optInt("p") }.toSet() }
    val style = remember(l, p) { bodyStyle(l, p) }
    val q = r.find?.let(Novels::findRe)
    LazyColumn(Modifier.fillMaxSize().nestedScroll(pull).pinchSize({ look.size }) { setLook(look.copy(size = it)) }, list, PaddingValues(top = 44.dp, bottom = 32.dp)) {
        r.chain.forEach { ch ->
            item("${ch.id}:h") { Heading(ch, l, p, r) }
            itemsIndexed(ch.paras, { i, _ -> "${ch.id}:$i" }) { i, _ -> Para(r, ch, i, style, l, p, q, (ch.slug to i) in hls, (ch.slug to i) in bms) }
            item("${ch.id}:e") { ChapterEnd(r, ch, l, p, nav, ch.id == r.chain.lastOrNull()?.id) }
        }
    }
}

private class Laid(val chapter: String, val layouts: List<TextLayoutResult>, val pages: List<List<Novels.Slice>>)
// a chapter measured into pages: one layout per paragraph, each page drawing the runs of lines that fall on it
private fun layOut(m: TextMeasurer, c: NovelChapter, l: Look, p: Paper, w: Int, h: Int, gap: Float): Laid {
    val fixed = Constraints.fixedWidth(w.coerceAtLeast(1)) // not just a maximum: a short right-to-left line would measure narrow, and sit on the left
    val body = bodyStyle(l, p)
    val all = listOf(m.measure(headText(c), headStyle(l, p), constraints = fixed)) + c.paras.map { m.measure(it, body, constraints = fixed) }
    return Laid(c.id, all, Novels.fitPages(all.map { a -> FloatArray(a.lineCount) { a.getLineBottom(it) - a.getLineTop(it) } }, h.toFloat(), gap))
}

@Composable
private fun PagedText(r: Rd, l: Look, p: Paper, setLook: (Look) -> Unit, nav: Nav) {
    val c = r.c ?: return
    val look by rememberUpdatedState(l)
    val scope = rememberCoroutineScope()
    val measurer = rememberTextMeasurer(0) // off the main thread: no shared cache
    val dens = LocalDensity.current
    val top = with(dens) { 44.dp.toPx() }; val gapPx = with(dens) { l.gap.dp.toPx() }
    val q = r.find?.let(Novels::findRe)
    Store.version.intValue
    val marks = Novels.marks(r.novel).filter { it.optString("ch") == c.slug }
    val hls = marks.filter { it.optString("kind") == "hl" }.map { it.optInt("p") }.toSet()
    BoxWithConstraints(Modifier.fillMaxSize().pinchSize({ look.size }) { setLook(look.copy(size = it)) }) {
        val w = with(dens) { (maxWidth - (l.margin * 2).dp).roundToPx() }; val h = with(dens) { (maxHeight - 44.dp - 28.dp).roundToPx() }
        val laid by produceState<Laid?>(null, c.id, l.size, l.line, l.font, l.margin, l.gap, l.justify, l.indent, l.paper, w, h) {
            value = withContext(Dispatchers.Default) { layOut(measurer, c, l, p, w, h, gapPx) }
        }
        // another chapter's pages, until this one's are laid out: they'd report their place as this chapter's
        val d = laid?.takeIf { it.chapter == c.id } ?: return@BoxWithConstraints Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = Red) }
        key(d) { // laid out anew (another size, another chapter): the same paragraph's page
            val lead = if (c.prev != null) 1 else 0 // a page before the first: reaching it opens the chapter before
            val pager = rememberPagerState(lead + Novels.pageOf(d.pages, { d.layouts.getOrNull(it)?.lineCount ?: 1 }, r.at)) { lead + d.pages.size + 1 }
            r.turn = { dir -> scope.launch { pager.animateScrollToPage(pager.currentPage + dir) } }
            LaunchedEffect(pager) {
                snapshotFlow { pager.settledPage }.collect { i ->
                    if (r.want != null || r.jump != null) return@collect
                    when {
                        i < lead -> r.go(c.prev!!, 1e6)
                        i >= lead + d.pages.size -> { Novels.finished(c); r.at = c.paras.size.toDouble(); if (look.cont && c.next != null) r.go(c.next, 0.0) }
                        else -> {
                            val s = d.pages[i - lead].first()
                            r.place(c, if (s.block == 0) 0.0 else (s.block - 1) + s.from.toDouble() / maxOf(1, d.layouts[s.block].lineCount))
                            if (i > lead) r.bars = false
                        }
                    }
                }
            }
            LaunchedEffect(r.jump) {
                val j = r.jump?.takeIf { it.slug == c.slug } ?: return@LaunchedEffect
                val to = lead + Novels.pageOf(d.pages, { d.layouts.getOrNull(it)?.lineCount ?: 1 }, j.at)
                if (j.soft) pager.animateScrollToPage(to) else pager.scrollToPage(to)
                r.jump = null
            }
            val haptic = LocalHapticFeedback.current
            HorizontalPager(pager, Modifier.fillMaxSize().pointerInput(d) {
                detectTapGestures(onTap = { o -> // an Arabic book: the next page is on the left
                    when { o.x < size.width * .3f -> r.turn(1); o.x > size.width * .7f -> r.turn(-1); else -> r.bars = !r.bars }
                }, onLongPress = { o ->
                    val i = pager.currentPage - lead
                    var y = top
                    d.pages.getOrNull(i)?.firstOrNull { s ->
                        val a = d.layouts[s.block]; y += a.getLineBottom(s.to - 1) - a.getLineTop(s.from) + gapPx
                        o.y < y
                    }?.takeIf { it.block > 0 }?.let { haptic.performHapticFeedback(HapticFeedbackType.LongPress); r.pressed = c to (it.block - 1) }
                })
            }, reverseLayout = true, beyondViewportPageCount = 1) { i ->
                when {
                    i < lead -> Box(Modifier.fillMaxSize())
                    i >= lead + d.pages.size -> Box(Modifier.fillMaxSize(), Alignment.Center) { ChapterEnd(r, c, l, p, nav, true) }
                    else -> {
                        val slices = d.pages[i - lead]
                        Canvas(Modifier.fillMaxSize().semantics { contentDescription = slices.joinToString("\n") { s -> d.layouts[s.block].layoutInput.text.text } }) {
                            var y = top
                            val speakingPara = ReadAloud.now?.takeIf { it.c.id == c.id }?.para
                            slices.forEach { s ->
                                val a = d.layouts[s.block]
                                val t0 = a.getLineTop(s.from); val hh = a.getLineBottom(s.to - 1) - t0
                                if (s.block - 1 == speakingPara) drawRect(p.speak, Offset(0f, y), Size(size.width, hh))
                                else if (s.block - 1 in hls) drawRect(p.mark, Offset(0f, y), Size(size.width, hh))
                                clipRect(0f, y, size.width, y + hh) {
                                    translate(with(dens) { l.margin.dp.toPx() }, y - t0) {
                                        if (q != null && s.block > 0) q.findAll(a.layoutInput.text.text).forEach { m -> drawPath(a.getPathForRange(m.range.first, m.range.last + 1), Color(0x99F5C518)) }
                                        drawText(a)
                                    }
                                }
                                y += hh + gapPx
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TopBarOf(r: Rd, c: NovelChapter?, title: String, n0: String, poster: String, p: Paper, full: NovelFull?, nav: Nav, l: Look, setLook: (Look) -> Unit, scope: kotlinx.coroutines.CoroutineScope) {
    Row(Modifier.fillMaxWidth().background(p.bg).statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) { // solid: a page's text can still be under it
        IconButton(nav.back) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) }
        Column(Modifier.weight(1f).clickable { nav.replace(Screen.NovelTitle(r.novel)) }) {
            Text(title.ifEmpty { t("novels") }, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(c?.let { "${t("chapter")} ${it.n}" + it.title.takeIf { n -> n.isNotEmpty() }?.let { n -> " · $n" }.orEmpty() } ?: n0.takeIf { it.isNotEmpty() }?.let { "${t("chapter")} $it" } ?: t("loading"), color = p.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (c == null) return
        IconButton({ r.find = ""; r.findAt = 0 }) { Icon(Ic.search, t("rdFindPh"), Modifier.size(22.dp)) }
        Store.version.intValue
        val para = r.at.toInt().coerceAtMost((c.paras.size - 1).coerceAtLeast(0))
        val on = Novels.marked(r.novel, c.slug, para, "mark")
        IconButton({ if (c.paras.isNotEmpty()) Novels.toggleMark(r.novel, c, para, "mark").let { toast(t(if (it) "rdMarkAdded" else "rdMarkRemoved")) } }) { Icon(if (on) Ic.bookmarkFill else Ic.bookmark, t("rdMark"), Modifier.size(22.dp), tint = if (on) Red else LocalContentColor.current) }
        var menu by remember { mutableStateOf(false) }
        Box {
            IconButton({
                menu = true
                // in the reader's scope, not the menu's: closing it doesn't stop the look
                if (!r.looked && !r.looking && title.isNotEmpty()) scope.launch {
                    r.looking = true
                    try { Novels.copies(r.novel, listOf(title) + full?.n?.alt.orEmpty().split(" · ")).collect { r.copies = it }; r.looked = true } finally { r.looking = false }
                }
            }) { Icon(Ic.dots, t("more"), Modifier.size(22.dp)) }
            DropdownMenu(menu, { menu = false }, containerColor = CardC) {
                Downloads.tick.intValue
                val id = Novels.dlId(r.novel, c.slug)
                val done = Downloads.done(id)
                val here = NovelCh(c.id, c.slug, c.n, c.title, c.words)
                val white = Color.White
                DropdownMenuItem({ Text(if (done) t("del") else t("downloadShort"), color = white) }, { menu = false; if (done) Downloads.delete(id) else Downloads.novel(r.novel, title, poster, listOf(here)) },
                    leadingIcon = { Icon(if (done) Ic.trash else Ic.download, null, Modifier.size(18.dp), tint = white) })
                full?.chs?.let { all ->
                    val after = all.takeWhile { it.slug != c.slug }.takeLast(10).reversed() // newest first: the ones just after this one
                    if (after.isNotEmpty()) DropdownMenuItem({ Text(t("nvDlNext", after.size), color = white) }, { menu = false; Downloads.novel(r.novel, title, poster, after) }, leadingIcon = { Icon(Ic.downloads, null, Modifier.size(18.dp), tint = white) })
                }
                DropdownMenuItem({ Text(t("details"), color = white) }, { menu = false; nav.replace(Screen.NovelTitle(r.novel)) }, leadingIcon = { Icon(Ic.info, null, Modifier.size(18.dp), tint = white) })
                HorizontalDivider(color = Color(0x1AFFFFFF))
                // stays open: the switch is seen to move
                DropdownMenuItem({ Text(t("continuous"), color = white) }, { setLook(l.copy(cont = !l.cont)) }, leadingIcon = { Icon(Ic.novel, null, Modifier.size(18.dp), tint = white) },
                    trailingIcon = { Switch(l.cont, null, Modifier.padding(start = 12.dp).height(24.dp), colors = SwitchDefaults.colors(checkedTrackColor = Red)) })
                // the same chapter on another site. Decided as the menu opens: a row vanishing under the finger when the look finds nothing would make the menu jump
                val offersSources = remember { !r.looked || r.copies.size > 1 }
                if (offersSources) {
                    HorizontalDivider(color = Color(0x1AFFFFFF))
                    // opens within this menu, not as a menu over it: nothing covers the row, and one tap outside closes it all
                    var sources by remember { mutableStateOf(false) }
                    val more = r.copies.size > 1
                    val turn by animateFloatAsState(if (sources && more) 180f else 0f, label = "caret")
                    DropdownMenuItem({ Text(t("source"), color = white) }, { if (more) sources = !sources }, enabled = more || r.looking, leadingIcon = { Icon(Ic.folder, null, Modifier.size(18.dp), tint = white) }, trailingIcon = {
                        Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (r.looking) CircularProgressIndicator(Modifier.padding(end = 8.dp).size(14.dp), color = Red, strokeWidth = 2.dp)
                            Text(t("sourceN", r.copies.indexOf(r.novel) + 1), color = Muted, fontSize = 13.sp)
                            if (more) Icon(Ic.caretDown, null, Modifier.padding(start = 6.dp).size(12.dp).graphicsLayer { rotationZ = turn }, tint = Muted)
                        }
                    })
                    AnimatedVisibility(sources && more, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                        Column {
                            r.copies.forEachIndexed { i, to ->
                                val here = to == r.novel
                                // lined up under the row's label; the one in use just folds the list back
                                DropdownMenuItem({ Text(t("sourceN", i + 1), color = if (here) Red else white, fontWeight = if (here) FontWeight.Bold else FontWeight.Normal) }, {
                                    if (here) sources = false
                                    else {
                                        menu = false
                                        scope.launch {
                                            r.switching = true
                                            try {
                                                val ch = Novels.sameChapter(to, c.n)
                                                if (ch == null) toast(t("nvNoCopy"))
                                                else {
                                                    if (ReadAloud.now?.novel == r.novel) ReadAloud.stop() // it would read on in the copy being left
                                                    Novels.switched(r.novel, to)
                                                    nav.replace(Screen.NovelRead(to, ch.slug, title, ch.n))
                                                }
                                            } catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; toast(noNames(e.message)) } finally { r.switching = false }
                                        }
                                    }
                                }, Modifier.background(if (here) Color(0x12FFFFFF) else Color.Transparent), trailingIcon = { if (here) Icon(Ic.check, null, Modifier.size(16.dp), tint = Red) },
                                    contentPadding = PaddingValues(start = 42.dp, end = 12.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** the bottom bar, in reach of a thumb: how far along (sliding moves through the chapter, from the right as the text runs) with the chapters beside it, then the tools */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun BottomBarOf(r: Rd, c: NovelChapter, l: Look, setLook: (Look) -> Unit, p: Paper, open: (String) -> Unit) {
    var speedOpen by remember { mutableStateOf(false) }
    // auto-scrolling, the page never stops: the bars a tap shows go by themselves
    LaunchedEffect(r.bars, r.auto, speedOpen) { if (r.auto && r.bars && !speedOpen) { delay(4000); r.bars = false } }
    val on = Red
    Column(Modifier.fillMaxWidth().background(p.bg).navigationBarsPadding().padding(horizontal = 4.dp)) { // solid: a page's text can still be under it
        if (speedOpen && !l.paged) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("⁦${if (l.speed % 1 == 0f) l.speed.toInt() else l.speed}x⁩", Modifier.padding(start = 12.dp).width(36.dp), fontSize = 13.sp)
            Slider(l.speed, { setLook(l.copy(speed = Math.round(it * 2) / 2f)) }, Modifier.weight(1f).padding(end = 12.dp), valueRange = .5f..10f, steps = 18, colors = SliderDefaults.colors(thumbColor = on, activeTrackColor = on))
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ c.next?.let { r.go(it, 0.0) } }, enabled = c.next != null) { Icon(Ic.prev, t("nextCh"), Modifier.size(22.dp), tint = if (c.next != null) p.fg else p.muted) } // the next one's on the left, as the text runs
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                Slider(if (c.paras.isEmpty()) 1f else (r.at / c.paras.size).toFloat().coerceIn(0f, 1f), { r.seekAt = System.currentTimeMillis(); r.at = (it * c.paras.size).toDouble(); r.go(c.slug, r.at) }, Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = on, activeTrackColor = on, inactiveTrackColor = p.muted.copy(alpha = .3f)))
            }
            IconButton({ c.prev?.let { r.go(it) } }, enabled = c.prev != null) { Icon(Ic.next, t("prevCh"), Modifier.size(22.dp), tint = if (c.prev != null) p.fg else p.muted) }
        }
        Text("⁦${progress(r.at, c)}% · ${t("minLeft", minutesLeft(r.at, c))}⁩", Modifier.fillMaxWidth(), color = p.muted, fontSize = 11.sp, textAlign = TextAlign.Center)
        Row(Modifier.fillMaxWidth().padding(bottom = 2.dp)) {
            Tool(Ic.index, t("rdIndex"), p) { open("index") }
            Tool(Ic.textAa, t("rdDisplay"), p) { open("look") }
            // pages don't glide. A tap runs it, a long press its speed
            if (!l.paged) Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).combinedClickable(onLongClick = { speedOpen = !speedOpen }) { r.auto = !r.auto; if (r.auto) speedOpen = false }.padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(if (r.auto) Ic.pause else Ic.play, null, Modifier.size(22.dp), tint = if (r.auto) on else p.fg)
                Text(t("autoScroll"), Modifier.padding(top = 3.dp), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
@Composable
private fun RowScope.Tool(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, p: Paper, go: () -> Unit) =
    Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(onClick = go).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, label, Modifier.size(22.dp), tint = p.fg)
        Text(label, Modifier.padding(top = 3.dp), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }

/** reading aloud: it stays up over the page, the bars or not */
@Composable
private fun SpeechBar(s: ReadAloud.Now, p: Paper, more: () -> Unit) =
    Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(99.dp)).background(if (p.light) Color(0xFFE8DFC8) else Color(0xFF262626)), verticalAlignment = Alignment.CenterVertically) {
        IconButton({ ReadAloud.stop() }) { Icon(Ic.x, t("close"), Modifier.size(18.dp)) }
        Spacer(Modifier.weight(1f))
        IconButton({ ReadAloud.skip(1) }) { Icon(Ic.prev, t("nextPara"), Modifier.size(20.dp)) }
        IconButton({ ReadAloud.toggle() }, Modifier.background(Red, CircleShape).size(40.dp)) { Icon(if (s.playing) Ic.pause else Ic.play, t(if (s.playing) "pause" else "play"), Modifier.size(20.dp), tint = Color.White) }
        IconButton({ ReadAloud.skip(-1) }) { Icon(Ic.next, t("prevPara"), Modifier.size(20.dp)) }
        Spacer(Modifier.weight(1f))
        TextButton(more) { Text("⁦${ReadAloud.speed}x⁩", color = LocalContentColor.current, fontSize = 13.sp); if (ReadAloud.sleepAt > 0) Icon(Ic.timer, null, Modifier.padding(start = 4.dp).size(14.dp), tint = Red) }
    }

/** a search in the chapter: every match lit, the arrows going from one to the next; tashkeel doesn't matter (Novels.findRe) */
@Composable
private fun FindBar(r: Rd, c: NovelChapter, p: Paper) {
    val q = r.find.orEmpty()
    val hits = remember(q, c.id) { Novels.findRe(q)?.let { re -> c.paras.flatMapIndexed { i, s -> re.findAll(s).map { i }.toList() } }.orEmpty() }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val show = { i: Int -> if (hits.isNotEmpty()) { r.findAt = (i + hits.size) % hits.size; r.jump = Spot(c.slug, hits[r.findAt].toDouble()) } }
    LaunchedEffect(hits) { r.findAt = 0; hits.firstOrNull()?.let { r.jump = Spot(c.slug, it.toDouble()) } }
    Row(Modifier.fillMaxWidth().background(p.bg).statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton({ r.find = null }) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) }
        TextField(q, { r.find = it }, Modifier.weight(1f).focusRequester(focus), placeholder = { Text(t("rdFindPh"), color = p.muted, maxLines = 1) }, singleLine = true,
            colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red, focusedTextColor = p.fg, unfocusedTextColor = p.fg))
        if (q.isNotBlank()) Text("⁦${if (hits.isEmpty()) 0 else r.findAt + 1}/${hits.size}⁩", color = p.muted, fontSize = 12.sp)
        IconButton({ show(r.findAt - 1) }, enabled = hits.isNotEmpty()) { Icon(Ic.caretUp, null, Modifier.size(18.dp)) }
        IconButton({ show(r.findAt + 1) }, enabled = hits.isNotEmpty()) { Icon(Ic.caretDown, null, Modifier.size(18.dp)) }
    }
}

// ---------- the sheets ----------
@Composable
private fun SheetTitle(s: String) = Text(s, Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 6.dp), color = Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
@Composable
private fun <T> Choices(opts: List<Pair<T, String>>, cur: T, pick: (T) -> Unit) = Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    opts.forEach { (v, label) -> FilterChip(cur == v, { pick(v) }, { Text(label) }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Red, selectedLabelColor = Color.White)) }
}
@Composable
private fun Stepper(label: String, value: String, down: () -> Unit, up: () -> Unit) = Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(label, Modifier.weight(1f))
    IconButton(down) { Icon(Ic.minus, null, Modifier.size(18.dp)) }
    Text("⁦$value⁩", Modifier.widthIn(min = 40.dp), fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    IconButton(up) { Icon(Ic.plus, null, Modifier.size(18.dp)) }
}
@Composable
private fun Toggle(label: String, on: Boolean, set: (Boolean) -> Unit) = Row(Modifier.fillMaxWidth().clickable { set(!on) }.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(label, Modifier.weight(1f)); Switch(on, set, colors = SwitchDefaults.colors(checkedTrackColor = Red))
}

/** how the page looks: no dimming behind it, the text changing as it's set */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LookSheet(l: Look, set: (Look) -> Unit, done: () -> Unit) = ModalBottomSheet(done, containerColor = CardC, contentColor = Color.White, scrimColor = Color.Transparent) {
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            PAPERS.forEach { (k, p) ->
                Column(Modifier.clip(RoundedCornerShape(10.dp)).clickable { set(l.copy(paper = k)) }.padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(52.dp).clip(CircleShape).background(p.bg).border(if (l.paper == k) 2.dp else 1.dp, if (l.paper == k) Red else Color(0x44FFFFFF), CircleShape), Alignment.Center) { Text("أب", color = p.fg, fontWeight = FontWeight.Bold) }
                    Text(t("paper_$k"), Modifier.padding(top = 4.dp), fontSize = 12.sp)
                }
            }
        }
        SheetTitle(t("rdFont"))
        Choices(FONTS.map { it.first to t(it.second) }, l.font) { set(l.copy(font = it)) }
        Spacer(Modifier.height(6.dp))
        Stepper(t("rdSize"), "${l.size}", { set(l.copy(size = (l.size - 1).coerceAtLeast(12))) }, { set(l.copy(size = (l.size + 1).coerceAtMost(40))) })
        Stepper(t("rdLine"), "%.1f".format(java.util.Locale.US, l.line), { set(l.copy(line = ((l.line * 10 - 1) / 10).coerceAtLeast(1.2f))) }, { set(l.copy(line = ((l.line * 10 + 1) / 10).coerceAtMost(3f))) })
        Stepper(t("rdGap"), "${l.gap}", { set(l.copy(gap = (l.gap - 2).coerceAtLeast(0))) }, { set(l.copy(gap = (l.gap + 2).coerceAtMost(40))) })
        Stepper(t("rdMargin"), "${l.margin}", { set(l.copy(margin = (l.margin - 4).coerceAtLeast(4))) }, { set(l.copy(margin = (l.margin + 4).coerceAtMost(64))) })
        Toggle(t("rdJustify"), l.justify) { set(l.copy(justify = it)) }
        Toggle(t("rdIndent"), l.indent) { set(l.copy(indent = it)) }
        SheetTitle(t("rdBright"))
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Ic.sun, null, Modifier.size(18.dp))
            // the phone's own until it's moved; the lowest still lights the screen (0 is off, on some phones)
            Slider(if (l.bright < 0) .5f else l.bright, { set(l.copy(bright = it.coerceAtLeast(.01f))) }, Modifier.weight(1f).padding(horizontal = 10.dp), colors = SliderDefaults.colors(thumbColor = Red, activeTrackColor = Red))
            FilterChip(l.bright < 0, { set(l.copy(bright = if (l.bright < 0) .5f else -1f)) }, { Text(t("rdAuto")) }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Red, selectedLabelColor = Color.White))
        }
        SheetTitle(t("readingMode"))
        Choices(listOf(false to t("rdScroll"), true to t("rdPages")), l.paged) { set(l.copy(paged = it)) }
        SheetTitle(t("rdRotate"))
        Choices(listOf("" to t("rdAuto"), "p" to t("rotPortrait"), "l" to t("rotLand")), l.rotate) { set(l.copy(rotate = it)) }
        Spacer(Modifier.height(6.dp))
        Toggle(t("continuous"), l.cont) { set(l.copy(cont = it)) }
        Toggle(t("rdVolKeys"), l.vol) { set(l.copy(vol = it)) }
        Toggle(t("rdKeepOn"), l.keepOn) { set(l.copy(keepOn = it)) }
        TextButton({ set(Look(paged = l.paged)) }, Modifier.padding(start = 12.dp, top = 4.dp)) { Text(t("reset"), color = Red) }
    }
}

/** the chapters (a name or number finds one) and this novel's marks */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IndexSheet(r: Rd, c: NovelChapter?, full: NovelFull?, p: Paper, done: () -> Unit) = ModalBottomSheet(done, containerColor = CardC, contentColor = Color.White) {
    var tab by remember { mutableIntStateOf(0) }
    Store.version.intValue
    val marks = Novels.marks(r.novel)
    SecondaryTabRow(tab, containerColor = CardC, contentColor = Color.White, indicator = { TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(tab, matchContentSize = false), color = Red) }) {
        listOf(t("chapters"), "${t("rdMarks")} ${marks.size}").forEachIndexed { i, s -> Tab(tab == i, { tab = i }, text = { Text(s) }, selectedContentColor = Color.White, unselectedContentColor = Muted) }
    }
    if (tab == 0) {
        var q by remember { mutableStateOf("") }
        val all = full?.chs
        if (all == null) Box(Modifier.fillMaxWidth().height(200.dp), Alignment.Center) { CircularProgressIndicator(color = Red) }
        else {
            TextField(q, { q = it }, Modifier.fillMaxWidth().padding(16.dp), placeholder = { Text(t("jumpCh")) }, singleLine = true, leadingIcon = { Icon(Ic.search, null, Modifier.size(18.dp)) },
                shape = RoundedCornerShape(6.dp), colors = TextFieldDefaults.colors(focusedContainerColor = Color(0x14FFFFFF), unfocusedContainerColor = Color(0x14FFFFFF), focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
            val re = remember(q) { Novels.findRe(q) }
            val shown = remember(all, re) { if (re == null) all else all.filter { it.n.startsWith(q.trim()) || re.containsMatchIn(it.title) } }
            val seen = Store["novelSeen"]
            LazyColumn(state = rememberLazyListState(maxOf(0, shown.indexOfFirst { it.slug == c?.slug } - 3))) {
                items(shown, { it.id }) { x ->
                    Row(Modifier.fillMaxWidth().clickable { done(); r.go(x.slug) }.padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${t("chapter")} ${x.n}", color = if (x.slug == c?.slug) Red else if (seen.has(x.id)) Muted else Color.White, fontWeight = if (x.slug == c?.slug) FontWeight.Bold else FontWeight.Normal, fontSize = 14.sp)
                            val name = if (x.title.isNotEmpty()) x.title else produceState("", x.id) { value = Novels.chapterName(r.novel, x.slug) }.value
                            if (name.isNotEmpty()) Text(name, color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (Downloads.done(Novels.dlId(r.novel, x.slug))) Icon(Ic.download, t("offline"), Modifier.padding(horizontal = 8.dp).size(14.dp), tint = Muted)
                        if (seen.optInt(x.id) == 2) ReadBadge()
                    }
                }
            }
        }
    } else if (marks.isEmpty()) Text(t("rdNoMarks"), Modifier.fillMaxWidth().padding(32.dp), color = Muted, textAlign = TextAlign.Center)
    else LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        items(marks) { m ->
            Row(Modifier.fillMaxWidth().clickable { done(); r.go(m.optString("ch"), m.optInt("p").toDouble()) }.padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (m.optString("kind") == "hl") Ic.highlight else Ic.bookmarkFill, null, Modifier.size(18.dp), tint = if (m.optString("kind") == "hl") Color(0xFFF5C518) else Red)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text("${t("chapter")} ${m.optString("n")}", color = Muted, fontSize = 12.sp)
                    Text(m.optString("text"), fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                IconButton({ Novels.dropMark(r.novel, m) }) { Icon(Ic.trash, t("del"), Modifier.size(18.dp), tint = Muted) }
            }
        }
    }
}

/** a long-pressed paragraph's actions */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ParaSheet(r: Rd, c: NovelChapter, i: Int, title: String, poster: String, done: () -> Unit) = ModalBottomSheet(done, containerColor = CardC, contentColor = Color.White) {
    val ctx = LocalContext.current
    val clip = androidx.compose.ui.platform.LocalClipboardManager.current
    val text = c.paras.getOrNull(i).orEmpty()
    Store.version.intValue
    Text(text, Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 10.dp), color = Muted, fontSize = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis, style = LocalTextStyle.current.copy(textDirection = TextDirection.ContentOrRtl))
    val opt = @Composable { icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, on: Boolean, go: () -> Unit ->
        Row(Modifier.fillMaxWidth().clickable { go(); done() }.padding(horizontal = 24.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(22.dp), tint = if (on) Red else Color.White); Text(label, Modifier.padding(start = 16.dp), fontSize = 16.sp)
        }
    }
    opt(Ic.headphones, t("ttsReadFrom"), false) { ReadAloud.start(r.novel, title, poster, c, i) }
    val bm = Novels.marked(r.novel, c.slug, i, "mark"); val hl = Novels.marked(r.novel, c.slug, i, "hl")
    opt(if (bm) Ic.bookmarkFill else Ic.bookmark, t(if (bm) "rdMarkRemove" else "rdMark"), bm) { Novels.toggleMark(r.novel, c, i, "mark") }
    opt(Ic.highlight, t(if (hl) "rdUnhighlight" else "rdHighlight"), hl) { Novels.toggleMark(r.novel, c, i, "hl") }
    opt(Ic.copy, t("copy"), false) { clip.setText(AnnotatedString(text)); toast(t("copied")) }
    opt(Ic.share, t("share"), false) { runCatching { ctx.startActivity(android.content.Intent.createChooser(android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, text), t("share"))) } }
    Spacer(Modifier.navigationBarsPadding().height(12.dp))
}

/** the speech: its speed, its voice (this phone's Arabic ones), and stopping by itself for reading in bed */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VoiceSheet(done: () -> Unit) = ModalBottomSheet(done, containerColor = CardC, contentColor = Color.White) {
    Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 16.dp)) {
        SheetTitle(t("ttsSpeed"))
        Choices(listOf(.75f, 1f, 1.25f, 1.5f, 1.75f, 2f).map { it to "⁦${it}x⁩" }, ReadAloud.speed) { ReadAloud.changeSpeed(it) }
        val voices = remember { ReadAloud.voices() }
        var cur by remember { mutableStateOf(ReadAloud.voice()) }
        if (voices.size > 1) {
            SheetTitle(t("ttsVoice"))
            Choices(voices.mapIndexed { i, v -> v.name to t("voiceN", i + 1) }, cur) { n -> voices.find { it.name == n }?.let { ReadAloud.setVoice(it); cur = n } }
        }
        SheetTitle(t("ttsSleep"))
        val mins = remember { mutableIntStateOf(if (ReadAloud.sleepAt > 0) -1 else 0) }
        Choices(listOf(0 to t("ttsOff"), 15 to t("minutesN", 15), 30 to t("minutesN", 30), 60 to t("minutesN", 60)), mins.intValue) { m ->
            mins.intValue = m
            ReadAloud.sleepAt = if (m == 0) 0 else System.currentTimeMillis() + m * 60_000L
        }
    }
}
