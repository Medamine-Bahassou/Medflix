package com.medanime.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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

// ---------- search: what the user meant (app.js fuzzySearch) ----------
// the sites match titles literally: "narto" finds nothing and "demon slayer" isn't what they call it. What was typed is asked
// first; when that finds little, it's asked again as the names typo-tolerant title searches suggest (Kitsu for anime and
// manga, IMDb for films) and as its other spellings, and everything is ranked by how close its title is to one of them
private fun fold(s: String) = java.text.Normalizer.normalize(s.lowercase(), java.text.Normalizer.Form.NFKD).replace(Regex("\\p{M}"), "")
    .replace(Regex("[أإآ]"), "ا").replace('ة', 'ه').replace('ى', 'ي').replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
private fun pairs(s: String) = " ${s.replace(" ", "")} ".let { t -> (0 until t.length - 1).map { t.substring(it, it + 2) }.toSet() }
private fun dice(a: String, b: String): Double { val x = pairs(a); val y = pairs(b); return 2.0 * x.count { it in y } / (x.size + y.size) }
// 0..1: 1 when the title holds the query (spaces and punctuation aside), else the most letter pairs it shares with the
// whole title or with a run of as many title words
private fun closeness(q: String, title: String): Double {
    val a = fold(q); val b = fold(title)
    if (a.isEmpty() || b.isEmpty()) return 0.0
    if (a.replace(" ", "") in b.replace(" ", "")) return 1.0
    val n = a.split(' ').size; val w = b.split(' ')
    return (listOf(dice(a, b)) + w.indices.map { dice(a, w.subList(it, minOf(it + n, w.size)).joinToString(" ")) }).max()
}
// "spider-man" -> "spider man", "spiderman", "spider-man", "spider"
private fun spellings(q: String) = fold(q).split(' ').filter { it.isNotEmpty() }.let { w ->
    listOf(w.joinToString(" "), w.joinToString(""), w.joinToString("-")) + if (w.size > 1) w.filter { it.length >= 4 }.sortedByDescending { it.length }.take(1) else emptyList()
}
// each suggestion: a title's names (Kitsu's: canonical, English, romaji); only those near what was typed (IMDb also lists what's popular)
private suspend fun suggest(kind: String, q: String): List<String> = try {
    val enc = { v: String -> java.net.URLEncoder.encode(v, "UTF-8").replace("+", "%20") }
    val all = if (kind == "film") org.json.JSONObject(Net.fetch("https://v3.sg.media-imdb.com/suggestion/x/${enc(fold(q))}.json").body).optJSONArray("d").let { d ->
        (0 until (d?.length() ?: 0)).map { d!!.getJSONObject(it) }.filter { Regex("^(movie|tv)").containsMatchIn(it.optString("qid")) }.map { listOf(it.optString("l")) }
    } else org.json.JSONObject(Net.fetch("https://kitsu.io/api/edge/$kind?${enc("filter[text]")}=${enc(q)}&${enc("page[limit]")}=3&${enc("fields[$kind]")}=canonicalTitle,titles").body).optJSONArray("data").let { d ->
        (0 until (d?.length() ?: 0)).map { d!!.getJSONObject(it).getJSONObject("attributes") }.map { a -> listOf(a.optString("canonicalTitle"), a.optJSONObject("titles")?.optString("en").orEmpty(), a.optJSONObject("titles")?.optString("en_jp").orEmpty()) }
    }
    all.filter { n -> n.any { closeness(q, it) >= .45 } }.flatten().filter { it.isNotEmpty() }.distinct().take(4)
} catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { emptyList() }
// ask(text) -> cards; cards found only by a suggestion or another spelling must be close to one of the names
private suspend fun fuzzySearch(q: String, kind: String, ask: suspend (String) -> List<Card>): List<Card> = coroutineScope {
    val found = LinkedHashMap<String, Pair<Card, Boolean>>()
    fun add(l: List<Card>, other: Boolean) = l.forEach { found.putIfAbsent(it.path, it to other) }
    add(ask(q), false) // what was typed failing is the search failing (unreachable)
    var names = listOf(q)
    if (found.values.count { closeness(q, it.first.title) >= .6 } < 3) {
        val sug = suggest(kind, q)
        names = listOf(q) + sug
        (sug + spellings(q)).distinct().filter { it != q }.take(5)
            .map { v -> async { try { ask(v) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { emptyList() } } }
            .forEach { add(it.await(), true) }
    }
    found.values.map { (c, other) -> Triple(c, other, names.maxOf { closeness(it, c.title) }) }.filter { !it.second || it.third >= .5 }
        .sortedWith(compareByDescending<Triple<Card, Boolean, Double>> { it.third }.thenBy { it.first.title.length }).map { it.first } // as close: the shorter title (the show, before its spin-offs)
}

/** search: witanime's titles, the movie sites' and manga, a row each, each with its spelling guesses (app.js search) */
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
                leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Ic.x, t("clear"), Modifier.size(18.dp)) } }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                shape = RoundedCornerShape(6.dp), colors = TextFieldDefaults.colors(focusedContainerColor = CardC, unfocusedContainerColor = CardC, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
        }
        if (typed.isEmpty()) return@Column
        val (l, retry) = loadedOnce(typed) { _ ->
            coroutineScope {
                val a = async { runCatching { fuzzySearch(typed, "anime") { Witanime.search(it).first().items } }.getOrNull() }
                val c = async { runCatching { fuzzySearch(typed, "film") { Cinema.search(it) } }.getOrNull() }
                val m = async { runCatching { fuzzySearch(typed, "manga") { Manga.browse(mapOf("search" to it), 1, HashSet()).items } }.getOrNull() }
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
    val all = listed()
    val nh = Store["hidden"].length()
    var q by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("") }
    // a kind by the saved type: "movie" is an anime film, so it stays with anime
    val kindOf = { c: Card -> when (c.type) { "manga" -> "manga"; "cinema" -> "cinema"; else -> "anime" } }
    val items = all.filter { (kind.isEmpty() || kindOf(it) == kind) && it.title.contains(q.trim(), ignoreCase = true) }
    Column {
        TopBar(nav)
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(t("myList"), Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 22.sp)
        }
        if (all.isEmpty()) return@Column Empty(t("listEmpty"), t("listHint"))
        TextField(q, { q = it }, Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp), placeholder = { Text(t("listSearchPh")) }, singleLine = true,
            leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Ic.x, t("clear"), Modifier.size(18.dp)) } },
            shape = RoundedCornerShape(6.dp), colors = TextFieldDefaults.colors(focusedContainerColor = CardC, unfocusedContainerColor = CardC, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
        // only the kinds the list holds, and none when it holds one
        val kinds = listOf("anime", "cinema", "manga").filter { k -> all.any { kindOf(it) == k } }
        if (kinds.size > 1) Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (listOf("") + kinds).forEach { k -> FilterChip(kind == k, { kind = k }, { Text(t(k.ifEmpty { "all" })) }) }
        }
        if (items.isEmpty()) return@Column Empty(t("nothing"), "")
        CardsGrid(items, nav) {
            if (nh > 0) TextButton({ nav.go(Screen.Hidden) }) { Icon(Ic.eyeSlash, null, Modifier.size(16.dp), tint = Muted); Spacer(Modifier.width(6.dp)); Text(t("openHidden", nh), color = Muted, fontSize = 13.sp) }
        }
    }
}

// ---------- the details page shared by anime, manga and films (app.js det-hero) ----------
class Numbered(val label: String, val seen: Boolean, val last: Boolean, val open: Screen, val id: String = label, val saved: Boolean = false, val read: Boolean = seen) // id: what picking it hands the actions; read: the ✓ (manga: to the last page, not just opened)

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
    var big by remember { mutableStateOf(false) } // the poster, full screen
    if (big) androidx.compose.ui.window.Dialog({ big = false }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).clickable { big = false }) { AsyncImage(poster, title, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
    }
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
                        if (poster.isNotEmpty()) AsyncImage(poster, null, Modifier.padding(end = 14.dp).width(110.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(6.dp)).background(CardC).clickable { big = true }, contentScale = ContentScale.Crop)
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
                                if (e.read) Icon(Ic.check, t("chRead"), Modifier.align(Alignment.TopStart).padding(3.dp).size(10.dp), tint = Red) // watched / read: too small for the read pill
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
