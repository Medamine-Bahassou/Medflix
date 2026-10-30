package com.medanime.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import kotlinx.coroutines.launch
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.runtime.withFrameNanos
import androidx.compose.foundation.combinedClickable
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import kotlinx.coroutines.isActive
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import androidx.compose.ui.graphics.asImageBitmap
import coil3.request.allowHardware
import coil3.request.maxBitmapSize
import coil3.toBitmap
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.flow.flow
import org.json.JSONObject

private class MangaHome(val hot: List<Card>, val latest: List<Card>, val popular: List<Card>, val fresh: List<Card>, val slides: List<Slide>)

/** Manga: MeshManga's catalogue with MangaTek's merged in (manga.js mangaHome) */
@Composable
fun MangaHomeScreen(nav: Nav) {
    val (l, refresh) = loadedOnce("manga", quiet = true) { f ->
        coroutineScope {
            val hot = async { Manga.hot(f) }
            val latest = async { Manga.latest(f) }
            val popular = async { Manga.popular(f) }
            val fresh = async { Manga.fresh(f) }
            MangaHome(hot.await(), latest.await(), popular.await(), fresh.await(), mangaSlides(mangaTop(hot.await().take(5))))
        }
    }
    SectionPage(l, refresh, nav, { it.slides }) { d ->
        item { Chips(listOf(t("browseAll") to Screen.MangaBrowse()) + Manga.TYPES.map { Manga.label(Manga.TYPES, it.first) to Screen.MangaBrowse(mapOf("type" to it.first)) }, nav) }
        item { CardRowView(t("continueReading"), continued(setOf("manga")), nav) }
        item { CardRowView(t("mHot"), d.hot, nav, Screen.MangaBrowse(mapOf("is_hot" to "true"))) }
        item { CardRowView(t("mLatest"), d.latest, nav) }
        item { CardRowView(t("mPopular"), d.popular, nav, Screen.MangaBrowse(mapOf("order_by" to "-views_count"))) }
        item { CardRowView(t("mNew"), d.fresh, nav, Screen.MangaBrowse()) }
    }
}

/** browse both sites with filters: search, type, status, sort (manga.js mangaBrowse; its genre filter not yet) */
@Composable
fun MangaBrowseScreen(query: Map<String, String>, nav: Nav) {
    val seen = remember(query) { HashSet<String>() } // one series once across pages
    val go = { edit: MutableMap<String, String>.() -> Unit -> nav.replace(Screen.MangaBrowse(query.toMutableMap().apply(edit).filterValues { it.isNotEmpty() })) }
    PagedGrid(query, { f -> flow { seen.clear(); emit(Manga.browse(query, 1, seen, f)) } }, { Manga.browse(query, it, seen) }, nav) {
        PageTitle(t("manga"), nav)
        var q by rememberSaveable(query) { mutableStateOf(query["search"] ?: "") }
        TextField(q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), placeholder = { Text(t("mSearchPh")) }, singleLine = true,
            leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Ic.x, t("clear"), Modifier.size(18.dp)) } }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { go { put("search", q.trim()) } }), shape = RoundedCornerShape(6.dp),
            colors = TextFieldDefaults.colors(focusedContainerColor = CardC, unfocusedContainerColor = CardC, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val active = listOf("type", "status", "order_by", "is_hot").count { query[it] != null }
            if (active > 0) FilterChip(true, { nav.replace(Screen.MangaBrowse()) }, { Text("${t("reset")} · $active") }, leadingIcon = { Icon(Ic.x, null, Modifier.size(14.dp)) })
            if (query["is_hot"] != null) FilterChip(true, {}, { Text(t("mHot")) })
            Pick(t("f_type"), query["type"], listOf("" to t("all")) + Manga.TYPES.map { it.first to Manga.label(Manga.TYPES, it.first) }) { v -> go { put("type", v) } }
            Pick(t("f_status"), query["status"], listOf("" to t("all")) + Manga.STATUS.map { it.first to Manga.label(Manga.STATUS, it.first) }) { v -> go { put("status", v) } }
            Pick(t("f_sort"), query["order_by"], Manga.SORT.map { it.first to t(it.second) }) { v -> go { put("order_by", v) } }
        }
    }
}

/** a filter chip: its name, or the value picked; a menu of the options */
@Composable
fun Pick(name: String, cur: String?, opts: List<Pair<String, String>>, pick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        val on = !cur.isNullOrEmpty()
        FilterChip(on, { open = true }, { Text(opts.find { it.first == cur && on }?.second ?: name) }, trailingIcon = { Icon(Ic.caretDown, null, Modifier.size(12.dp)) },
            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Red, selectedLabelColor = Color.White))
        DropdownMenu(open, { open = false }, containerColor = CardC) {
            opts.forEach { (v, label) -> DropdownMenuItem({ Text(label) }, { open = false; pick(v) }, trailingIcon = { if (v == (cur ?: "")) Icon(Ic.check, null, Modifier.size(16.dp), tint = Red) }) }
        }
    }
}

/** a series: both sites' chapters, newest first (manga.js mangaSeries) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MangaSeriesScreen(id: String, nav: Nav) {
    val (l, refresh) = loadedOnce(id, quiet = true) { f -> Manga.full(id, f) }
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { full ->
            val s = full.s
            if (s.id != id) return@Body LaunchedEffect(s.id) { nav.replace(Screen.MangaSeries(s.id)) } // a MangaTek copy of a MangaSwat series
            Store.version.intValue
            val r = Store["manga"].optJSONObject(id)
            val seen = Store["mangaSeen"]
            val start = r?.let { it.optString("chapterId") to t("resumeCh", Manga.chNum(it.opt("n"))) } ?: full.chs.lastOrNull()?.let { it.id to t("read") }
            DetailPage(s.cover, s.poster, s.title, s.alt,
                listOfNotNull(s.type.takeIf { it.isNotEmpty() }?.let { Manga.typeName(it) to false }, s.status.takeIf { it.isNotEmpty() }?.let { Manga.label(Manga.STATUS, it) to false },
                    s.rating.takeIf { it.isNotEmpty() }?.let { "★ $it" to true }, t("views", "%,d".format(s.views)) to false) + s.genres.map { it to false },
                s.story, {
                    start?.let { (cid, label) -> PlayButton(label) { nav.go(Screen.MangaRead(cid)) } }
                    ListButton("/manga/series/$id", s.title, s.poster, "manga")
                    NotifyButton("/manga/series/$id", s.title, s.poster, full.chs.firstOrNull()?.id ?: "")
                }, emptyList(), nav, t("chapters"),
                full.chs.map { Numbered(it.n, seen.has(it.id), r?.optString("chapterId") == it.id, Screen.MangaRead(it.id), it.id, com.medanime.app.Downloads.done("manga:${it.id}"), seen.optInt(it.id) == 2) }, t("jumpCh"),
                // several chapters: mark them read or unread, download them, or delete their saved copies (manga.js acts)
                acts = { ids -> listOfNotNull("read" to t("markRead"), "unread" to t("markUnread"),
                    if (ids.any { !com.medanime.app.Downloads.done("manga:$it") }) "dl" to t("downloadShort") else null,
                    if (ids.any { com.medanime.app.Downloads.done("manga:$it") }) "del" to t("delDownloads") else null) },
                run = { v, ids ->
                    when (v) {
                        "read" -> ids.forEach { seen.put(it, 2) }
                        "unread" -> ids.forEach { seen.remove(it) }
                        "dl" -> com.medanime.app.Downloads.chapters(s.id, s.title, s.poster, full.chs.filter { it.id in ids && !com.medanime.app.Downloads.done("manga:${it.id}") }.reversed()) // oldest first
                        "del" -> ids.forEach { com.medanime.app.Downloads.delete("manga:$it") }
                    }
                    Store.persist("mangaSeen")
                })
        }
    }
}

private class Reading(val c: MChapter, val chs: List<Ch>, val sid: String, val title: String, val poster: String, val alts: Map<String, List<Ch>>) // alts: a number's copies

// the reader's lock outlives its chapters (they replace each other), as manga.js's rdLocked
private var rdLocked by mutableStateOf(false)

// a downloaded chapter opens from its saved copy straight away, without waiting for the site (online or not)
private suspend fun chapterOf(cid: String): MChapter {
    val dl = com.medanime.app.Downloads.of("manga:$cid")?.takeIf { it.optString("state") == "done" && (it.optJSONArray("files")?.length() ?: 0) > 0 } ?: return Manga.chapter(cid)
    val files = dl.getJSONArray("files"); val meta = dl.optJSONObject("meta")
    return MChapter(cid, dl.optString("ep"), meta?.optString("prev")?.ifEmpty { null }, meta?.optString("next")?.ifEmpty { null }, dl.optString("show").substringAfterLast('/'),
        dl.optString("title"), dl.optString("poster"), (0 until files.length()).map { java.io.File(files.getString(it)).toURI().toString() })
}

/**
 * the reader: the chapter's pages down the screen, or one per screen swiped sideways (horizontal mode); a tap in the middle
 * shows or hides the bars; locked, they stay hidden (manga.js mangaReader). Continuous (the default), the next chapter's
 * pages follow this one's end in the same list as it's reached; off, the end has a next-chapter button
 */
@OptIn(FlowPreview::class, ExperimentalMaterial3Api::class)
@Composable
fun MangaReaderScreen(cid: String, nav: Nav) {
    val (l, retry) = loadedOnce(cid) { _ ->
        val c = chapterOf(cid)
        // the series as listed (a MangaTek chapter may belong to a MangaSwat series); prev / next walk its merged chapter list
        val full = runCatching { Manga.full(c.serieId) }.getOrNull()
        Reading(c, full?.chs ?: emptyList(), full?.s?.id ?: c.serieId, full?.s?.title ?: c.serieTitle, full?.s?.poster ?: c.seriePoster, full?.alts ?: emptyMap())
    }
    var lockBackAt by remember { mutableLongStateOf(0L) }
    // locked: the first back only warns, a second one within 2s leaves
    BackHandler(rdLocked) { if (System.currentTimeMillis() - lockBackAt < 2000) nav.back() else { lockBackAt = System.currentTimeMillis(); toast(t("backAgain")) } }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Body(l, retry) { d ->
            // the chapters in the list, in order; each takes its pages + its end as items. Items are keyed by chapter + page:
            // a chapter put before them shifts their indexes, and the list and pager stay on the item they showed
            val chain = remember(cid) { mutableStateListOf(d.c) }
            // item g: its chapter k, its page there (the chapter's page count: its end), and the chapter's first item. Reads
            // the chain on each call: the effects below keep the first composition's lambdas
            val of = { g: Int ->
                var k = 0; var base = 0
                while (k < chain.lastIndex && g >= base + chain[k].images.size + 1) { base += chain[k].images.size + 1; k++ }
                Triple(k, g - base, base)
            }
            val atOf = { ch: MChapter -> d.chs.indexOfFirst { it.id == ch.id || it.n == ch.n } }
            val nextOf = { ch: MChapter -> atOf(ch).let { if (it >= 0) d.chs.getOrNull(it - 1)?.id else ch.next } } // newest first
            val prevOf = { ch: MChapter -> atOf(ch).let { if (it >= 0) d.chs.getOrNull(it + 1)?.id else ch.prev } }
            val horiz = Store["prefs"].optBoolean("mangaH") // horizontal: one page per screen, swiped sideways
            val cont = Store["prefs"].optBoolean("mangaCont", true)
            // every chapter resumes its own spot: page index + how far down that page (tall manhwa strips need the fraction)
            val spots = remember(cid) {
                val r = Store["manga"].optJSONObject(d.sid)
                r?.optJSONObject("spots") ?: JSONObject().apply { if (r != null) put(r.optString("chapterId"), r.optDouble("page", 0.0)) } // older saves kept one spot
            }
            val spot = remember(cid) { spots.optDouble(d.c.id, 0.0) }
            // the item at the top (or the pager's page): which chapter is being read, for the bars, the history and the spot
            // kept as chapter + page, not an index: a chapter put before it would point it at another one for a frame
            var top by remember(cid) { mutableStateOf(d.c.id to spot.toInt()) }
            val k = chain.indexOfFirst { it.id == top.first }.coerceAtLeast(0)
            val base = chain.take(k).sumOf { it.images.size + 1 }
            val g = base + top.second
            val c = chain[k]
            val follow = { i: Int -> top = of(i).let { (ci, p) -> chain[ci].id to p } }
            val next = nextOf(c); val prev = prevOf(c)
            LaunchedEffect(c.id) {
                Store["manga"].put(d.sid, JSONObject().put("id", d.sid).put("title", d.title).put("poster", d.poster).put("chapterId", c.id).put("n", c.n).put("spots", spots).put("at", System.currentTimeMillis()))
                if (!Store["mangaSeen"].has(c.id)) Store["mangaSeen"].put(c.id, 1) // 1: opened, 2: read to the last page
                Store.persist("manga", true); Store.persist("mangaSeen", true)
            }
            // continuous: the next chapter is fetched as the last one's last pages come up; failed, its end has the button
            val tail = chain.last(); val tailNext = nextOf(tail)
            val near = cont && tailNext != null && g >= chain.dropLast(1).sumOf { it.images.size + 1 } + tail.images.size - 3
            var failed by remember(cid) { mutableStateOf<String?>(null) }
            LaunchedEffect(near, tailNext) {
                if (near) try { chapterOf(tailNext!!).let { x -> if (chain.none { it.id == x.id }) chain.add(x) } } // the same one twice: stop there
                catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; failed = tailNext }
            }
            // and the previous one as the first one's top comes up: scrolling back up goes on into it (failed: the prev button)
            val headPrev = prevOf(chain.first())
            val nearTop = cont && headPrev != null && g < 2
            LaunchedEffect(nearTop, headPrev) {
                if (nearTop) try { chapterOf(headPrev!!).let { x -> if (chain.none { it.id == x.id }) { measure(x.images.takeLast(3)); chain.add(0, x) } } }
                catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e }
            }
            val keyOf = { i: Int -> of(i).let { (ci, p) -> "${chain[ci].id}:$p" } }
            // and the pages just above the top one, so scrolling back up they come in at their size
            LaunchedEffect(g, chain.size) { measure((g - 3 until g).filter { it >= 0 }.mapNotNull { of(it).let { (ci, p) -> chain[ci].images.getOrNull(p) } }) }
            var bars by remember { mutableStateOf(true) }
            val showBars = bars && !rdLocked
            // its bars away (reading, or locked): the phone's status and navigation bars too, the pages on the whole screen;
            // a swipe from an edge shows them for a moment. leaving the reader brings them back
            val sys = remember { androidx.core.view.WindowCompat.getInsetsController(Net.activity.window, Net.activity.window.decorView) }
            LaunchedEffect(showBars) {
                sys.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                if (showBars) sys.show(androidx.core.view.WindowInsetsCompat.Type.systemBars()) else sys.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            }
            DisposableEffect(Unit) { onDispose { sys.show(androidx.core.view.WindowInsetsCompat.Type.systemBars()) } }
            // where the reader is: item i (+ how far down it; null: unknown, the spot stays); last, the last item in view: a
            // chapter's last page there marks it read (not the spot: it peeks in while the page above is still being read)
            val reached = { i: Int?, frac: Double, last: Int ->
                if (i != null) of(i).let { (ci, p) -> if (p < chain[ci].images.size) spots.put(chain[ci].id, p + minOf(.999, frac)) }
                var b = 0
                chain.forEach { ch ->
                    if (ch.images.isNotEmpty() && last >= b + ch.images.size - 1 && Store["mangaSeen"].optInt(ch.id) != 2) { Store["mangaSeen"].put(ch.id, 2); Store.persist("mangaSeen", true) }
                    b += ch.images.size + 1
                }
                Store.persist("manga", true)
            }
            // here: the bottom bar shows where it is. Not saveable: the screen holder put back last time's pixel offset over the
            // 480dp placeholders, which spilled into the pages below; the saved spot places it instead
            val list = remember(cid) { androidx.compose.foundation.lazy.LazyListState(spot.toInt()) }
            // auto-scroll (scroll mode, manga.js autoScroll): the pages glide down at 0.5x-10x (40dp/s per 1x, remembered). A long
            // press on its button opens the speed row; it runs until that button stops it (or another chapter opens)
            var auto by remember(cid) { mutableStateOf(false) }
            var speedOpen by remember { mutableStateOf(false) }
            var speed by remember { mutableFloatStateOf(Store["prefs"].optDouble("mangaSpeed", 3.0).toFloat()) }
            val setSpeed = { v: Float -> speed = (Math.round(v * 2) / 2f).coerceIn(.5f, 10f); Store["prefs"].put("mangaSpeed", speed.toDouble()); Store.persist("prefs", true) }
            val dens = androidx.compose.ui.platform.LocalDensity.current.density
            // gliding, nobody touches the phone: the screen stays on until it stops
            val view = androidx.compose.ui.platform.LocalView.current
            DisposableEffect(auto, horiz) { view.keepScreenOn = auto && !horiz; onDispose { view.keepScreenOn = false } }
            LaunchedEffect(auto, horiz) {
                if (!auto || horiz) return@LaunchedEffect
                var last = withFrameNanos { it }
                while (auto) {
                    val now = withFrameNanos { it }
                    val dy = (now - last) / 1e9f * 40f * speed * dens; last = now
                    // a finger dragging the pages takes the scroll over meanwhile: the glide goes on after it
                    try { list.scrollBy(dy) } catch (e: kotlinx.coroutines.CancellationException) { if (!kotlinx.coroutines.currentCoroutineContext().isActive) throw e }
                }
            }
            // zoom, 1x-4x (manga.js readerZoom): pinched around the fingers; zoomed, one finger also pans sideways while the
            // pages still scroll under it. A tap shows or hides the bars (no double tap: waiting for one held every tap back)
            var z by remember(cid) { mutableFloatStateOf(1f) }
            var off by remember(cid) { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
            var box by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
            // the content under f stays put; kept inside the screen's edges
            fun zoomTo(nz0: Float, f: androidx.compose.ui.geometry.Offset, pan: androidx.compose.ui.geometry.Offset = androidx.compose.ui.geometry.Offset.Zero) {
                val nz = nz0.coerceIn(1f, 4f)
                val t = f - (f - off) * (nz / z) + pan
                z = nz
                off = androidx.compose.ui.geometry.Offset(t.x.coerceIn(box.width * (1 - nz), 0f), t.y.coerceIn(box.height * (1 - nz), 0f))
            }
            val toggle = Modifier.onSizeChanged { box = it }
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        do {
                            val e = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial) // before the list scrolls or the pager turns
                            val down = e.changes.filter { it.pressed }
                            if (down.size >= 2) { zoomTo(z * e.calculateZoom(), e.calculateCentroid(), e.calculatePan()); e.changes.forEach { it.consume() } }
                            else if (z > 1f && down.size == 1) zoomTo(z, androidx.compose.ui.geometry.Offset.Zero, androidx.compose.ui.geometry.Offset(down[0].positionChange().x, 0f)) // not consumed: the list scrolls too
                        } while (e.changes.any { it.pressed })
                    }
                }
                .pointerInput(Unit) { detectTapGestures(onTap = { if (!rdLocked) bars = !bars }) }
                .graphicsLayer { scaleX = z; scaleY = z; translationX = off.x; translationY = off.y; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f) }
            // chapter k's end: between chained chapters a plain divider; the last one's has the next chapter coming (continuous),
            // or its button
            val end: @Composable (Int) -> Unit = { ci ->
                val ch = chain[ci]; val nx = nextOf(ch)
                Column(Modifier.fillMaxWidth().padding(vertical = if (ci < chain.lastIndex) 24.dp else 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (ch.images.isEmpty()) Text(t("noImages"), Modifier.padding(bottom = 8.dp), fontWeight = FontWeight.Bold)
                    Text("${t("endOfChapter")} ${ch.n}", color = Muted)
                    if (ci == chain.lastIndex) {
                        Spacer(Modifier.height(12.dp))
                        if (nx == null) GhostButton(t("chapters"), Ic.manga) { nav.replace(Screen.MangaSeries(d.sid)) }
                        else if (cont && failed != nx) CircularProgressIndicator(Modifier.size(28.dp), color = Red)
                        else RedButton(t("nextCh")) { nav.replace(Screen.MangaRead(nx)) }
                    }
                }
            }
            var seekAt by remember { mutableLongStateOf(0L) } // the last jump from the scrollbar
            // auto-scrolling, the pages never stop moving: the bars a tap shows stay 4s (as a video player's do) instead of going
            // with the next half-second's scroll; not while the speed row is open, and a jump from the scrollbar gives them 4s more
            LaunchedEffect(showBars, auto, speedOpen, seekAt) { if (auto && showBars && !speedOpen) { kotlinx.coroutines.delay(4000); bars = false } }
            if (horiz) {
                val pager = androidx.compose.foundation.pager.rememberPagerState(g) { chain.sumOf { it.images.size + 1 } }
                LaunchedEffect(pager) { snapshotFlow { pager.currentPage }.collect(follow) }
                LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect { if (it > 0) bars = false; reached(it, 0.0, it) } }
                androidx.compose.foundation.pager.HorizontalPager(pager, Modifier.fillMaxSize().then(toggle), userScrollEnabled = z == 1f, key = keyOf) { i -> // zoomed: the swipe pans, not turns
                    val (pk, p) = of(i)
                    // each page scrolls on its own when taller than the screen
                    if (p < chain[pk].images.size) Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), Alignment.Center) {
                        MangaPage(chain[pk].images[p], Modifier.fillMaxWidth())
                    } else Box(Modifier.fillMaxSize(), Alignment.Center) { end(pk) }
                }
                // which page of how many (an LTR isolate: "3 / 15" in Arabic too); above the bar while it shows, not on the end page
                val p = pager.currentPage - base
                if (p < c.images.size) Text("⁦${p + 1} / ${c.images.size}⁩",
                    Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = if (showBars) 76.dp else 16.dp)
                        .background(Color(0x99000000), RoundedCornerShape(99.dp)).padding(horizontal = 12.dp, vertical = 4.dp),
                    color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            } else {
                // each item's drawn height (px): its placeholder when it's drawn again (scrolled back to, nothing moves), and what a
                // spot's fraction is of, saved and restored alike
                val heights = remember(cid) { mutableStateMapOf<String, Int>() }
                // the saved spot's fraction down its page: only known once that page is drawn. Until then nothing is saved, or the
                // first save would overwrite the spot with the page's top; a scroll by hand first gives up
                var restored by remember(cid) { mutableStateOf(spot == 0.0 || spot.toInt() >= d.c.images.size) }
                LaunchedEffect(cid) {
                    if (restored) return@LaunchedEffect
                    val at = spot.toInt(); val key = "${d.c.id}:$at"
                    val byHand = snapshotFlow { if (list.isScrollInProgress) true else if (heights[key] != null) false else null }.first { it != null }!!
                    // its index now: the previous chapter may have come in above meanwhile
                    if (!byHand) list.scrollToItem(chain.takeWhile { it.id != d.c.id }.sumOf { it.images.size + 1 } + at, Math.round((spot - at) * heights[key]!!).toInt())
                    restored = true
                }
                // the spot now, all read from the list at once: the top item + how far down its laid-out height. Not while that page
                // is still its placeholder (the fraction of 480dp lands elsewhere once it loads), nor before the saved spot is back
                val save = {
                    val i = list.firstVisibleItemIndex
                    val h = heights[keyOf(i)]
                    if (restored) reached(if (h != null) i else null, list.firstVisibleItemScrollOffset.toDouble() / maxOf(1, h ?: 1),
                        list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0)
                }
                LaunchedEffect(list) { snapshotFlow { list.firstVisibleItemIndex }.collect(follow) }
                // every half second while it moves (auto-scroll never settles, a debounce never fired), and once more on leaving
                LaunchedEffect(list) {
                    snapshotFlow { list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset }.sample(500).filter { restored }.collect { (i, _) ->
                        if (i > 0 && !auto && System.currentTimeMillis() - seekAt > 1000) bars = false // reading: the bars slide away, and come back on a tap; not while sliding the scrollbar in them, nor as auto-scroll moves the pages
                        save()
                    }
                }
                DisposableEffect(list) { onDispose { save() } }
                LazyColumn(Modifier.fillMaxSize().then(toggle), list) {
                    chain.forEachIndexed { ci, ch ->
                        itemsIndexed(ch.images, { i, _ -> "${ch.id}:$i" }) { i, src -> MangaPage(src, Modifier.fillMaxWidth(), heights["${ch.id}:$i"]) { heights["${ch.id}:$i"] = it } }
                        item("${ch.id}:${ch.images.size}") { end(ci) }
                    }
                }
            }
            var picker by remember { mutableStateOf(false) }
            var menu by remember { mutableStateOf(false) }
            var page by remember { mutableStateOf("") } // the menu's page: "" its options, "source" or "mode" a choice
            var delAsk by remember { mutableStateOf(false) }
            val scope = rememberCoroutineScope()
            // its saved copy deleted (as on the downloads page, asked first): read from its files, the site's copy takes its
            // place in the list (same items, so the place stays); offline, its pages are gone
            if (delAsk) AlertDialog({ delAsk = false }, { TextButton({
                    delAsk = false; com.medanime.app.Downloads.delete("manga:${c.id}")
                    val id = c.id
                    if (c.images.firstOrNull()?.startsWith("file:") == true) scope.launch {
                        runCatching { Manga.chapter(id) }.getOrNull()?.let { x -> chain.indexOfFirst { it.id == id }.takeIf { it >= 0 }?.let { chain[it] = x } }
                    }
                }) { Text(t("del"), color = Red) } }, dismissButton = { TextButton({ delAsk = false }) { Text(t("cancel"), color = Color.White) } },
                title = { Text(t("confirmDel", "${d.title} · ${t("chapter")} ${c.n}"), fontSize = 17.sp) }, text = { Text(t("confirmDelHint")) }, containerColor = CardC)
            AnimatedVisibility(showBars, Modifier.align(Alignment.TopCenter), enter = fadeIn(), exit = fadeOut()) {
                Row(Modifier.fillMaxWidth().background(Color(0xE6000000)).statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(nav.back) { Icon(Ic.back, null, Modifier.size(22.dp)) }
                    Column(Modifier.weight(1f).clickable { nav.replace(Screen.MangaSeries(d.sid)) }) {
                        Text(d.title, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${t("chapter")} ${c.n}", color = Muted, fontSize = 12.sp)
                    }
                    // ⋮: this chapter's download and copy (no site names), and how to read
                    Box {
                        IconButton({ page = ""; menu = true }) { Icon(Ic.dots, t("more"), Modifier.size(22.dp)) }
                        DropdownMenu(menu, { menu = false }, containerColor = CardC) {
                            com.medanime.app.Downloads.tick.intValue
                            val done = com.medanime.app.Downloads.done("manga:${c.id}")
                            val alts = d.alts[c.n].orEmpty()
                            val mode = { h: Boolean -> menu = false; Store["prefs"].put("mangaH", h); Store.persist("prefs") }
                            // a choice opens in the menu's place (Android's submenus): a back row, then its options as radios
                            val head: @Composable (String) -> Unit = { title ->
                                DropdownMenuItem({ Text(title, fontWeight = FontWeight.Bold) }, { page = "" }, leadingIcon = { Icon(Ic.back, null, Modifier.size(18.dp)) })
                                HorizontalDivider(color = Color(0x22FFFFFF))
                            }
                            val option: @Composable (String, Boolean, () -> Unit) -> Unit = { label, on, go ->
                                DropdownMenuItem({ Text(label) }, go, leadingIcon = { RadioButton(on, null, Modifier.size(20.dp), colors = RadioButtonDefaults.colors(selectedColor = Red)) })
                            }
                            // a choice in the options: its name, what it is now under it, a chevron to its page
                            val entry: @Composable (String, String, androidx.compose.ui.graphics.vector.ImageVector, String) -> Unit = { title, now, icon, to ->
                                DropdownMenuItem({ Column { Text(title); Text(now, color = Muted, fontSize = 12.sp) } }, { page = to },
                                    leadingIcon = { Icon(icon, null, Modifier.size(18.dp)) }, trailingIcon = { Icon(Ic.next, null, Modifier.size(14.dp), tint = Muted) })
                            }
                            when (page) {
                                "source" -> { head(t("source")); alts.forEachIndexed { i, a -> option(t("sourceN", i + 1), a.id == c.id) { menu = false; if (a.id != c.id) nav.replace(Screen.MangaRead(a.id)) } } }
                                "mode" -> { head(t("readingMode")); option(t("vertical"), !horiz) { mode(false) }; option(t("horizontal"), horiz) { mode(true) } }
                                else -> {
                                    DropdownMenuItem({ Text(t("downloadShort")) }, { menu = false; if (done) toast(t("dlDone")) else com.medanime.app.Downloads.chapters(d.sid, d.title, d.poster, listOf(Ch(c.id, c.n))) },
                                        leadingIcon = { Icon(Ic.download, null, Modifier.size(18.dp), tint = if (done) Red else Color.White) }, trailingIcon = { if (done) Icon(Ic.check, null, Modifier.size(16.dp), tint = Red) })
                                    if (done) DropdownMenuItem({ Text(t("del")) }, { menu = false; delAsk = true }, leadingIcon = { Icon(Ic.trash, null, Modifier.size(18.dp)) })
                                    HorizontalDivider(color = Color(0x22FFFFFF))
                                    if (alts.size > 1) entry(t("source"), t("sourceN", alts.indexOfFirst { it.id == c.id }.coerceAtLeast(0) + 1), Ic.folder, "source")
                                    entry(t("readingMode"), t(if (horiz) "horizontal" else "vertical"), if (horiz) Ic.horiz else Ic.vert, "mode")
                                    DropdownMenuItem({ Text(t("continuous")) }, { Store["prefs"].put("mangaCont", !cont); Store.persist("prefs") }, leadingIcon = { Icon(Ic.refresh, null, Modifier.size(18.dp)) },
                                        trailingIcon = { Switch(cont, null, colors = SwitchDefaults.colors(checkedTrackColor = Red)) })
                                }
                            }
                        }
                    }
                }
            }
            AnimatedVisibility(showBars, Modifier.align(Alignment.BottomCenter), enter = fadeIn(), exit = fadeOut()) {
                // chapter to chapter replaces the page, so back leaves the reader (like the video player)
                Column(Modifier.fillMaxWidth().background(Color(0xE6000000)).navigationBarsPadding().padding(8.dp)) {
                if (speedOpen && !horiz) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ setSpeed(speed - .5f) }) { Icon(Ic.minus, null, Modifier.size(18.dp)) }
                    Slider(speed, { setSpeed(it) }, Modifier.weight(1f), valueRange = .5f..10f, steps = 18, colors = SliderDefaults.colors(thumbColor = Red, activeTrackColor = Red))
                    IconButton({ setSpeed(speed + .5f) }) { Icon(Ic.plus, null, Modifier.size(18.dp)) }
                    Text("⁦${if (speed % 1 == 0f) speed.toInt() else speed}x⁩", Modifier.width(40.dp), color = Color.White, fontSize = 13.sp)
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ rdLocked = true }) { Icon(Ic.lock, t("lockUi"), Modifier.size(20.dp)) }
                    // playing closes the speed row
                    if (!horiz) Box(Modifier.size(48.dp).combinedClickable(onLongClick = { speedOpen = !speedOpen }) { auto = !auto; if (auto) speedOpen = false }, Alignment.Center) {
                        Icon(if (auto) Ic.pause else Ic.play, t("autoScroll"), Modifier.size(20.dp), tint = if (auto) Red else Color.White)
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton({ prev?.let { nav.replace(Screen.MangaRead(it)) } }, enabled = prev != null) { Icon(Ic.prev, t("prevCh"), Modifier.size(22.dp)) }
                    if (d.chs.isNotEmpty()) TextButton({ picker = true }) { Text("${t("chShort")} ${c.n}", color = Color.White, fontSize = 15.sp); Icon(Ic.caretUp, null, Modifier.padding(start = 6.dp).size(14.dp), tint = Color.White) }
                    IconButton({ next?.let { nav.replace(Screen.MangaRead(it)) } }, enabled = next != null) { Icon(Ic.next, t("nextCh"), Modifier.size(22.dp)) }
                }
                if (!horiz && c.images.isNotEmpty()) ReaderScrollbar(list, base, c.images.size) { seekAt = System.currentTimeMillis() } }
            }
            // locked: a faint button brings the bars back
            if (rdLocked) IconButton({ rdLocked = false; bars = true }, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 24.dp).background(Color(0x55000000), androidx.compose.foundation.shape.CircleShape)) {
                Icon(Ic.unlock, t("unlockUi"), Modifier.size(20.dp), tint = Color(0x99FFFFFF))
            }
            if (picker) ModalBottomSheet({ picker = false }, containerColor = CardC) {
                val seen = Store["mangaSeen"]
                LazyColumn(state = rememberLazyListState(maxOf(0, atOf(c) - 3))) {
                    itemsIndexed(d.chs) { _, x ->
                        Row(Modifier.fillMaxWidth().clickable { picker = false; nav.replace(Screen.MangaRead(x.id)) }.padding(horizontal = 24.dp, vertical = 14.dp)) {
                            Text("${t("chapter")} ${x.n}", Modifier.weight(1f), color = if (x.id == c.id) Red else if (seen.has(x.id)) Muted else Color.White, fontWeight = if (x.id == c.id) FontWeight.Bold else FontWeight.Normal)
                            if (com.medanime.app.Downloads.done("manga:${x.id}")) Icon(Ic.download, t("offline"), Modifier.padding(end = 8.dp).size(14.dp), tint = Muted)
                            if (seen.optInt(x.id) == 2) ReadBadge()
                        }
                    }
                }
            }
        }
    }
}

/** a chapter read to its last page: a small grey pill (style.css rd-badge) */
@Composable
internal fun ReadBadge() = Text(t("chRead"), Modifier.padding(start = 8.dp).background(Color(0x1AFFFFFF), RoundedCornerShape(99.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
    color = Color(0xFFCCCCCC), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)

/**
 * the reader's scrollbar (vertical mode), on the left: the thumb follows the place in the chapter; dragging it or tapping
 * the track jumps there. Hidden until scrolled or touched (manga.js rd-scroll)
 */
/**
 * a page as strips of at most 2048px: webtoon pages run 800x9000, and old phones' GPUs (Redmi 9A: 4096px) can't draw a
 * bitmap that tall, so the whole page came out blank
 */
@Composable
private fun MangaPage(src: String, modifier: Modifier, known: Int? = null, onSize: (Int) -> Unit = {}) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val strips by androidx.compose.runtime.produceState<List<androidx.compose.ui.graphics.ImageBitmap>?>(null, src) {
        val req = coil3.request.ImageRequest.Builder(ctx).data(src).memoryCachePolicy(coil3.request.CachePolicy.DISABLED) // the strips are what's kept
            .size(coil3.size.Size.ORIGINAL).allowHardware(false)
            .maxBitmapSize(coil3.size.Size.ORIGINAL).build() // Coil shrinks past 4096px (800x9000 -> 364x4096, blurry): the strips make that needless
        val bmp = ((coil3.SingletonImageLoader.get(ctx).execute(req) as? coil3.request.SuccessResult)?.image ?: return@produceState).toBitmap()
        ratios[src] = bmp.width.toFloat() / bmp.height
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
            (0 until bmp.height step 2048).map { y -> android.graphics.Bitmap.createBitmap(bmp, 0, y, bmp.width, minOf(2048, bmp.height - y)).asImageBitmap() }
        }
    }
    val dens = androidx.compose.ui.platform.LocalDensity.current
    // drawn: its height is told. Until then: the height it had when last drawn, or its shape if measured, else 480dp
    androidx.compose.foundation.layout.Column(modifier.then(when {
        strips != null -> Modifier.onSizeChanged { onSize(it.height) }
        known != null -> Modifier.height(with(dens) { known.toDp() })
        ratios[src] != null -> Modifier.aspectRatio(ratios.getValue(src))
        else -> Modifier.heightIn(min = 480.dp)
    })) {
        strips?.forEach { androidx.compose.foundation.Image(it, null, Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth) }
    }
}

// each page's width / height once decoded: a page that isn't drawn yet takes its shape, not 480dp. Above the page being
// read that matters: a placeholder growing there pushed the page down as it loaded
private val ratios = java.util.concurrent.ConcurrentHashMap<String, Float>()

/** pages measured ahead, decoded small (their download stays in Coil's disk cache for the page itself) */
private suspend fun measure(srcs: List<String>) = coroutineScope {
    srcs.filter { !ratios.containsKey(it) }.map { src -> async {
        val req = coil3.request.ImageRequest.Builder(Net.activity).data(src).memoryCachePolicy(coil3.request.CachePolicy.DISABLED)
            .size(coil3.size.Size(coil3.size.Dimension(256), coil3.size.Dimension.Undefined)).build()
        (coil3.SingletonImageLoader.get(Net.activity).execute(req) as? coil3.request.SuccessResult)?.image?.let { ratios[src] = it.width.toFloat() / it.height }
    } }.forEach { it.await() }
}

/** how far the chapter is read, under the bottom bar's buttons: a tap or a drag jumps there (from the right in Arabic) */
@Composable
private fun ReaderScrollbar(list: androidx.compose.foundation.lazy.LazyListState, base: Int, pages: Int, onSeek: () -> Unit) { // base: the chapter's first item
    val scope = rememberCoroutineScope()
    val frac by remember(base, pages) { derivedStateOf {
        val first = list.layoutInfo.visibleItemsInfo.firstOrNull()
        if (first == null) 0f else ((list.firstVisibleItemIndex - base + list.firstVisibleItemScrollOffset.toFloat() / maxOf(1, first.size)) / pages).coerceIn(0f, 1f)
    } }
    val rtl = androidx.compose.ui.platform.LocalLayoutDirection.current == androidx.compose.ui.unit.LayoutDirection.Rtl
    BoxWithConstraints(Modifier.fillMaxWidth().height(28.dp).padding(horizontal = 12.dp)) {
        val thumb = 14.dp; val track = maxWidth
        // a touch at x (from the left, whatever the language): that share of the chapter
        val go = { x: Float -> onSeek(); val f = (x / constraints.maxWidth).coerceIn(0f, 1f).let { if (rtl) 1 - it else it } * pages; scope.launch { list.scrollToItem(base + f.toInt().coerceAtMost(pages - 1)) } }
        Box(Modifier.fillMaxSize().pointerInput(base, pages, rtl) { detectHorizontalDragGestures(onDragStart = { go(it.x) }) { ch, _ -> go(ch.position.x) } }
            .pointerInput(base, pages, rtl) { detectTapGestures { go(it.x) } }) {
            Box(Modifier.align(Alignment.CenterStart).fillMaxWidth().height(3.dp).background(Color(0x33FFFFFF), RoundedCornerShape(2.dp)))
            Box(Modifier.align(Alignment.CenterStart).fillMaxWidth(frac).height(3.dp).background(Red, RoundedCornerShape(2.dp)))
            Box(Modifier.align(Alignment.CenterStart).offset(x = (track - thumb) * frac).size(thumb).background(Red, androidx.compose.foundation.shape.CircleShape))
        }
    }
}
