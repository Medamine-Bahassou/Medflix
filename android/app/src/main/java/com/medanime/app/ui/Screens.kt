package com.medanime.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
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
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first

private fun animeSlides(d: HomePage) = d.hero.map { Slide(it.banner, it.title, it.desc, Screen.Title(it.path), it.watch.takeIf { w -> w.isNotEmpty() }?.let { w -> Screen.Play(w) }) }
fun mangaSlides(top: List<MSeries>) = top.filter { it.poster.isNotEmpty() || it.cover.isNotEmpty() }.map { s ->
    // the poster, not its wide cover: those are 229-400px pictures the site blows up to 1200x800, and this slider is portrait anyway
    Slide(s.poster.ifEmpty { s.cover }, s.title, s.story, Screen.MangaSeries(s.id), Store["manga"].optJSONObject(s.id)?.optString("chapterId")?.let { Screen.MangaRead(it, s.title) })
}
fun filmSlides(items: List<Card>) = items.filter { it.poster.isNotEmpty() }.map { Slide(it.poster, it.title, it.desc, screenFor(it), Screen.CinemaPlay(it.path.removePrefix("/cinema/")), film = it) }
suspend fun mangaTop(items: List<Card>) = coroutineScope { items.map { async { runCatching { Manga.seriesOf(it.path.substringAfterLast('/')) }.getOrNull() } }.map { it.await() }.filterNotNull() }

/** Home: a bit of every section; a site that doesn't answer just leaves its rows out (app.js home) */
private class HomeData(val anime: HomePage?, val hot: List<Card>?, val latest: List<Card>?, val films: List<Card>?, val novels: List<Card>?, val novelUpdates: List<Card>?, val slides: List<Slide>)

@Composable
fun HomeScreen(nav: Nav) {
    val (l, refresh) = loadedOnce("home", quiet = true) { f ->
        coroutineScope {
            val a = async { runCatching { Witanime.home(f).first() }.getOrNull() }
            val hot = async { runCatching { Manga.hot(f) }.getOrNull() }
            val latest = async { runCatching { Manga.latestFlow(f).first() }.getOrNull() }
            val films = async { runCatching { Cinema.list("all", 1, f).items }.getOrNull() }
            val novels = async { runCatching { Novels.list(mapOf("sort" to "trending"), f).items }.getOrNull() }
            val novelUpdates = async { runCatching { Novels.updates(f) }.getOrNull() }
            val m = async { mangaSlides(mangaTop(hot.await()?.take(3) ?: emptyList())) }
            if (a.await() == null && hot.await() == null && films.await() == null) throw java.io.IOException(t("unreachable"))
            // the slider takes turns: anime, manga, film, anime…
            val an = a.await()?.let(::animeSlides)?.take(3) ?: emptyList(); val mg = m.await(); val fl = filmSlides(films.await()?.take(3) ?: emptyList())
            HomeData(a.await(), hot.await(), latest.await(), films.await(), novels.await(), novelUpdates.await(), (0 until 3).flatMap { listOfNotNull(an.getOrNull(it), mg.getOrNull(it), fl.getOrNull(it)) })
        }
    }
    SectionPage(l, refresh, nav, { it.slides }) { d ->
        item { CardRowView(t("continueWatching"), continued(setOf("anime", "cinema", "manga", "novel")), nav) }
        item { CardRowView(t("myList"), listed(), nav, Screen.MyList) }
        items(d.anime?.rows ?: emptyList(), { it.title }) { CardRowView(t(it.title), it.items, nav, Screen.Section(it.title)) }
        item { CardRowView(t("homeHotManga"), d.hot, nav, Screen.MangaBrowse(mapOf("is_hot" to "true"))) }
        item { CardRowView(t("homeLatestManga"), d.latest, nav, Screen.Manga) }
        item { CardRowView(t("cinema"), d.films, nav, Screen.Cinema) }
        item { CardRowView(t("homeHotNovels"), d.novels, nav, Screen.NovelBrowse(mapOf("sort" to "trending"))) }
        item { CardRowView(t("homeLatestNovels"), d.novelUpdates, nav, Screen.Novels) }
    }
}

/** Anime: witanime's series, films and rows (app.js animeHome) */
@Composable
fun AnimeScreen(nav: Nav) {
    val (l, refresh) = loaded("anime", quiet = true) { Witanime.home(it) }
    SectionPage(l, refresh, nav, ::animeSlides) { d ->
        item { Chips(listOf(t("series") to Screen.Grid(t("series"), "/browse"), t("movies") to Screen.Grid(t("movies"), "/movies"), t("schedule") to Screen.Schedule), nav) }
        item { CardRowView(t("continueWatching"), continued(setOf("anime")), nav) }
        items(d.rows, { it.title }) { CardRowView(t(it.title), it.items, nav, Screen.Section(it.title)) }
    }
}

/** a home row's full listing: the site's own (sorted browse, the season's, films), the latest episodes' pager, else the row (app.js section) */
@Composable
fun SectionScreen(name: String, nav: Nav) = Column {
    PageTitle(t(name), nav)
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
                            NetImage(s.poster, Modifier.width(48.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)))
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
    var rate by remember { mutableStateOf(RateFilter.load()) }
    LaunchedEffect(Unit) { if (q.isEmpty() && rate.asks.isEmpty()) focus.requestFocus() } // a filter set: what it finds is on the screen, not under a keyboard
    val setRate = { f: RateFilter -> rate = f; f.save() }
    var rateOpen by rememberSaveable { mutableStateOf(false) }
    var matches by remember { mutableStateOf<Int?>(null) } // the sheet's button says how many it's leaving
    LaunchedEffect(typed, kind) { matches = null }
    if (rateOpen) RateSheet(rate, kind, matches, setRate) { rateOpen = false }
    // whichever came first is what's looked through: results and then a filter filter those; a filter's results and then typing search those
    val shelfOn = rate.sections(kind).isNotEmpty()
    var everywhere by rememberSaveable { mutableStateOf(q0.isNotBlank()) } // opened on a title (a row's full list, an airing card): that's asked of the sites
    LaunchedEffect(q, typed, shelfOn) { if (q.isEmpty()) everywhere = false else if (typed.isNotEmpty() && !shelfOn) everywhere = true }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(nav.back) { Icon(Ic.back, null, Modifier.size(22.dp)) }
            TextField(q, { q = it }, Modifier.weight(1f).padding(end = 16.dp, top = 8.dp, bottom = 8.dp).focusRequester(focus), placeholder = { Text(t("searchPh")) }, singleLine = true,
                leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Ic.x, t("clear"), Modifier.size(18.dp)) } }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                shape = RoundedCornerShape(6.dp), colors = TextFieldDefaults.colors(focusedContainerColor = CardC, unfocusedContainerColor = CardC, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
        }
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (RATERS.any { kind.isEmpty() || kind in it.kinds }) RateChip(rate, kind) { rateOpen = true } // no score rates novels
            listOf("", "anime", "cinema", "manga", "novels").forEach { k -> FilterChip(kind == k, { kind = k }, { Text(t(k.ifEmpty { "all" })) }) }
        }
        RateActive(rate, kind, setRate)
        if (typed.isEmpty() || (shelfOn && !everywhere)) return@Column RateShelf(rate, kind, typed, nav, setRate, { everywhere = true }) { matches = it }
        val (l, retry) = loadedOnce(typed, kind) { _ ->
            coroutineScope {
                // a section left out isn't asked (null, like one that didn't answer)
                fun ask(k: String, go: suspend () -> List<Card>) = async { if (kind.isEmpty() || kind == k) runCatching { go() }.getOrNull() else null }
                val a = ask("anime") { fuzzySearch(typed, "anime") { Witanime.search(it).first().items } }
                val c = ask("cinema") { fuzzySearch(typed, "film") { Cinema.search(it) } }
                // each spelling merges only its own sites' answers ("demonicemperor" finds just Olympus's copy): each series once across them all
                val m = ask("manga") { Manga.merge(listOf(fuzzySearch(typed, "manga") { Manga.browse(mapOf("search" to it), 1, HashSet()).items })) }
                val n = ask("novels") { Novels.search(typed) } // the site's search knows its Arabic titles only: no other spellings to try
                if (a.await() == null && c.await() == null && m.await() == null && n.await() == null) throw java.io.IOException(t("unreachable"))
                listOf(a.await().orEmpty(), c.await().orEmpty(), m.await().orEmpty(), n.await().orEmpty())
            }
        }
        Body(l, retry) { (a, c, m, n) ->
            if (a.isEmpty() && c.isEmpty() && m.isEmpty() && n.isEmpty()) return@Body Empty(t("nothing"), t("tryElse"))
            val found = remember(a, c, m, n) { a + c + m + n }
            val looked = scoresOf(found, rate)
            val (a1, c1, m1, n1) = listOf(a, c, m, n).map { rate.apply(it, looked.scores) }
            val shown = a1 + c1 + m1 + n1
            SideEffect { matches = shown.size }
            Column {
                RateStatus(looked, found.size - shown.size)
                if (shown.isEmpty()) { if (looked.left == 0) Empty(t("rfNone"), t("rfNoneHint")) { Button({ setRate(RateFilter()) }, colors = ButtonDefaults.buttonColors(Red)) { Text(t("reset")) } } }
                else RatedCards(listOf("anime" to a1, "cinema" to c1, "manga" to m1, "novels" to n1), typed, nav, rememberLazyGridState().takeIf { kind.isNotEmpty() }) // one section: the others are empty
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
    var kind by rememberSaveable { mutableStateOf("") } // the chip picked: a kind, or a category's id
    // only the kinds the list holds, and none when it holds one
    val kinds = listOf("anime", "cinema", "manga", "novels").filter { k -> all.any { kindOf(it) == k } }.takeIf { it.size > 1 }.orEmpty()
    val cats = Store.cats.all()
    val cat = cats.find { it.id == kind }
    val on = if (cat != null || kind in kinds) kind else "" // its category deleted, or the last title of its kind gone: back to all
    val items = all.filter { (on.isEmpty() || (if (cat != null) it.showPath in cat.items else kindOf(it) == on)) && it.title.contains(q.trim(), ignoreCase = true) }
    var naming by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf<String?>(null) } // a category's id: its sheet
    var titles by remember { mutableStateOf<String?>(null) } // ...the titles picked for it
    var renaming by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<String?>(null) }
    Column {
        if (all.isEmpty()) { PageTitle(t("myList"), nav, back = false); return@Column Empty(t("listEmpty"), t("listHint")) }
        SearchTitle(t("myList"), nav, q, { q = it }, t("listSearchPh"), back = false)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            (listOf("") + kinds).forEach { k -> FilterChip(on == k, { kind = k }, { Text(t(k.ifEmpty { "all" })) }) }
            cats.forEach { c -> CatChip(c, on == c.id, { if (on == c.id) menu = c.id else kind = c.id }, { menu = c.id }) }
            AssistChip({ naming = true }, { Text(t("catNew")) }, leadingIcon = { Icon(Ic.plus, null, Modifier.size(16.dp)) })
        }
        // made: it opens, its titles to pick at once, rather than an empty page to work out
        if (naming) CatNameDialog(t("catNew"), "", null, { naming = false }) { name -> Store.cats.add(name)?.let { kind = it; titles = it; Store.persist("listCats") } }
        cats.find { it.id == menu }?.let { c -> CatMenu(c, { menu = null }, { titles = c.id }, { renaming = c.id }, { deleting = c.id }) }
        cats.find { it.id == titles }?.let { c -> CatTitles(c, all) { titles = null } }
        cats.find { it.id == renaming }?.let { c -> CatNameDialog(t("catRename"), c.name, c.id, { renaming = null }) { name -> if (Store.cats.rename(c.id, name)) Store.persist("listCats") } }
        cats.find { it.id == deleting }?.let { c ->
            AlertDialog({ deleting = null }, { TextButton({ Store.cats.delete(c.id); Store.persist("listCats"); deleting = null }) { Text(t("del"), color = Red) } }, dismissButton = { TextButton({ deleting = null }) { Text(t("cancel"), color = Color.White) } },
                title = { Text(t("catDelAsk", c.name), fontSize = 17.sp) }, text = { Text(t("catDelHint")) }, containerColor = CardC)
        }
        if (items.isEmpty()) return@Column if (cat != null && q.isBlank()) Empty(t("catEmpty"), t("catEmptyHint")) { Button({ titles = cat.id }, colors = ButtonDefaults.buttonColors(Red)) { Text(t("catAddTitles")) } } else Empty(t("nothing"), "")
        CardsGrid(items, nav) {
            if (nh > 0) TextButton({ nav.go(Screen.Hidden) }) { Icon(Ic.eyeSlash, null, Modifier.size(16.dp), tint = Muted); Spacer(Modifier.width(6.dp)); Text(t("openHidden", nh), color = Muted, fontSize = 13.sp) }
        }
    }
}

/** a category's chip: tap to filter by it; tapped again (its caret says so) or long-pressed, its sheet */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun CatChip(c: ListCats.Cat, on: Boolean, click: () -> Unit, long: () -> Unit) = Box {
    FilterChip(on, click, { Text("${c.name}  \u2066${c.items.size}\u2069", Modifier.widthIn(max = 160.dp), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        trailingIcon = if (on) { { Icon(Ic.caretDown, null, Modifier.size(14.dp)) } } else null)
    // a chip can't be long-pressed: this takes the touches, the chip below keeps its look and what a screen reader finds
    Box(Modifier.matchParentSize().combinedClickable(interactionSource = null, indication = null, onLongClick = long, onClick = click))
}

@Composable
private fun SheetRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, color: Color = Color.White, go: () -> Unit) =
    Row(Modifier.fillMaxWidth().clickable(onClick = go).padding(horizontal = 24.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(22.dp), tint = color); Text(label, Modifier.padding(start = 16.dp), color = color, fontSize = 16.sp)
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatMenu(c: ListCats.Cat, done: () -> Unit, titles: () -> Unit, rename: () -> Unit, delete: () -> Unit) = ModalBottomSheet(done, containerColor = CardC) {
    Text(c.name, Modifier.padding(horizontal = 24.dp, vertical = 8.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    SheetRow(Ic.check, t("catTitles")) { done(); titles() }
    SheetRow(Ic.pencil, t("catRename")) { done(); rename() }
    SheetRow(Ic.trash, t("catDelete"), Red) { done(); delete() }
    Spacer(Modifier.navigationBarsPadding().height(16.dp))
}

/** a category's titles, picked from the whole list: each tap is saved at once, so there's nothing to confirm */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatTitles(c: ListCats.Cat, all: List<Card>, done: () -> Unit) = ModalBottomSheet(done, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = CardC) {
    Text(c.name, Modifier.padding(horizontal = 24.dp, vertical = 8.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    var q by remember { mutableStateOf("") }
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    TextField(q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), placeholder = { Text(t("listSearchPh"), maxLines = 1) }, singleLine = true,
        leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Ic.x, t("clear"), Modifier.size(18.dp)) } },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { focus.clearFocus() }), shape = RoundedCornerShape(6.dp),
        colors = TextFieldDefaults.colors(focusedContainerColor = Color(0xFF242424), unfocusedContainerColor = Color(0xFF242424), focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
    // as the schedule's search: its words in any order, accents aside
    val words = fold(q).split(' ').filter { it.isNotBlank() }
    val found = all.filter { card -> fold(card.title).let { f -> words.all { it in f } } }
    if (found.isEmpty()) Text(t("nothing"), Modifier.fillMaxWidth().padding(32.dp), color = Muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    // the sheet's full height: it doesn't jump with each letter as the matches shrink. imePadding: the last rows can still scroll above the keyboard
    LazyColumn(Modifier.fillMaxHeight().imePadding(), contentPadding = PaddingValues(bottom = 24.dp)) {
        items(found, { it.showPath }) { card ->
            val on = card.showPath in c.items
            Row(Modifier.fillMaxWidth().clickable { Store.cats.set(c.id, card.showPath, !on); Store.persist("listCats") }.padding(horizontal = 24.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                NetImage(card.poster, Modifier.width(40.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)), icon = iconOf(card.showPath))
                Text(card.title, Modifier.weight(1f).padding(horizontal = 14.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                Checkbox(on, null, colors = CheckboxDefaults.colors(checkedColor = Red))
            }
        }
    }
}

/** a card's categories, from its long-press or for several picked: adding one lists it too, a category holds what's in My List */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatSheet(cards: List<Card>, done: () -> Unit) {
    Store.version.intValue
    var naming by remember { mutableStateOf(false) }
    val put = { id: String, on: Boolean ->
        if (on) cards.filter { !Store.inList(it.showPath) }.forEach { Store.toggleList(it.showPath, it.title, it.poster, listType(it)); if (cards.size == 1) toast(t("added", it.title)) }
        cards.forEach { Store.cats.set(id, it.showPath, on) }
        Store.persist("listCats")
    }
    if (naming) CatNameDialog(t("catNew"), "", null, { naming = false }) { name -> Store.cats.add(name)?.let { put(it, true) } }
    ModalBottomSheet(done, containerColor = CardC) {
        Text(cards.singleOrNull()?.title ?: t("selectedN", cards.size), Modifier.padding(horizontal = 24.dp, vertical = 8.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            Store.cats.all().forEach { c ->
                val n = cards.count { it.showPath in c.items } // of several, some in it: the dash, and a tap puts them all in
                Row(Modifier.fillMaxWidth().clickable { put(c.id, n < cards.size) }.padding(horizontal = 24.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(c.name, Modifier.weight(1f), fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    TriStateCheckbox(if (n == 0) androidx.compose.ui.state.ToggleableState.Off else if (n == cards.size) androidx.compose.ui.state.ToggleableState.On else androidx.compose.ui.state.ToggleableState.Indeterminate, null, colors = CheckboxDefaults.colors(checkedColor = Red))
                }
            }
            SheetRow(Ic.plus, t("catNew")) { naming = true }
        }
        Spacer(Modifier.navigationBarsPadding().height(16.dp))
    }
}

/** a category's name: the keyboard already up, and a name taken said as it's typed rather than after */
@Composable
private fun CatNameDialog(title: String, start: String, id: String?, done: () -> Unit, save: (String) -> Unit) {
    var v by remember { mutableStateOf(androidx.compose.ui.text.input.TextFieldValue(start, androidx.compose.ui.text.TextRange(start.length))) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val taken = Store.cats.taken(v.text, id)
    val ok = v.text.isNotBlank() && !taken
    val go = { save(v.text); done() }
    AlertDialog(done, { TextButton(go, enabled = ok) { Text(t("save"), color = if (ok) Red else Muted) } }, dismissButton = { TextButton(done) { Text(t("cancel"), color = Color.White) } },
        title = { Text(title, fontSize = 17.sp) }, containerColor = CardC, text = {
            OutlinedTextField(v, { if (it.text.length <= 30) v = it }, Modifier.fillMaxWidth().focusRequester(focus), label = { Text(t("catName")) }, singleLine = true, isError = taken,
                supportingText = { if (taken) Text(t("catTaken")) },
                keyboardOptions = KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { if (ok) go() }),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Color.White, focusedLabelColor = Color.White, cursorColor = Red))
        })
}

/** an episode's filler mark: "filler" or "mixed" (app.js epKind) */
@Composable
fun FillerBadge(kind: String) = Text(t(kind), Modifier.padding(start = 8.dp).background(if (kind == "filler") Red else Color(0x26FFFFFF), RoundedCornerShape(3.dp)).padding(horizontal = 6.dp, vertical = 1.dp), color = Color.White, fontSize = 11.sp, maxLines = 1)

/** the rows a title's page lists. A number typed shows even if hidden; the one left off at stays; mixed ones too, they hold canon */
internal fun shownRows(list: List<Numbered>, rev: Boolean, filter: String, hide: Boolean) = (if (rev) list.reversed() else list)
    .filter { if (filter.isEmpty()) !hide || it.filler != "filler" || it.last else it.label.startsWith(filter) }

// ---------- the details page shared by anime, manga and films (app.js det-hero) ----------
class Numbered(val label: String, val seen: Boolean, val last: Boolean, val open: Screen, val id: String = label, val saved: Boolean = false, val read: Boolean = seen,
               val thumb: String = "", val name: String = "", val lateName: (suspend () -> String)? = null, val filler: String = "") // filler: "filler" or "mixed", its mark; lateName: fetched as the row shows, when it came with no name; id: what picking it hands the actions; read: the ✓ (manga: to the last page, not just opened); thumb: drawn as rows (anime, series)

/**
 * a title's page, laid out as the reading apps do: a bar with its name, then two tabs swiped between. details: poster and
 * titles over the faded banner (red chips under them), the actions row, a card with the story, genres and info, then
 * what's after (related). the list: a row each (episodes, chapters) with seen and download at hand, jump-to and reverse,
 * and whatever comes before it (seasons). play floats over both
 */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun DetailPage(banner: String, poster: String, title: String, alt: String, icon: androidx.compose.ui.graphics.vector.ImageVector, chips: List<Pair<String, Boolean>>, desc: String,
               buttons: @Composable FlowRowScope.() -> Unit, info: List<Pair<String, String>>, nav: Nav,
               listTitle: String? = null, list: List<Numbered> = emptyList(), jump: String = t("jump"), before: LazyListScope.() -> Unit = {}, after: LazyListScope.() -> Unit = {},
               acts: ((List<String>) -> List<Pair<String, String>>)? = null, run: (String, List<String>) -> Unit = { _, _ -> },
               unit: String = t("ep"), play: Pair<String, () -> Unit>? = null, menu: List<MenuItem> = emptyList(), fullPoster: String = poster) {
    val picks = remember { Picks() } // long-press a row to pick several (acts: what can be done to them)
    var filter by rememberSaveable { mutableStateOf("") }
    var rev by rememberSaveable { mutableStateOf(false) }
    var more by rememberSaveable { mutableStateOf(false) }
    var big by remember { mutableStateOf(false) } // the poster, full screen
    if (big) androidx.compose.ui.window.Dialog({ big = false }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).clickable { big = false }) { NetImage(fullPoster, Modifier.fillMaxSize(), ContentScale.Fit, title, icon, title) }
    }
    var hide by remember { mutableStateOf(Store["prefs"].optBoolean("hideFiller")) } // every show's, kept
    val shown = remember(list, rev, filter, hide) { shownRows(list, rev, filter, hide) }
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
        if (list.any { it.filler == "filler" }) MenuItem(t("hideFiller"), Ic.eyeSlash, hide) { hide = !hide; Store["prefs"].put("hideFiller", hide); Store.persist("prefs"); toList() } else null,
        if (acts != null) MenuItem(t("select"), Ic.check) { picks.set = emptySet(); toList() } else null,
    )) + menu
    // a new order or a number typed: from its top (not on opening: that's at the one watched last)
    LaunchedEffect(Unit) { snapshotFlow { filter to rev }.drop(1).collect { rows.scrollToItem(0) } }
    // rows hidden or back (the marks arrive after the list): the same index is another episode now, so back to the one watched last
    LaunchedEffect(if (hide) list.count { it.filler == "filler" } else 0) { if (list.any { it.filler.isNotEmpty() }) rows.scrollToItem(shown.indexOfFirst { it.last }.coerceAtLeast(0)) }
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
                            NetImage(banner.ifEmpty { poster }, Modifier.matchParentSize().graphicsLayer { alpha = .4f }, icon = null) // behind the titles: nothing to say over them
                            Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color(0x66000000), 1f to Bg)))
                            Row(Modifier.padding(16.dp)) {
                                if (poster.isNotEmpty()) NetImage(poster, Modifier.padding(end = 14.dp).width(120.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(6.dp)).background(CardC).clickable { big = true }, icon = icon)
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
                                if (e.thumb.isNotEmpty()) NetImage(e.thumb, Modifier.padding(end = 12.dp, top = 6.dp, bottom = 6.dp).width(104.dp).aspectRatio(16 / 9f).clip(RoundedCornerShape(4.dp))
                                    .background(CardC).graphicsLayer { alpha = if (e.seen) .45f else 1f }, icon = Ic.play)
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(label(e), Modifier.weight(1f, false), color = if (e.last) Red else if (e.seen) Muted else Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        if (e.filler.isNotEmpty()) FillerBadge(e.filler)
                                    }
                                    val name = if (e.lateName == null || e.name.isNotEmpty()) e.name else produceState("", e.id) { value = e.lateName.invoke() }.value
                                    if (name.isNotEmpty()) Text(name, color = Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
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
            val filler by produceState(emptyMap<Int, String>(), d.title) { // so are these marks
                if (type == "anime") value = runCatching { Witanime.filler(listOf(d.title) + d.alt.split(Regex("\\s*[,،]\\s*"))) }.getOrDefault(emptyMap())
            }
            var rates by remember { mutableStateOf(false) } // the episode ratings' sheet
            if (rates) EpisodeGraph(listOf(d.title) + d.alt.split(Regex("[,،]")), "", true) { rates = false }
            // its next episode's day and time, from the schedule: a red chip first, when it's in this week's timetable
            val air by produceState<Air?>(null, d.title) {
                if (type == "anime") value = runCatching { Witanime.nextAir(listOf(d.title) + d.alt.split(Regex("\\s*[,،]\\s*"))) }.getOrNull()
            }
            val airChip = air?.let { a ->
                val loc = java.util.Locale(Store.lang); val at = java.util.Date(a.at)
                val day = if (android.text.format.DateUtils.isToday(a.at)) t("today") else java.text.SimpleDateFormat("EEEE d MMM", loc).format(at)
                "${t("nextEp")} · ${if (a.ep.isNotEmpty()) "${t("epShort")} ${a.ep} · " else ""}$day · ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT, loc).format(at)}" to true
            }
            DetailPage(d.banner, d.poster, d.title, d.alt, Ic.series, listOfNotNull(airChip) + d.tags.filter { !it.matches(Regex("\\d+\\.\\d+")) }.map { it to false } + d.genres.map { it to false }, d.desc, { // the site's score is among the tags
                SourceRating(listOf(d.title) + d.alt.split(Regex("[,،]")), "anime")
                ListButton(path, d.title, d.poster, type)
                if (type == "anime") NotifyButton(path, d.title, d.poster, d.episodes.lastOrNull()?.path ?: "")
            }, d.info, nav, if (d.episodes.size > 1 || type == "anime") t("episodes") else null,
                d.episodes.map { Numbered(it.ep, Store["seen"].has(it.path), it.path == last, Screen.Play(it.path), it.path, com.medanime.app.Downloads.done(it.path),
                    thumb = info[it.ep.toIntOrNull()]?.thumb?.ifEmpty { null } ?: d.banner.ifEmpty { d.poster }, name = info[it.ep.toIntOrNull()]?.name.orEmpty(), filler = filler[it.ep.toIntOrNull()].orEmpty()) },
                menu = listOfNotNull(
                    if (type == "anime") MenuItem(t("epRatings"), Ic.star) { rates = true } else null,
                    if (type == "anime") MenuItem(t("autoDlShort"), Ic.download, Alerts.autoDl(path)) { Alerts.toggleDl(path, d.title, d.poster, d.episodes.lastOrNull()?.path ?: "") } else null,
                    if (d.trailer.isNotEmpty()) MenuItem(t("trailer"), Ic.play) { nav.go(Screen.Trailer(d.trailer, d.title)) } else null),
                play = first?.let { (if (h != null) t("resume", h.optString("ep")) else t("play")) to { nav.go(Screen.Play(it)) } },
                after = { item { CreditsSection(listOf(d.title) + d.alt.split(Regex("[,،]")), true, nav = nav) }; item { CardRowView(t("moreLike"), d.related, nav) } },
                acts = { ids -> listOfNotNull("seen" to t("markWatched"), "unseen" to t("markUnwatched"), if (ids.any { !com.medanime.app.Downloads.done(it) }) "dl" to t("downloadShort") else null,
                    if (ids.any { com.medanime.app.Downloads.done(it) }) "del" to t("delDownloads") else null) },
                run = { v, ids ->
                    val seen = Store["seen"]
                    when (v) {
                        "seen" -> ids.forEach { seen.put(it, 1) }
                        "unseen" -> ids.forEach { seen.remove(it) }
                        "dl" -> d.episodes.filter { it.path in ids }.forEach { // oldest first, in the quality last picked
                            com.medanime.app.Downloads.episode(it.path, path, d.title, it.ep, d.poster, Store["prefs"].optString("dlQuality"), quiet = true) }
                        "del" -> ids.forEach { com.medanime.app.Downloads.delete(it) }
                    }
                    Store.persist("seen")
                    if (v == "dl") toast(t("dlQueuedN", ids.size))
                })
        }
    }
}
