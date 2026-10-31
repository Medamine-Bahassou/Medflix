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
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first

private fun animeSlides(d: HomePage) = d.hero.map { Slide(it.banner, it.title, it.desc, Screen.Title(it.path), it.watch.takeIf { w -> w.isNotEmpty() }?.let { w -> Screen.Play(w) }) }
fun mangaSlides(top: List<MSeries>) = top.filter { it.cover.isNotEmpty() }.map { s ->
    Slide(s.cover, s.title, s.story, Screen.MangaSeries(s.id), Store["manga"].optJSONObject(s.id)?.optString("chapterId")?.let { Screen.MangaRead(it, s.title) })
}
fun filmSlides(items: List<Card>) = items.filter { it.poster.isNotEmpty() }.map { Slide(it.poster, it.title, it.desc, screenFor(it), Screen.CinemaPlay(it.path.removePrefix("/cinema/"))) }
suspend fun mangaTop(items: List<Card>) = coroutineScope { items.map { async { runCatching { Manga.seriesOf(it.path.substringAfterLast('/')) }.getOrNull() } }.map { it.await() }.filterNotNull() }

/** Home: a bit of every section; a site that doesn't answer just leaves its rows out (app.js home) */
private class HomeData(val anime: HomePage?, val hot: List<Card>?, val latest: List<Card>?, val films: List<Card>?, val slides: List<Slide>)

@Composable
fun HomeScreen(nav: Nav) {
    val (l, refresh) = loadedOnce("home", quiet = true) { f ->
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
    val (l, refresh) = loaded("anime", quiet = true) { Witanime.home(it) }
    SectionPage(l, refresh, nav, ::animeSlides) { d ->
        item { Chips(listOf(t("series") to Screen.Grid(t("series"), "/browse"), t("movies") to Screen.Grid(t("movies"), "/movies"), t("schedule") to Screen.Schedule), nav) }
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

// ---------- the anime schedule (app.js schedule) ----------
private var schedQ by mutableStateOf("") // stays through refreshes and coming back from a show

/**
 * today and the 6 days after, each show at its air time (in the phone's time zone). The timetable runs Monday to Sunday:
 * shows of the days already past this week are listed at their next airing, a week on. Its search box turns the day rows
 * into one list of the matching shows, each with its day and time (all of the query's words in the title, any order)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(nav: Nav) = Column {
    SearchTitle(t("schedule"), nav, schedQ, { schedQ = it }, t("schedSearch"), back = false)
    val (l, refresh) = loadedOnce("schedule") { Witanime.airTimes(it) }
    PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { shows ->
            val loc = java.util.Locale(Store.lang)
            fun day(ms: Long) = java.util.Calendar.getInstance().apply { timeInMillis = ms; set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0) }.timeInMillis
            val today = day(System.currentTimeMillis())
            val all = shows.map { if (day(it.at) < today) it.copy(at = it.at + 7 * 86_400_000L) else it }.sortedBy { it.at }
            val time = { s: Air -> java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT, loc).format(java.util.Date(s.at)) + if (s.ep.isNotEmpty()) " · ${t("epShort")} ${s.ep}" else "" }
            val dayName = { ms: Long -> java.text.SimpleDateFormat("EEEE d MMMM", loc).format(java.util.Date(ms)) + if (day(ms) == today) " · ${t("today")}" else "" }
            val ws = fold(schedQ).split(' ').filter { it.isNotEmpty() }
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                if (ws.isEmpty()) items(all.groupBy { day(it.at) }.toList(), { it.first }) { (d, l) ->
                    CardRowView(dayName(d), l.map { Card("/airing/${it.route}", "anime", it.title, it.poster, "", "", time(it), null, "/airing/${it.route}") }, nav)
                } else {
                    val hits = all.filter { s -> fold(s.title).let { f -> ws.all { it in f } } }
                    if (hits.isEmpty()) item { Empty(t("schedNone"), t("schedNoneHint")) }
                    items(hits, { it.route }) { s ->
                        Row(Modifier.fillMaxWidth().clickable { nav.go(Screen.Search(s.title, "anime")) }.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            AsyncImage(s.poster, null, Modifier.width(48.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(s.title, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text("${dayName(s.at)} · ${time(s)}", color = Muted, fontSize = 12.sp)
                            }
                            Icon(Ic.next, null, Modifier.size(18.dp), tint = Muted)
                        }
                    }
                }
            }
        }
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
internal fun fold(s: String) = java.text.Normalizer.normalize(s.lowercase(java.util.Locale.ROOT), java.text.Normalizer.Form.NFKD).replace(Regex("\\p{M}"), "")
    .replace("ـ", "").replace(Regex("[أإآ]"), "ا").replace('ة', 'ه').replace('ى', 'ي')
    .map { if (it in '٠'..'٩' || it in '۰'..'۹') ('0'.code + it.digitToInt()).toChar() else it }.joinToString("")
    .replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
internal fun searchQuery(q: String) = fold(q)
    .replace(Regex("^(?:(?:please |can you )?(?:search for|find|show me|watch)|(?:ابحث عن|ابحث لي عن|اريد مشاهده|اريد|مشاهده)) +"), "")
    .replace(Regex(" +(?:مترجم|مدبلج|اون لاين)$"), "").trim()
// normalize the season wording before joining title words ("Ao Ashi" / "Aoashi")
internal fun searchTitle(q: String) = fold(q).replace(Regex("\\b(\\d+)(?:st|nd|rd|th)\\b"), "$1")
    .replace(Regex("\\b(first|second|third|fourth|fifth|sixth) (season|part|cour)\\b")) { m ->
        "${m.groupValues[2]} ${listOf("first", "second", "third", "fourth", "fifth", "sixth").indexOf(m.groupValues[1]) + 1}"
    }.replace(Regex("\\b(\\d+) (season|part|cour)\\b"), "$2 $1").replace(Regex("\\b(season|part|cour) ?(\\d+)\\b"), "$1 $2")
private fun searchNumbersMatch(q: String, title: String): Boolean {
    val numbers = searchTitle(title).split(' ')
    return searchTitle(q).split(' ').filter { it.all(Char::isDigit) }.all { it in numbers }
}
// same ranking as desktop: whole words, reordered words, prefixes, then small typos
private fun wordScore(a: String, b: String): Double {
    if (a == b) return 1.0
    if (a.all { it.isDigit() } || b.all { it.isDigit() } || minOf(a.length, b.length) < 3) return 0.0
    if (b.startsWith(a) && a.length >= 3) return .9
    val d = Array(a.length + 1) { i -> IntArray(b.length + 1) { j -> if (i == 0) j else if (j == 0) i else 0 } }
    for (i in 1..a.length) for (j in 1..b.length) {
        d[i][j] = minOf(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
        if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) d[i][j] = minOf(d[i][j], d[i - 2][j - 2] + 1)
    }
    val edits = d[a.length][b.length]
    return if (edits <= if (minOf(a.length, b.length) >= 6) 2 else 1) 1.0 - edits.toDouble() / maxOf(a.length, b.length) else 0.0
}
internal fun closeness(q: String, title: String): Double {
    val a = searchTitle(q); val b = searchTitle(title)
    if (a.isEmpty() || b.isEmpty()) return 0.0
    if (a.replace(" ", "") == b.replace(" ", "")) return 1.0
    val words = a.split(' '); val target = b.split(' ')
    if (words.any { w -> w.all { it.isDigit() } && w !in target }) return 0.0
    val compact = a.replace(" ", "")
    if (target.indices.any { i ->
        var joined = ""; var j = i
        while (j < target.size && joined.length < compact.length) { joined += target[j++]; if (joined == compact) return@any true }
        false
    }) return .96
    val used = HashSet<Int>()
    var total = 0.0
    for (w in words) {
        var best = 0.0; var at = -1
        target.forEachIndexed { i, t -> val score = if (i in used) 0.0 else wordScore(w, t); if (score > best) { best = score; at = i } }
        if (at < 0) return 0.0
        used.add(at); total += best
    }
    return .96 * total / words.size
}
// base searches recover titles whose season suffix and word spacing both differ
internal fun spellings(q: String): List<String> {
    val canonical = searchTitle(q)
    val base = canonical.replace(Regex("\\b(?:season|part|cour) \\d+\\b"), "").replace(Regex(" +"), " ").trim()
    val w = canonical.split(' ').filter { it.isNotEmpty() }
    return (listOf(base, base.replace(" ", ""), canonical, w.joinToString("-"), w.joinToString("")) +
        w.filter { it.length >= 4 && it !in listOf("season", "part", "cour") }.sortedByDescending { it.length }.take(1)).filter { it.isNotEmpty() }.distinct()
}
// each suggestion: a title's names (Kitsu's: canonical, English, romaji); only those near what was typed (IMDb also lists what's popular)
private suspend fun suggest(kind: String, q: String): List<String> = try {
    val enc = { v: String -> java.net.URLEncoder.encode(v, "UTF-8").replace("+", "%20") }
    val all = if (kind == "film") org.json.JSONObject(Net.fetch("https://v3.sg.media-imdb.com/suggestion/x/${enc(fold(q))}.json").body).optJSONArray("d").let { d ->
        (0 until (d?.length() ?: 0)).map { d!!.getJSONObject(it) }.filter { Regex("^(movie|tv)").containsMatchIn(it.optString("qid")) }.map { listOf(it.optString("l")) }
    } else org.json.JSONObject(Net.fetch("https://kitsu.io/api/edge/$kind?${enc("filter[text]")}=${enc(q)}&${enc("page[limit]")}=3&${enc("fields[$kind]")}=canonicalTitle,titles").body).optJSONArray("data").let { d ->
        (0 until (d?.length() ?: 0)).map { d!!.getJSONObject(it).getJSONObject("attributes") }.map { a -> listOf(a.optString("canonicalTitle"), a.optJSONObject("titles")?.optString("en").orEmpty(), a.optJSONObject("titles")?.optString("en_jp").orEmpty()) }
    }
    all.filter { n -> n.any { closeness(q, it) >= .65 } }.flatten().filter { it.isNotEmpty() }.distinct().take(4)
} catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { emptyList() }
// ask(text) -> cards; literal results must also match the query or a trusted alias
internal suspend fun fuzzySearch(query: String, kind: String, suggestions: suspend (String, String) -> List<String> = ::suggest, ask: suspend (String) -> List<Card>): List<Card> = coroutineScope {
    val q = searchQuery(query)
    if (q.isEmpty()) return@coroutineScope emptyList()
    val found = LinkedHashMap<String, Card>()
    fun add(l: List<Card>) = l.forEach { found.putIfAbsent(it.path, it) }
    add(ask(q)) // what was typed failing is the search failing (unreachable)
    var names = listOf(q)
    if (found.values.count { closeness(q, it.title) >= .6 } < 3) {
        val sug = suggestions(kind, q)
        names = listOf(q) + sug
        val variants = spellings(q)
        (variants.take(2) + sug + variants.drop(2)).distinct().filter { it != q }.take(7)
            .map { v -> async { try { ask(v) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { emptyList() } } }
            .forEach { add(it.await()) }
    }
    found.values.map { c -> c to maxOf(closeness(q, c.title), names.drop(1).maxOfOrNull { .97 * closeness(it, c.title) } ?: 0.0) }.filter { it.second >= .62 && searchNumbersMatch(q, it.first.title) }
        .sortedWith(compareByDescending<Pair<Card, Double>> { it.second }.thenBy { it.first.title.length }).map { it.first } // as close: the shorter title (the show, before its spin-offs)
}

/** search: witanime's titles, the movie sites' and manga, a row each, each with its spelling guesses (app.js search) */
@Composable
fun SearchScreen(q0: String, nav: Nav, kind0: String = "") {
    var q by rememberSaveable { mutableStateOf(q0) }
    var kind by rememberSaveable { mutableStateOf(kind0) } // "": every section; else only that one is asked, and shown as a grid
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
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("", "anime", "cinema", "manga").forEach { k -> FilterChip(kind == k, { kind = k }, { Text(t(k.ifEmpty { "all" })) }) }
        }
        if (typed.isEmpty()) return@Column
        val (l, retry) = loadedOnce(typed, kind) { _ ->
            coroutineScope {
                // a section left out isn't asked (null, like one that didn't answer)
                fun ask(k: String, go: suspend () -> List<Card>) = async { if (kind.isEmpty() || kind == k) runCatching { go() }.getOrNull() else null }
                val a = ask("anime") { fuzzySearch(typed, "anime") { Witanime.search(it).first().items } }
                val c = ask("cinema") { fuzzySearch(typed, "film") { Cinema.search(it) } }
                val m = ask("manga") { fuzzySearch(typed, "manga") { Manga.browse(mapOf("search" to it), 1, HashSet()).items } }
                if (a.await() == null && c.await() == null && m.await() == null) throw java.io.IOException(t("unreachable"))
                Triple(a.await() ?: emptyList(), c.await() ?: emptyList(), m.await() ?: emptyList())
            }
        }
        Body(l, retry) { (a, c, m) ->
            if (a.isEmpty() && c.isEmpty() && m.isEmpty()) return@Body Empty(t("nothing"), t("tryElse"))
            if (kind.isNotEmpty()) return@Body CardsGrid(a + c + m, nav) // one section: the others are empty
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
        if (all.isEmpty()) { PageTitle(t("myList"), nav, back = false); return@Column Empty(t("listEmpty"), t("listHint")) }
        SearchTitle(t("myList"), nav, q, { q = it }, t("listSearchPh"), back = false)
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
class Numbered(val label: String, val seen: Boolean, val last: Boolean, val open: Screen, val id: String = label, val saved: Boolean = false, val read: Boolean = seen,
               val thumb: String = "", val name: String = "") // id: what picking it hands the actions; read: the ✓ (manga: to the last page, not just opened); thumb: drawn as rows (anime, series)

/**
 * a title's page, laid out as the reading apps do: a bar with its name, then two tabs swiped between. details: poster and
 * titles over the faded banner (red chips under them), the actions row, a card with the story, genres and info, then
 * what's after (related). the list: a row each (episodes, chapters) with seen and download at hand, jump-to and reverse,
 * and whatever comes before it (seasons). play floats over both
 */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun DetailPage(banner: String, poster: String, title: String, alt: String, chips: List<Pair<String, Boolean>>, desc: String,
               buttons: @Composable FlowRowScope.() -> Unit, info: List<Pair<String, String>>, nav: Nav,
               listTitle: String? = null, list: List<Numbered> = emptyList(), jump: String = t("jump"), before: LazyListScope.() -> Unit = {}, after: LazyListScope.() -> Unit = {},
               acts: ((List<String>) -> List<Pair<String, String>>)? = null, run: (String, List<String>) -> Unit = { _, _ -> },
               unit: String = t("ep"), play: Pair<String, () -> Unit>? = null, menu: List<MenuItem> = emptyList()) {
    val picks = remember { Picks() } // long-press a row to pick several (acts: what can be done to them)
    var filter by rememberSaveable { mutableStateOf("") }
    var rev by rememberSaveable { mutableStateOf(false) }
    var more by rememberSaveable { mutableStateOf(false) }
    var big by remember { mutableStateOf(false) } // the poster, full screen
    if (big) androidx.compose.ui.window.Dialog({ big = false }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).clickable { big = false }) { AsyncImage(poster, title, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
    }
    val shown = remember(list, rev, filter) { (if (rev) list.reversed() else list).filter { filter.isEmpty() || it.label.startsWith(filter) } }
    val pager = androidx.compose.foundation.pager.rememberPagerState { if (listTitle != null) 2 else 1 }
    val scope = rememberCoroutineScope()
    val details = androidx.compose.foundation.lazy.rememberLazyListState()
    // the list opens at the one watched last (seasons above it: that row shows second, the one before it for context)
    val rows = androidx.compose.foundation.lazy.rememberLazyListState(list.indexOfFirst { it.last }.coerceAtLeast(0))
    val label = { e: Numbered -> if (e.label.firstOrNull()?.isDigit() == true) "$unit ${e.label}" else e.label }
    var searching by rememberSaveable { mutableStateOf(false) } // the jump box, in place of the title
    var dots by remember { mutableStateOf(false) }
    val toList = { scope.launch { pager.animateScrollToPage(1) } }
    // the ⋮ menu: the list's tools (jump, reverse, pick several), then the page's own (auto-download, trailer)
    val items = (if (listTitle == null || list.size < 2) emptyList() else listOfNotNull(
        MenuItem(jump, Ic.search) { searching = true; toList() },
        MenuItem(t("reverse"), Ic.sort, rev) { rev = !rev; toList() },
        if (acts != null) MenuItem(t("select"), Ic.check) { picks.set = emptySet(); toList() } else null,
    )) + menu
    // a new order or a number typed: from its top (not on opening: that's at the one watched last)
    LaunchedEffect(Unit) { snapshotFlow { filter to rev }.drop(1).collect { rows.scrollToItem(0) } }
    androidx.activity.compose.BackHandler(searching) { searching = false; filter = "" }
    Box(Modifier.fillMaxSize()) {
        Column {
            Row(Modifier.fillMaxWidth().padding(end = 4.dp, top = 4.dp).heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                if (searching) {
                    val focus = remember { FocusRequester() }
                    LaunchedEffect(Unit) { focus.requestFocus() }
                    IconButton({ searching = false; filter = "" }) { Icon(Ic.x, t("cancel"), Modifier.size(22.dp)) }
                    TextField(filter, { filter = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.weight(1f).focusRequester(focus), placeholder = { Text(jump) }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent, focusedIndicatorColor = Red, unfocusedIndicatorColor = Muted, cursorColor = Red))
                } else {
                    IconButton(nav.back) { Icon(Ic.back, t("back"), Modifier.size(22.dp)) }
                    Text(title, Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 20.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (items.isNotEmpty()) Box {
                    IconButton({ dots = true }) { Icon(Ic.dots, t("more"), Modifier.size(22.dp)) }
                    DropdownMenu(dots, { dots = false }, containerColor = CardC) {
                        items.forEach { m ->
                            DropdownMenuItem({ Text(m.label) }, { dots = false; m.go() }, leadingIcon = { Icon(m.icon, null, Modifier.size(18.dp), tint = if (m.on) Red else Color.White) },
                                trailingIcon = { if (m.on) Icon(Ic.check, null, Modifier.size(16.dp), tint = Red) })
                        }
                    }
                }
            }
            if (listTitle != null) SecondaryTabRow(pager.currentPage, containerColor = Bg, contentColor = Color.White,
                indicator = { TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(pager.currentPage, matchContentSize = false), color = Red) }, divider = { HorizontalDivider(color = Color(0x1AFFFFFF)) }) {
                listOf(t("details"), "$listTitle ${list.size}").forEachIndexed { i, s ->
                    Tab(pager.currentPage == i, { scope.launch { pager.animateScrollToPage(i) } }, text = { Text(s, fontWeight = FontWeight.SemiBold) }, selectedContentColor = Color.White, unselectedContentColor = Muted)
                }
            }
            androidx.compose.foundation.pager.HorizontalPager(pager, Modifier.weight(1f), beyondViewportPageCount = 1, verticalAlignment = Alignment.Top) { p -> // both tabs stay built: a switch only slides
                if (p == 0) LazyColumn(Modifier.fillMaxSize(), details, PaddingValues(bottom = 96.dp)) {
                    item {
                        Box { // the faded banner behind the poster and titles
                            AsyncImage(banner.ifEmpty { poster }, null, Modifier.matchParentSize().graphicsLayer { alpha = .4f }, contentScale = ContentScale.Crop)
                            Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color(0x66000000), 1f to Bg)))
                            Row(Modifier.padding(16.dp)) {
                                if (poster.isNotEmpty()) AsyncImage(poster, null, Modifier.padding(end = 14.dp).width(120.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(6.dp)).background(CardC).clickable { big = true }, contentScale = ContentScale.Crop)
                                Column(Modifier.weight(1f).padding(top = 8.dp)) {
                                    Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, lineHeight = 24.sp)
                                    if (alt.isNotEmpty()) Text(alt, Modifier.padding(top = 4.dp), color = Muted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    chips.filter { it.second }.forEach { (c, _) -> Text(c, Modifier.padding(top = 6.dp), color = Red, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                                }
                            }
                        }
                    }
                    item { FlowRow(Modifier.padding(horizontal = 8.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = buttons) }
                    val tags = chips.filter { !it.second }
                    if (desc.isNotEmpty() || tags.isNotEmpty() || info.isNotEmpty()) item {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(CardC).padding(14.dp)) {
                            if (desc.isNotEmpty()) Text(desc, Modifier.fillMaxWidth().clickable { more = !more }, color = Color(0xFFCCCCCC), fontSize = 14.sp, lineHeight = 22.sp,
                                style = LocalTextStyle.current.copy(textDirection = androidx.compose.ui.text.style.TextDirection.Content), textAlign = androidx.compose.ui.text.style.TextAlign.Start,
                                maxLines = if (more) Int.MAX_VALUE else 5, overflow = TextOverflow.Ellipsis)
                            if (tags.isNotEmpty()) FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                tags.forEach { (c, _) -> Text(c, Modifier.border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(99.dp)).padding(horizontal = 10.dp, vertical = 3.dp), fontSize = 12.sp) }
                            }
                            info.chunked(2).forEach { line -> // two a row, as a table
                                Row(Modifier.padding(top = 14.dp)) {
                                    line.forEach { (k, v) -> Column(Modifier.weight(1f)) { Text(k, color = Muted, fontSize = 12.sp); Text(v, fontSize = 13.sp) } }
                                    if (line.size == 1) Spacer(Modifier.weight(1f))
                                }
                            }
                        }
                    }
                    if (listTitle == null) before()
                    after()
                } else Column(Modifier.fillMaxSize()) {
                    if (picks.on && acts != null) SelectBar(picks, { shown.map { it.id } }, acts, run)
                    LazyColumn(Modifier.fillMaxSize(), rows, PaddingValues(bottom = 96.dp)) {
                        before()
                        items(shown) { e ->
                            val on = picks.has(e.id)
                            val mine = acts?.invoke(listOf(e.id)).orEmpty() // its own marks: [0] marks it seen / read, [1] unmarks it
                            Row(Modifier.fillMaxWidth().background(if (on) Color(0x55E50914) else if (e.last) Color(0x0FFFFFFF) else Color.Transparent)
                                .combinedClickable(onLongClick = { if (acts != null) { if (picks.on) picks.toggle(e.id) else picks.start(e.id) } }) { if (picks.on) picks.toggle(e.id) else nav.go(e.open) }
                                .padding(start = 16.dp, end = 4.dp).heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (e.thumb.isNotEmpty()) AsyncImage(e.thumb, null, Modifier.padding(end = 12.dp, top = 6.dp, bottom = 6.dp).width(104.dp).aspectRatio(16 / 9f).clip(RoundedCornerShape(4.dp))
                                    .background(CardC).graphicsLayer { alpha = if (e.seen) .45f else 1f }, contentScale = ContentScale.Crop)
                                Column(Modifier.weight(1f)) {
                                    Text(label(e), color = if (e.last) Red else if (e.seen) Muted else Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    if (e.name.isNotEmpty()) Text(e.name, color = Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                if (mine.size >= 2) mine[if (e.read) 1 else 0].let { (v, what) -> IconButton({ run(v, listOf(e.id)) }) { Icon(Ic.eye, what, Modifier.size(20.dp), tint = if (e.read) Red else Muted) } }
                                val dl = mine.find { it.first == "dl" }
                                if (e.saved) Box(Modifier.size(48.dp), Alignment.Center) { Icon(Ic.download, null, Modifier.size(20.dp), tint = Red) } // downloaded
                                else if (dl != null) IconButton({ run(dl.first, listOf(e.id)) }) { Icon(Ic.download, dl.second, Modifier.size(20.dp), tint = Muted) }
                            }
                            HorizontalDivider(color = Color(0x14FFFFFF))
                        }
                    }
                }
            }
        }
        // over the list only (a film has just its details: there)
        if (listTitle == null || pager.currentPage == 1) play?.let { (what, go) ->
            ExtendedFloatingActionButton({ Text(what, fontWeight = FontWeight.Bold) }, { Icon(Ic.play, null, Modifier.size(18.dp)) }, go,
                Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp), shape = RoundedCornerShape(99.dp), containerColor = Red, contentColor = Color.White)
        }
    }
}

/** an entry of a title page's ⋮ menu; on: what it sets is set (a check, the icon red) */
class MenuItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val on: Boolean = false, val go: () -> Unit)

/** a figure in the actions row: an icon over its value, and what it counts under it (a rating and its votes) */
@Composable
fun FlowRowScope.Stat(icon: androidx.compose.ui.graphics.vector.ImageVector, value: String, sub: String) =
    Column(Modifier.weight(1f).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, null, Modifier.size(24.dp), tint = Red)
        Text(value, Modifier.padding(top = 4.dp), fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        if (sub.isNotEmpty()) Text(sub, color = Muted, fontSize = 11.sp, maxLines = 1)
    }

@Composable
fun RedButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) = Button(onClick, modifier, colors = ButtonDefaults.buttonColors(Red), shape = RoundedCornerShape(8.dp)) {
    Icon(Ic.play, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(label, fontWeight = FontWeight.Bold)
}
/**
 * a title's other actions, side by side under it: an icon over its name, sharing the row (as the Play Store's and Netflix's
 * apps do); on: what it does is set (in the list, notifying), the icon red
 */
@Composable
fun FlowRowScope.Action(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, on: Boolean = false, onClick: (() -> Unit)? = null) =
    Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, null, Modifier.size(24.dp), tint = if (on) Red else Color.White)
        Text(label, Modifier.padding(top = 4.dp), color = if (on) Color.White else Color(0xFFB3B3B3), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
@Composable
fun GhostButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) =
    OutlinedButton(onClick, shape = RoundedCornerShape(4.dp), border = BorderStroke(1.dp, Color(0x55FFFFFF))) {
        Icon(icon, null, Modifier.size(18.dp), tint = Color.White); Spacer(Modifier.width(6.dp)); Text(label, color = Color.White)
    }
@Composable
fun FlowRowScope.ListButton(path: String, title: String, poster: String, type: String) {
    Store.version.intValue
    val on = Store.inList(path)
    Action(if (on) t("inList") else t("myList"), if (on) Ic.check else Ic.plus, on) { Store.toggleList(path, title, poster, type).let { toast(if (it) t("added", title) else t("removed")) } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TitleScreen(path: String, nav: Nav) {
    val (l, refresh) = loaded(path, quiet = true) { Witanime.details(path, it) }
    PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { d ->
            Store.version.intValue
            val info by produceState(emptyMap<Int, EpInfo>(), d.title) { // names are extras: the numbers stand without them
                value = runCatching { Witanime.episodeInfo(listOf(d.title) + d.alt.split(Regex("\\s*[,،]\\s*"))) }.getOrDefault(emptyMap())
            }
            val h = Store["history"].optJSONObject(path)
            val last = h?.optString("epPath")
            val first = last ?: d.episodes.firstOrNull()?.path
            val type = if (path.startsWith("/movie")) "movie" else "anime"
            // its next episode's day and time, from the schedule: a red chip first, when it's in this week's timetable
            val air by produceState<Air?>(null, d.title) {
                if (type == "anime") value = runCatching { Witanime.nextAir(listOf(d.title) + d.alt.split(Regex("\\s*[,،]\\s*"))) }.getOrNull()
            }
            val airChip = air?.let { a ->
                val loc = java.util.Locale(Store.lang); val at = java.util.Date(a.at)
                val day = if (android.text.format.DateUtils.isToday(a.at)) t("today") else java.text.SimpleDateFormat("EEEE d MMM", loc).format(at)
                "${t("nextEp")} · ${if (a.ep.isNotEmpty()) "${t("epShort")} ${a.ep} · " else ""}$day · ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT, loc).format(at)}" to true
            }
            DetailPage(d.banner, d.poster, d.title, d.alt, listOfNotNull(airChip) + d.tags.mapIndexed { i, c -> c to (i == 2) } + d.genres.map { it to false }, d.desc, {
                SourceRating(listOf(d.title) + d.alt.split(Regex("[,،]")), "anime")
                ListButton(path, d.title, d.poster, type)
                if (type == "anime") NotifyButton(path, d.title, d.poster, d.episodes.lastOrNull()?.path ?: "")
            }, d.info, nav, if (d.episodes.size > 1 || type == "anime") t("episodes") else null,
                d.episodes.map { Numbered(it.ep, Store["seen"].has(it.path), it.path == last, Screen.Play(it.path), it.path, com.medanime.app.Downloads.done(it.path),
                    thumb = info[it.ep.toIntOrNull()]?.thumb?.ifEmpty { null } ?: d.banner.ifEmpty { d.poster }, name = info[it.ep.toIntOrNull()]?.name.orEmpty()) },
                menu = listOfNotNull(
                    if (type == "anime") MenuItem(t("autoDlShort"), Ic.download, Alerts.autoDl(path)) { Alerts.toggleDl(path, d.title, d.poster, d.episodes.lastOrNull()?.path ?: "") } else null,
                    if (d.trailer.isNotEmpty()) MenuItem(t("trailer"), Ic.play) { nav.go(Screen.Trailer(d.trailer, d.title)) } else null),
                play = first?.let { (if (h != null) t("resume", h.optString("ep")) else t("play")) to { nav.go(Screen.Play(it)) } },
                after = { item { CreditsSection(listOf(d.title) + d.alt.split(Regex("[,،]")), true, nav = nav) }; item { CardRowView(t("moreLike"), d.related, nav) } },
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
