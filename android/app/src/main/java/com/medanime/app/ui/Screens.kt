package com.medanime.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first

private fun animeSlides(d: HomePage) = d.hero.map { Slide(it.banner, it.title, it.desc, Screen.Title(it.path), it.watch.takeIf { w -> w.isNotEmpty() }?.let { w -> Screen.Play(w) }) }
fun mangaSlides(top: List<MSeries>) = top.filter { it.cover.isNotEmpty() }.map { s ->
    Slide(s.cover, s.title, s.story, Screen.MangaSeries(s.id), Store["manga"].optJSONObject(s.id)?.optString("chapterId")?.let { Screen.MangaRead(it) })
}
fun filmSlides(items: List<Card>) = items.filter { it.poster.isNotEmpty() }.map { Slide(it.poster, it.title, it.desc, screenFor(it), Screen.CinemaPlay(it.path.removePrefix("/cinema/"))) }
suspend fun mangaTop(items: List<Card>) = coroutineScope { items.map { async { runCatching { Manga.seriesOf(it.path.substringAfterLast('/')) }.getOrNull() } }.map { it.await() }.filterNotNull() }

/** Home: a bit of every section; a site that doesn't answer just leaves its rows out (app.js home) */
private class HomeData(val anime: HomePage?, val hot: List<Card>?, val latest: List<Card>?, val films: List<Card>?, val slides: List<Slide>)

@Composable
fun HomeScreen(nav: Nav) {
    val (l, refresh) = loadedOnce("home") { f ->
        coroutineScope {
            val a = async { runCatching { Witanime.home(f).first() }.getOrNull() }
            val hot = async { runCatching { Manga.hot(f) }.getOrNull() }
            val latest = async { runCatching { Manga.latest(f) }.getOrNull() }
            val films = async { runCatching { Cinema.list("all", 1, f).items }.getOrNull() }
            val m = async { mangaSlides(mangaTop(hot.await()?.take(3) ?: emptyList())) }
            if (a.await() == null && hot.await() == null && films.await() == null) throw java.io.IOException(t("unreachable"))
            // the slider takes turns: anime, manga, film, anime…
            val an = a.await()?.let(::animeSlides)?.take(3) ?: emptyList(); val mg = m.await(); val fl = filmSlides(films.await()?.take(3) ?: emptyList())
            HomeData(a.await(), hot.await(), latest.await(), films.await(), (0 until 3).flatMap { listOfNotNull(an.getOrNull(it), mg.getOrNull(it), fl.getOrNull(it)) })
        }
    }
    SectionPage(l, refresh, nav, { it.slides }) { d ->
        item { CardRowView(t("continueWatching"), continued(setOf("anime", "cinema", "manga")), nav) }
        item { CardRowView(t("myList"), listed(), nav, Screen.MyList) }
        items(d.anime?.rows?.take(2) ?: emptyList(), { it.title }) { CardRowView(it.title, it.items, nav, Screen.Section(it.title)) }
        item { CardRowView(t("mHot"), d.hot, nav, Screen.MangaBrowse(mapOf("is_hot" to "true"))) }
        item { CardRowView(t("mLatest"), d.latest, nav, Screen.Manga) }
        item { CardRowView(t("cinema"), d.films, nav, Screen.Cinema) }
        items(d.anime?.rows?.drop(2) ?: emptyList(), { "r" + it.title }) { CardRowView(it.title, it.items, nav, Screen.Section(it.title)) }
    }
}

/** Anime: witanime's series, films and rows (app.js animeHome) */
@Composable
fun AnimeScreen(nav: Nav) {
    val (l, refresh) = loaded("anime") { Witanime.home(it) }
    SectionPage(l, refresh, nav, ::animeSlides) { d ->
        item { Chips(listOf(t("series") to Screen.Grid(t("series"), "/browse"), t("movies") to Screen.Grid(t("movies"), "/movies")), nav) }
        item { CardRowView(t("continueWatching"), continued(setOf("anime")), nav) }
        items(d.rows, { it.title }) { CardRowView(it.title, it.items, nav, Screen.Section(it.title)) }
    }
}

/** a home row's full listing: the site's own (sorted browse, the season's, films), the latest episodes' pager, else the row (app.js section) */
@Composable
fun SectionScreen(name: String, nav: Nav) = Column {
    PageTitle(name, nav)
    val base = Witanime.SECTIONS[name]
    when {
        base != null -> CardGrid(base, nav)
        name == Witanime.NEW_EPISODES -> PagedGrid(name, { Witanime.newEpisodes(1, it) }, { Witanime.newEpisodes(it).first() }, nav)
        else -> PagedGrid(name, { f -> kotlinx.coroutines.flow.flow { emit(Listing(Witanime.home(f).first().rows.find { it.title == name }?.items ?: emptyList(), 1)) } }, { Listing(emptyList(), 1) }, nav)
    }
}

/** what was long-pressed away, by kind; long-press one to show it again (app.js hiddenView) */
@Composable
fun HiddenScreen(nav: Nav) {
    Store.version.intValue
    val all = Store["hidden"].let { o -> o.keys().asSequence().mapNotNull { o.optJSONObject(it) }.toList() }.sortedByDescending { it.optLong("at") }
        .map { Card(it.optString("path"), it.optString("type"), it.optString("title"), it.optString("poster"), "", "", "", null, it.optString("path")) }
    Column {
        PageTitle(t("hiddenTitle"), nav)
        Text(t("hiddenHint").replace("✕", "…"), Modifier.padding(horizontal = 16.dp), color = Muted, fontSize = 13.sp)
        if (all.isEmpty()) return@Column Empty(t("noHidden"), "")
        CardsGrid(all, nav)
    }
}

/** search: witanime's titles, the movie sites' and manga, a row each (app.js search, without its spelling guesses) */
@Composable
fun SearchScreen(q0: String, nav: Nav) {
    var q by rememberSaveable { mutableStateOf(q0) }
    val typed by produceState(q0.trim(), q) { delay(400); value = q.trim() } // ask once typing stops
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (q.isEmpty()) focus.requestFocus() }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(nav.back) { Icon(Ic.back, null, Modifier.size(22.dp)) }
            TextField(q, { q = it }, Modifier.weight(1f).padding(end = 16.dp, top = 8.dp, bottom = 8.dp).focusRequester(focus), placeholder = { Text(t("searchPh")) }, singleLine = true,
                leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                shape = RoundedCornerShape(6.dp), colors = TextFieldDefaults.colors(focusedContainerColor = CardC, unfocusedContainerColor = CardC, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
        }
        if (typed.isEmpty()) return@Column
        val (l, retry) = loadedOnce(typed) { _ ->
            coroutineScope {
                val a = async { runCatching { Witanime.search(typed).first().items }.getOrNull() }
                val c = async { runCatching { Cinema.search(typed) }.getOrNull() }
                val m = async { runCatching { Manga.browse(mapOf("search" to typed), 1, HashSet()).items }.getOrNull() }
                if (a.await() == null && c.await() == null && m.await() == null) throw java.io.IOException(t("unreachable"))
                Triple(a.await() ?: emptyList(), c.await() ?: emptyList(), m.await() ?: emptyList())
            }
        }
        Body(l, retry) { (a, c, m) ->
            if (a.isEmpty() && c.isEmpty() && m.isEmpty()) return@Body Empty(t("nothing"), t("tryElse"))
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                item { CardRowView(t("anime"), a, nav) }
                item { CardRowView(t("cinema"), c, nav) }
                item { CardRowView(t("manga"), m, nav) }
            }
        }
    }
}

/** my list; pinch the grid for bigger or smaller cards (pinchColumns) */
@Composable
fun MyListScreen(nav: Nav) {
    Store.version.intValue
    val items = listed()
    val nh = Store["hidden"].length()
    Column {
        TopBar(nav)
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(t("myList"), Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 22.sp)
        }
        if (items.isEmpty()) return@Column Empty(t("listEmpty"), t("listHint"))
        CardsGrid(items, nav) {
            if (nh > 0) TextButton({ nav.go(Screen.Hidden) }) { Icon(Ic.eyeSlash, null, Modifier.size(16.dp), tint = Muted); Spacer(Modifier.width(6.dp)); Text(t("openHidden", nh), color = Muted, fontSize = 13.sp) }
        }
    }
}

// ---------- the details page shared by anime, manga and films (app.js det-hero) ----------
class Numbered(val label: String, val seen: Boolean, val last: Boolean, val open: Screen, val id: String = label, val saved: Boolean = false) // id: what picking it hands the actions

/**
 * banner and poster, titles, chips (red: true), story, buttons, info; then a numbered list (episodes, chapters) with
 * jump-to and reverse, and whatever comes before / after it (seasons, related)
 */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun DetailPage(banner: String, poster: String, title: String, alt: String, chips: List<Pair<String, Boolean>>, desc: String,
               buttons: @Composable FlowRowScope.() -> Unit, info: List<Pair<String, String>>, nav: Nav,
               listTitle: String? = null, list: List<Numbered> = emptyList(), jump: String = t("jump"), before: LazyListScope.() -> Unit = {}, after: LazyListScope.() -> Unit = {},
               acts: ((List<String>) -> List<Pair<String, String>>)? = null, run: (String, List<String>) -> Unit = { _, _ -> }) {
    val picks = remember { Picks() } // long-press a tile to pick several (acts: what can be done to them)
    var filter by rememberSaveable { mutableStateOf("") }
    var rev by rememberSaveable { mutableStateOf(false) }
    var more by rememberSaveable { mutableStateOf(false) }
    val shown = (if (rev) list.reversed() else list).filter { filter.isEmpty() || it.label.startsWith(filter) }
    BoxWithConstraints {
        val cols = (maxWidth / 72.dp).toInt().coerceAtLeast(4)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Box { // the poster sits over the banner's lower edge
                    Box(Modifier.fillMaxWidth().height(240.dp)) {
                        AsyncImage(banner, null, Modifier.fillMaxSize().graphicsLayer { alpha = .55f }, contentScale = ContentScale.Crop)
                        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, 1f to Bg)))
                    }
                    IconButton(nav.back, Modifier.padding(4.dp)) { Icon(Ic.back, null, Modifier.size(22.dp)) }
                    Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 150.dp), verticalAlignment = Alignment.Bottom) {
                        if (poster.isNotEmpty()) AsyncImage(poster, null, Modifier.padding(end = 14.dp).width(110.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(6.dp)).background(CardC), contentScale = ContentScale.Crop)
                        Column {
                            Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, lineHeight = 26.sp)
                            if (alt.isNotEmpty()) Text(alt, color = Muted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
            item {
                Column(Modifier.padding(16.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        chips.forEach { (c, red) -> Text(c, Modifier.background(if (red) Red else Color(0x1AFFFFFF), RoundedCornerShape(99.dp)).padding(horizontal = 10.dp, vertical = 3.dp), fontSize = 12.sp) }
                    }
                    if (desc.isNotEmpty()) Text(desc, Modifier.padding(top = 12.dp).clickable { more = !more }, color = Color(0xFFCCCCCC), fontSize = 14.sp, lineHeight = 22.sp,
                        maxLines = if (more) Int.MAX_VALUE else 4, overflow = TextOverflow.Ellipsis)
                    FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = buttons)
                    if (info.isNotEmpty()) FlowRow(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        info.forEach { (k, v) -> Column { Text(k, color = Muted, fontSize = 11.sp); Text(v, fontSize = 13.sp) } }
                    }
                }
            }
            before()
            if (listTitle != null) {
                if (picks.on && acts != null) stickyHeader { SelectBar(picks, { shown.map { it.id } }, acts, run) }
                else item {
                    Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("$listTitle  ", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("${list.size}", color = Muted, modifier = Modifier.weight(1f))
                        if (list.size > cols) {
                            OutlinedTextField(filter, { filter = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.width(130.dp).height(52.dp), placeholder = { Text(jump, fontSize = 12.sp) },
                                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), textStyle = LocalTextStyle.current.copy(fontSize = 13.sp))
                            IconButton({ rev = !rev }) { Icon(Ic.sort, t("reverse"), Modifier.size(20.dp)) }
                        }
                    }
                }
                items(shown.chunked(cols)) { line ->
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        line.forEach { e ->
                            val on = picks.has(e.id)
                            Box(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(4.dp)).background(if (on) Color(0x55E50914) else CardC)
                                .then(if (e.last || on) Modifier.border(if (on) 2.dp else 1.dp, Red, RoundedCornerShape(4.dp)) else Modifier)
                                .combinedClickable(onLongClick = { if (acts != null) { if (picks.on) picks.toggle(e.id) else picks.start(e.id) } }) { if (picks.on) picks.toggle(e.id) else nav.go(e.open) }, Alignment.Center) {
                                Text(e.label, color = if (e.seen) Muted else Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                if (e.saved) Icon(Ic.download, null, Modifier.align(Alignment.TopEnd).padding(3.dp).size(10.dp), tint = Muted) // downloaded
                            }
                        }
                        repeat(cols - line.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            after()
        }
    }
}

@Composable
fun RedButton(label: String, onClick: () -> Unit) = Button(onClick, colors = ButtonDefaults.buttonColors(Red), shape = RoundedCornerShape(4.dp)) {
    Icon(Ic.play, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(label, fontWeight = FontWeight.Bold)
}
@Composable
fun GhostButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) =
    OutlinedButton(onClick, shape = RoundedCornerShape(4.dp), border = BorderStroke(1.dp, Color(0x55FFFFFF))) {
        Icon(icon, null, Modifier.size(18.dp), tint = Color.White); Spacer(Modifier.width(6.dp)); Text(label, color = Color.White)
    }
@Composable
fun ListButton(path: String, title: String, poster: String, type: String) {
    Store.version.intValue
    val on = Store.inList(path)
    GhostButton(if (on) t("inList") else t("myList"), if (on) Ic.check else Ic.plus) { Store.toggleList(path, title, poster, type).let { toast(if (it) t("added", title) else t("removed")) } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TitleScreen(path: String, nav: Nav) {
    val (l, refresh) = loaded(path) { Witanime.details(path, it) }
    val open = openUrl()
    PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { d ->
            Store.version.intValue
            val h = Store["history"].optJSONObject(path)
            val last = h?.optString("epPath")
            val first = last ?: d.episodes.firstOrNull()?.path
            val type = if (path.startsWith("/movie")) "movie" else "anime"
            DetailPage(d.banner, d.poster, d.title, d.alt, d.tags.mapIndexed { i, c -> c to (i == 2) } + d.genres.map { it to false }, d.desc, {
                if (first != null) RedButton(if (h != null) t("resume", h.optString("ep")) else t("play")) { nav.go(Screen.Play(first)) }
                ListButton(path, d.title, d.poster, type)
                if (d.trailer.isNotEmpty()) GhostButton(t("trailer"), Ic.play) { open(d.trailer) }
            }, d.info, nav, if (d.episodes.size > 1 || type == "anime") t("episodes") else null,
                d.episodes.map { Numbered(it.ep, Store["seen"].has(it.path), it.path == last, Screen.Play(it.path), it.path, com.medanime.app.Downloads.done(it.path)) },
                after = { item { CardRowView(t("moreLike"), d.related, nav) } },
                acts = { ids -> listOfNotNull("seen" to t("markWatched"), "unseen" to t("markUnwatched"), if (ids.any { !com.medanime.app.Downloads.done(it) }) "dl" to t("downloadShort") else null) },
                run = { v, ids ->
                    val seen = Store["seen"]
                    when (v) {
                        "seen" -> ids.forEach { seen.put(it, 1) }
                        "unseen" -> ids.forEach { seen.remove(it) }
                        "dl" -> d.episodes.filter { it.path in ids }.forEach { // oldest first, in the quality last picked
                            com.medanime.app.Downloads.episode(it.path, path, d.title, it.ep, d.poster, Store["prefs"].optString("dlQuality"), quiet = true) }
                    }
                    Store.persist("seen")
                    if (v == "dl") toast(t("dlQueuedN", ids.size))
                })
        }
    }
}
