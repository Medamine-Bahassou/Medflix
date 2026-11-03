package com.medanime.app.ui

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject
import org.jsoup.Jsoup
import java.net.URLEncoder

/** one episode in the show page's grid; score null: listed, no score yet */
internal data class EpRate(val season: Int, val ep: Int, val score: Double?)

/** each episode's rating, from both sites (ratings.js episodes) */
internal object EpisodeRatings {
    class Graph(val imdb: List<EpRate>, val tvmaze: List<EpRate>, val url: String)
    private val AR = Regex("[\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+") // spelled out: \p{IsArabic} isn't on every Android
    private fun objects(a: org.json.JSONArray?) = (0 until (a?.length() ?: 0)).mapNotNull { a?.optJSONObject(it) }
    // what's asked: the name without its season words or arabic (ratings.js filmName)
    private fun latin(s: String) = s.replace(Regex("(?:الموسم|الجزء|الحلقة)\\s+.*|\\bseason\\s+\\d+.*", RegexOption.IGNORE_CASE), " ").replace(AR, " ")
        .lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    /** for comparing, not asking ("Tokyo Ghoul" isn't "tokyo ghol" to a search): the sites spell a name their own way, "Shippuuden", "Shippūden", "Shippuden" */
    fun spelled(s: String) = latin(java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")).replace(Regex("([ou])u"), "$1")
    private fun asked(names: List<String>) = names.map(::latin).filter { it.isNotEmpty() }.distinct().take(6) // kitsu's list can run to 20 languages: tvmaze allows 20 calls in 10s
    private fun inOrder(rows: List<EpRate>) = rows.sortedWith(compareBy({ it.season }, { it.ep }))
    /** season and number left out: a special, no place in the grid. No score yet stays (null): the grid's "?". Anime seasons are often years on tvmaze */
    fun tvmazeRows(eps: org.json.JSONArray) = inOrder(objects(eps).mapNotNull { e ->
        val score = e.optJSONObject("rating")?.optDouble("average") ?: Double.NaN
        if (e.optInt("season") > 0 && e.optInt("number") > 0) EpRate(e.optInt("season"), e.optInt("number"), score.takeIf { it > 0 }) else null
    })
    fun imdbRows(edges: List<JSONObject>) = inOrder(edges.mapNotNull { edge ->
        val n = edge.optJSONObject("node"); val d = n?.optJSONObject("series")?.optJSONObject("displayableEpisodeNumber")
        val s = d?.optJSONObject("displayableSeason")?.optString("season")?.toIntOrNull() ?: 0
        val ep = d?.optJSONObject("episodeNumber")?.optString("episodeNumber")?.toIntOrNull() ?: 0
        val score = n?.optJSONObject("ratingsSummary")?.optDouble("aggregateRating") ?: Double.NaN
        if (s > 0 && ep > 0) EpRate(s, ep, score.takeIf { it > 0 }) else null
    })
    /** the one show of one of these names (two: none, rather than the wrong one's). An anime's is the animation: One Piece is live action too */
    fun pickShow(shows: List<JSONObject>, want: Set<String>, anime: Boolean) =
        shows.filter { spelled(it.optString("name")) in want && (!anime || it.optString("type") == "Animation") }.singleOrNull()
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    private suspend fun get(url: String) = Pages.load(url, every = Pages.DAY, interactive = false)
    private suspend fun findShow(names: List<String>, anime: Boolean): JSONObject? {
        val want = names.map(::spelled).filter { it.isNotEmpty() }.toSet()
        for (q in asked(names)) {
            val hit = pickShow(objects(org.json.JSONArray(get("https://api.tvmaze.com/search/shows?q=${enc(q)}"))).mapNotNull { it.optJSONObject("show") }, want, anime)
            if (hit != null) return hit
        }
        return null
    }
    private suspend fun imdbId(names: List<String>): String {
        val want = names.map(::spelled).toSet()
        for (q in asked(names)) {
            val hits = objects(JSONObject(get("https://v3.sg.media-imdb.com/suggestion/x/${enc(q)}.json")).optJSONArray("d"))
                .filter { it.optString("id").matches(Regex("tt\\d+")) && it.optString("qid").matches(Regex("tv(Series|MiniSeries)")) && spelled(it.optString("l")) in want }
            hits.singleOrNull()?.let { return it.optString("id") }
        }
        return ""
    }
    private suspend fun imdbEps(tt: String): List<EpRate> {
        val edges = ArrayList<JSONObject>()
        var after = ""
        for (page in 0 until 10) { // 250 a page, what it allows: One Piece's 1200 is 5
            val query = "query{title(id:${JSONObject.quote(tt)}){episodes{episodes(first:250${if (after.isEmpty()) "" else ",after:${JSONObject.quote(after)}"}){pageInfo{hasNextPage endCursor} edges{node{series{displayableEpisodeNumber{displayableSeason{season} episodeNumber{episodeNumber}}} ratingsSummary{aggregateRating}}}}}}}"
            // json only, and answered only to a client naming itself as IMDb's site (Credits.imdb)
            val e = JSONObject(Pages.load("https://caching.graphql.imdb.com/", body = JSONObject().put("query", query).toString(), headers = mapOf("x-imdb-client-name" to "imdb-web-next-localized"), every = Pages.DAY, interactive = false))
                .optJSONObject("data")?.optJSONObject("title")?.optJSONObject("episodes")?.optJSONObject("episodes") ?: break
            edges += objects(e.optJSONArray("edges"))
            val info = e.optJSONObject("pageInfo")
            if (info?.optBoolean("hasNextPage") != true) break
            after = info.optString("endCursor")
        }
        return imdbRows(edges)
    }
    /**
     * both sites, each an extra: found by the show's names, else kitsu's (witanime's "Kimetsu no Yaiba" is "Demon Slayer"). tvmaze
     * names its imdb id, so the two are one show. Fewer than 2 rated: nothing to compare
     */
    suspend fun get(names: List<String>, id: String, anime: Boolean): Graph? = withContext(Dispatchers.Default) {
        val own = names.filter { spelled(it).isNotEmpty() }
        var show = Scores.calm { findShow(own, anime) }
        val kitsu = if (show == null && anime) Scores.calm { Witanime.kitsuShow(own)?.second }.orEmpty() else emptyList()
        if (show == null && kitsu.isNotEmpty()) show = Scores.calm { findShow(kitsu, true) }
        val tt = id.ifEmpty { show?.optJSONObject("externals")?.optString("imdb")?.takeIf { it.matches(Regex("tt\\d+")) } ?: Scores.calm { imdbId(own + kitsu) }.orEmpty() }
        val tv = async { show?.let { s -> Scores.calm { tvmazeRows(org.json.JSONArray(get("https://api.tvmaze.com/shows/${s.optInt("id")}/episodes"))) } }.orEmpty() }
        val im = async { if (tt.isEmpty()) emptyList() else Scores.calm { imdbEps(tt) }.orEmpty() }
        val tvmaze = tv.await(); val imdb = im.await()
        if (rated(tvmaze) > 1 || rated(imdb) > 1) Graph(imdb, tvmaze, show?.optString("url").orEmpty()) else null
    }
    fun rated(rows: List<EpRate>) = rows.count { it.score != null }
    /** the grid's colours, best first (TIERS), by the score each starts at */
    fun tier(v: Double) = listOf(9.6, 9.0, 8.0, 7.0, 6.0, 5.0).indexOfFirst { v >= it }.let { if (it < 0) 6 else it }
    /** a season's average, of its scored episodes */
    fun seasonAvg(rows: List<EpRate>, s: Int) = rows.filter { it.season == s }.mapNotNull { it.score }.let { v -> if (v.isEmpty()) "–" else String.format(java.util.Locale.US, "%.1f", v.average()) }
    fun seasonName(s: Int) = if (s > 1900) "$s" else "${t("seasonShort")}$s"
}

// the scale's own colours, not the app's: a score reads by them. The text on each is what's legible there (style.css .eg-t0...)
private val TIERS = listOf(Color(0xFF1A8FE0) to Color.White, Color(0xFF186A3B) to Color.White, Color(0xFF28B463) to Color.Black, Color(0xFFF4D03F) to Color.Black,
    Color(0xFFF39C12) to Color.Black, Color(0xFFE74C3C) to Color.White, Color(0xFF633974) to Color.White)

/** a score in the grid; null: listed, no score yet */
@Composable
private fun Grade(score: Double?, width: androidx.compose.ui.unit.Dp) {
    val (bg, fg) = score?.let { TIERS[EpisodeRatings.tier(it)] } ?: (Color(0xFFBDBDBD) to Color.Black)
    Box(Modifier.width(width).height(44.dp).padding(3.dp).background(bg, RoundedCornerShape(6.dp)), Alignment.Center) {
        Text(score?.let { String.format(java.util.Locale.US, "%.1f", it) } ?: "?", color = fg, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** a show's episode ratings, a sheet from its ⋮ menu: the sites are asked only once it's open (app.js ratingsSheet) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EpisodeGraph(names: List<String>, imdbId: String, anime: Boolean, onClose: () -> Unit) {
    var done by remember { mutableStateOf(false) }
    val g by produceState<EpisodeRatings.Graph?>(null, names, imdbId, anime) { value = EpisodeRatings.get(names, imdbId, anime); done = true }
    val sources = g?.let { listOf("IMDb" to it.imdb, "TVmaze" to it.tvmaze).filter { s -> EpisodeRatings.rated(s.second) > 1 } }.orEmpty()
    // full height at once: half a grid says little
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = CardC, contentColor = Color.White) {
        Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
            Text(t("epRatings"), fontSize = 18.sp, fontWeight = FontWeight.Bold)
            when {
                !done -> Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) { CircularProgressIndicator(color = Red) }
                sources.isEmpty() -> Text(t("noEpRatings"), Modifier.padding(vertical = 24.dp), color = Muted)
                else -> EpisodeGrid(sources, g?.url.orEmpty())
            }
            Spacer(Modifier.navigationBarsPadding().height(16.dp))
        }
    }
}

/**
 * a column a season, a row an episode, each score coloured, each season's average under it; IMDb's and TVmaze's to pick from
 * (ratings.js graph). Its rows are lazy, scrolling in what height the sheet has: a long show is 1200 of them
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.EpisodeGrid(sources: List<Pair<String, List<EpRate>>>, url: String) {
    var pick by remember { mutableIntStateOf(0) }
    val rows = sources[pick.coerceAtMost(sources.lastIndex)].second
    val seasons = remember(rows) { rows.map { it.season }.distinct() }
    val eps = remember(rows) { rows.map { it.ep }.distinct().sorted() } // the numbers it has, not 1 to the last: a talk show's can be dates, a million rows
    val at = remember(rows) { rows.associateBy { it.season to it.ep } }
    val label = 48.dp; val cell = 58.dp
    val center = androidx.compose.ui.text.style.TextAlign.Center
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    Row(Modifier.padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        sources.forEachIndexed { i, s ->
            FilterChip(i == pick, { pick = i }, { Text(s.first) }, shape = RoundedCornerShape(99.dp), colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Red, selectedLabelColor = Color.White))
        }
    }
    FlowRow(Modifier.padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        TIERS.forEachIndexed { i, (bg, _) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.padding(end = 6.dp).size(12.dp).background(bg, RoundedCornerShape(99.dp)))
                Text(t("tier$i"), fontSize = 12.sp)
            }
        }
    }
    // sideways for many seasons; weight, not fill: a short grid leaves the sheet short, a long one scrolls in what's left under the legend
    Box(Modifier.weight(1f, false).horizontalScroll(rememberScrollState())) {
        Column(Modifier.width(label + cell * seasons.size)) {
            Row {
                Spacer(Modifier.width(label))
                seasons.forEach { s -> Text(EpisodeRatings.seasonName(s), Modifier.width(cell).padding(vertical = 4.dp), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = center, maxLines = 1) }
            }
            LazyColumn(Modifier.weight(1f, false).fillMaxWidth()) {
                items(eps, key = { it }) { n ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${t("epShort")}$n", Modifier.width(label), fontSize = 13.sp, textAlign = center, maxLines = 1)
                        seasons.forEach { s -> at[s to n]?.let { Grade(it.score, cell) } ?: Spacer(Modifier.width(cell)) }
                    }
                }
            }
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t("avgShort"), Modifier.width(label), color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = center, maxLines = 1)
                seasons.forEach { s -> Text(EpisodeRatings.seasonAvg(rows, s), Modifier.width(cell), fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = center, maxLines = 1) }
            }
        }
    }
    if (url.isNotEmpty() && sources.any { it.first == "TVmaze" }) TextButton({ uri.openUri(url) }) { Text("TVmaze · CC BY-SA") }
}

internal object SourceRatings {
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Pair<String, String>>()
    suspend fun get(names: List<String>, kind: String, year: String): Pair<String, String>? {
        val key = "$names|$kind|$year"
        cache[key]?.let { return it }
        for (name in names.filter { it.isNotBlank() }) {
            val clean = Credits.clean(name)
            val query = "{Page(perPage:10){media(search:${JSONObject.quote(clean)},type:${if (kind == "manga") "MANGA" else "ANIME"}){title{romaji english native} synonyms averageScore}}}"
            val rows = JSONObject(Pages.load("https://graphql.anilist.co", body = JSONObject().put("query", query).toString(), every = Pages.DAY)).optJSONObject("data")?.optJSONObject("Page")?.optJSONArray("media")
            val result = aniScore(rows, listOf(clean))?.let { "AniList" to String.format(java.util.Locale.US, "%.1f", it) }
            if (result != null) { cache[key] = result; return result }
        }
        return null
    }
    /** out of 10: the one row going by one of these names (two of that name: none, rather than the wrong one's) */
    internal fun aniScore(rows: org.json.JSONArray?, names: List<String>): Double? {
        val want = names.map(Credits::norm).filter { it.isNotEmpty() }.toSet()
        val matches = (0 until (rows?.length() ?: 0)).map { rows!!.getJSONObject(it) }.filter { m ->
            val t = m.getJSONObject("title")
            val synonyms = m.optJSONArray("synonyms")
            (listOf(t.optString("romaji"), t.optString("english"), t.optString("native")) + (0 until (synonyms?.length() ?: 0)).map { synonyms!!.getString(it) }).any { Credits.norm(it) in want }
        }
        return matches.singleOrNull()?.optDouble("averageScore")?.takeIf { it > 0 && it <= 100 }?.div(10)
    }
}

private fun preferred() = Store["prefs"].optString("rateSite")

/** one score of a title page's */
private suspend fun titleScores(id: String, names: List<String>, kind: String, year: String): Map<String, Double?> = withContext(Dispatchers.IO) {
    if (id == "anilist") mapOf(id to Scores.calm { SourceRatings.get(names, kind, year)?.second?.toDoubleOrNull() })
    else if (id == "mal") mapOf(id to Scores.calm { Scores.mal(names, kind) })
    else Scores.get(names[0].let { t -> (if (kind == "series") "/cinema/serie/$t" else "/cinema/$t").let { Card(it, "cinema", t, "", "", year, "", null, it) } }, setOf(id))
}

/**
 * a title's score, as one of the actions row's items: the logo over the mark, from the site picked (kept for every title).
 * Only that one's asked for; the next is tried if it has no score for this title, and all once the picker's opened. A tap
 * picks, where there's more than one to pick from; none has a score: not shown
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FlowRowScope.SourceRating(names: List<String>, kind: String, year: String = "", imdb: String = "") {
    val opts = RATERS.filter { (if (kind == "series") "cinema" else kind) in it.kinds }
    var pref by remember { mutableStateOf(preferred()) }
    var scores by remember(names, kind, year, imdb) { mutableStateOf<Map<String, Double?>>(imdb.toDoubleOrNull()?.let { mapOf("imdb" to it) }.orEmpty()) } // the page already gave its IMDb score (a film's page); no entry: not asked yet
    var open by remember { mutableStateOf(false) }
    val ordered = opts.sortedByDescending { it.id == pref }
    suspend fun ask(id: String) { if (id !in scores) titleScores(id, names, kind, year).let { got -> scores = got + scores } } // what the page said stands
    LaunchedEffect(names, kind, year, imdb, pref, open) {
        if (open) coroutineScope { opts.forEach { launch { ask(it.id) } } }
        else for (r in ordered) { ask(r.id); if (scores[r.id] != null) break }
    }
    val shown = ordered.firstOrNull { scores[it.id] != null }
    val waiting = shown == null && ordered.any { it.id !in scores }
    if (shown == null && !waiting) return
    val gold = Color(0xFFF5C518)
    val r = shown ?: ordered.first()
    Column(Modifier.weight(1f).then(if (opts.size > 1) Modifier.clickable(onClickLabel = t("rfPick")) { open = true } else Modifier).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.height(24.dp), verticalAlignment = Alignment.CenterVertically) { // the same height as the other items' icons
            androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(r.logo), r.label, Modifier.fillMaxHeight())
            if (opts.size > 1) Icon(Ic.caretDown, null, Modifier.padding(start = 4.dp).size(10.dp), tint = Muted)
        }
        Text(shown?.let { markOf(it, scores.getValue(it.id)!!) } ?: "\u2026", Modifier.padding(top = 4.dp), color = gold, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
    if (open) ModalBottomSheet({ open = false }, containerColor = CardC, contentColor = Color.White) {
        Text(t("rfPick"), Modifier.padding(start = 20.dp, end = 20.dp, bottom = 8.dp), fontSize = 18.sp, fontWeight = FontWeight.Bold)
        opts.forEach { o ->
            Row(Modifier.fillMaxWidth().clickable { pref = o.id; Store["prefs"].put("rateSite", o.id); Store.persist("prefs", true); open = false }.padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                RaterLogo(o)
                Text(o.label, Modifier.weight(1f).padding(horizontal = 12.dp), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                when {
                    o.id !in scores -> CircularProgressIndicator(Modifier.size(16.dp), color = Muted, strokeWidth = 2.dp)
                    else -> Text(scores[o.id]?.let { markOf(o, it) } ?: t("rfNoScore"), color = if (scores[o.id] != null) gold else Muted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                Box(Modifier.padding(start = 12.dp).size(20.dp)) { if (o.id == r.id) Icon(Ic.check, null, Modifier.fillMaxSize(), tint = Red) }
            }
        }
        Spacer(Modifier.navigationBarsPadding().height(16.dp))
    }
}
private fun markOf(r: Rater, v: Double) = if (r.top == 100) r.mark(v) else "\u2605 ${r.mark(v)}"

internal fun kindOf(c: Card) = when (c.type) { "manga" -> "manga"; "novel" -> "novels"; "cinema" -> "cinema"; else -> "anime" } // "movie" is an anime film

/** a score the search can filter by: out of 10 stars or 100%, and the sections it rates */
internal class Rater(val id: String, val label: String, val short: String, val top: Int, val kinds: Set<String>, val logo: Int) {
    fun mark(v: Double) = if (top == 100) "${Math.round(v)}%" else String.format(java.util.Locale.US, if (id == "mal") "%.2f" else "%.1f", v) // myanimelist's are known by two decimals
    fun covers() = t(if ("cinema" in kinds) "rfFilms" else "rfAnime")
}
internal val RATERS = listOf(
    Rater("imdb", "IMDb", "IMDb", 10, setOf("cinema"), com.medanime.app.R.drawable.logo_imdb),
    Rater("rt", "Rotten Tomatoes", "RT", 100, setOf("cinema"), com.medanime.app.R.drawable.logo_rt),
    Rater("mc", "Metacritic", "MC", 100, setOf("cinema"), com.medanime.app.R.drawable.logo_mc),
    Rater("anilist", "AniList", "AL", 10, setOf("anime", "manga"), com.medanime.app.R.drawable.logo_anilist),
    Rater("mal", "MyAnimeList", "MAL", 10, setOf("anime", "manga"), com.medanime.app.R.drawable.logo_mal))

/** what the search keeps: each score turned on and its lowest mark; kept in prefs, so it's still set next time */
internal data class RateFilter(val mins: Map<String, Double> = emptyMap(), val any: Boolean = false, val keep: Boolean = false, val sort: String = "") {
    val asks get() = mins.keys + setOfNotNull(sort.ifEmpty { null })
    /** the sections this says something about, of those being searched ("": all); the others can't be judged by it */
    fun sections(kind: String) = listOf("anime", "cinema", "manga").filter { k -> (kind.isEmpty() || k == kind) && RATERS.any { it.id in asks && k in it.kinds } }
    /**
     * the rating sites' own lists a film search starts from when nothing's typed. Any of several: each one's list; all of
     * them: one's list (IMDb's if it's on, it brings Metacritic's too), the others judged title by title. Null, the site's
     * catalogue: only that has titles with no score
     */
    fun leads(): List<String>? {
        val lists = listOf("imdb", "rt", "mc")
        val on = lists.filter { it in mins }
        return when {
            keep -> null
            on.isEmpty() -> listOf(sort).filter { it in lists }.ifEmpty { null }
            any -> on
            else -> on.take(1)
        }
    }
    private fun rater(id: String) = RATERS.find { it.id == id }
    fun count(kind: String) = mins.keys.count { id -> kind.isEmpty() || rater(id)?.kinds?.contains(kind) == true }

    /** scores: null is looked up and has none; no entry isn't known yet, and stays out until it passes */
    fun passes(kind: String, scores: Map<String, Double?>): Boolean {
        val tests = mins.filterKeys { rater(it)?.kinds?.contains(kind) == true }
        if (tests.isEmpty()) return true // none of those turned on rates this section
        val pass = { (id, min): Map.Entry<String, Double> -> id in scores && (scores[id]?.let { it >= min } ?: keep) }
        return if (any) tests.any(pass) else tests.all(pass)
    }
    /** the cards that pass, best first if sorted, each showing the score it's judged by in place of its site's */
    fun apply(cards: List<Card>, scores: Map<String, Map<String, Double?>>): List<Card> {
        if (asks.isEmpty()) return cards
        val kept = cards.filter { passes(kindOf(it), scores[it.path].orEmpty()) }
        return (if (sort.isEmpty()) kept else kept.sortedByDescending { scores[it.path]?.get(sort) ?: -1.0 }).map { c ->
            val s = scores[c.path].orEmpty()
            val by = (listOf(sort) + mins.keys).firstOrNull { s[it] != null }?.let(::rater)
            if (by == null) c else c.copy(score = "${by.short} ${by.mark(s.getValue(by.id)!!)}")
        }
    }
    fun save() {
        Store["prefs"].put("rateFilter", JSONObject().put("mins", JSONObject(mins)).put("any", any).put("keep", keep).put("sort", sort))
        Store.persist("prefs", true)
    }
    companion object {
        fun load() = Store["prefs"].optJSONObject("rateFilter")?.let { o ->
            val m = o.optJSONObject("mins")
            RateFilter(m?.keys()?.asSequence()?.filter { id -> RATERS.any { it.id == id } }?.associateWith { m.getDouble(it) }.orEmpty(), o.optBoolean("any"), o.optBoolean("keep"), o.optString("sort"))
        } ?: RateFilter()
    }
}

/** a row of a rating site's search: its names, year, and its scores (a: its own, b: IMDb's Metacritic) */
internal class Hit(val names: List<String>, val year: String, val series: Boolean, val a: Double?, val b: Double? = null)
internal class Ranked(val hits: List<Hit>, val next: String?) // next: where its following page starts, if it has one

internal object Scores {
    // a title in both ("سجين Siccin 9"): these sites know the Latin part, and the Arabic words only spoil their search
    private fun latin(s: String) = s.replace(Regex("\\p{IsArabic}+"), " ").trim().takeIf { Regex("[a-zA-Z0-9]").containsMatchIn(it) } ?: s
    private fun term(c: Card) = Credits.clean(latin(c.title)).takeIf { Regex("[a-zA-Z0-9]").containsMatchIn(it) } // these sites know titles in Latin letters: an Arabic one finds nothing
    private fun isSeries(c: Card) = Regex("^/cinema/(serie|season|episode)/").containsMatchIn(c.path)
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    // the same name and kind. A film also by its year (a site's may be a year off the release); a series' card has its season's year, so
    // the first, as the site's search ranks by fame. A film with no year and two of that name: none, rather than the wrong one's score
    internal fun pick(rows: List<Hit>, c: Card): Hit? {
        val named = rows.filter { h -> h.series == isSeries(c) && h.names.any { Credits.norm(it) == Credits.norm(latin(c.title)) } }
        val y = c.year.toIntOrNull()
        return if (isSeries(c)) named.firstOrNull() else if (y != null) named.firstOrNull { h -> h.year.toIntOrNull()?.let { kotlin.math.abs(it - y) <= 1 } == true } else named.singleOrNull()
    }
    internal fun imdbHits(json: String): List<Hit> {
        val rows = JSONObject(json).optJSONObject("data")?.optJSONObject("mainSearch")?.optJSONArray("edges") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.getJSONObject(it).optJSONObject("node")?.optJSONObject("entity")?.let(::titleHit) }
    }
    private fun titleHit(e: JSONObject): Hit? {
        val type = e.optJSONObject("titleType")?.optString("id").orEmpty()
        if (type !in setOf("movie", "tvMovie", "tvSeries", "tvMiniSeries")) return null // its shorts, videos and episodes share their show's name
        return Hit(listOfNotNull(e.optJSONObject("titleText")?.optString("text"), e.optJSONObject("originalTitleText")?.optString("text")), e.optJSONObject("releaseYear")?.optInt("year")?.toString().orEmpty(), type == "tvSeries" || type == "tvMiniSeries",
            e.optJSONObject("ratingsSummary")?.optDouble("aggregateRating")?.takeIf { it > 0 }, e.optJSONObject("metacritic")?.optJSONObject("metascore")?.optDouble("score")?.takeIf { it > 0 })
    }
    private fun objs(a: org.json.JSONArray?) = (0 until (a?.length() ?: 0)).map { a!!.getJSONObject(it) }
    internal fun imdbRanked(json: String): Ranked {
        val a = JSONObject(json).getJSONObject("data").getJSONObject("advancedTitleSearch")
        return Ranked(objs(a.optJSONArray("edges")).mapNotNull { it.optJSONObject("node")?.optJSONObject("title")?.let(::titleHit) }, a.optJSONObject("pageInfo")?.takeIf { it.optBoolean("hasNextPage") }?.optString("endCursor"))
    }
    // its filter only knows fresh and certified, so the exact minimum is checked here. A film's date is when it came to streaming, a series' has no year
    internal fun rtRanked(json: String, min: Double): Ranked {
        val j = JSONObject(json)
        return Ranked(objs(j.getJSONObject("grid").optJSONArray("list")).mapNotNull { g ->
            val series = g.optString("mediaUrl").startsWith("/tv/")
            g.optJSONObject("criticsScore")?.optString("score")?.toDoubleOrNull()?.takeIf { it >= min }?.let { s ->
                Hit(listOf(g.optString("title").trim()), if (series) "" else Regex("\\b(?:19|20)\\d\\d\\b").find(g.optString("releaseDateText"))?.value.orEmpty(), series, s)
            }
        }, j.optJSONObject("pageInfo")?.takeIf { it.optBoolean("hasNextPage") }?.optString("endCursor"))
    }
    // best first: a row under the minimum means the rest are too. Its title may end in the year ("Dekalog (1988)"), truer than its premiereYear
    internal fun mcRanked(json: String, min: Double, offset: Int): Ranked {
        val items = objs(JSONObject(json).getJSONObject("data").optJSONArray("items"))
        val rows = items.mapNotNull { i -> i.optJSONObject("criticScoreSummary")?.optDouble("score")?.takeIf { it > 0 }?.let { i to it } }
        val titled = Regex("^(.*?)\\s*\\(((?:19|20)\\d\\d)\\)$")
        return Ranked(rows.filter { it.second >= min }.map { (i, s) ->
            val m = titled.find(i.optString("title"))
            Hit(listOf(m?.groupValues?.get(1) ?: i.optString("title")), m?.groupValues?.get(2) ?: i.optString("premiereYear"), i.optString("type") == "show", s)
        }, if (items.isNotEmpty() && (rows.lastOrNull()?.second ?: 0.0) >= min) (offset + items.size).toString() else null)
    }
    /**
     * one page of a rating site's own filtered list. Popular first, unless sorting by that score: their highest scores are
     * mostly titles nobody's heard of, which the movie site doesn't have (0 of 12 of Rotten Tomatoes' top, 10 of 16 of IMDb's popular)
     */
    suspend fun ranked(id: String, min: Double, best: Boolean, after: String?): Ranked = when (id) {
        "imdb" -> {
            // over 5000 votes: a 9.8 from a dozen of a film's friends isn't what's being asked for
            val query = "query{advancedTitleSearch(first:30,${after?.let { "after:${JSONObject.quote(it)}," }.orEmpty()}constraints:{titleTypeConstraint:{anyTitleTypeIds:[\"movie\",\"tvSeries\",\"tvMiniSeries\"]},userRatingsConstraint:{aggregateRatingRange:{min:$min,max:10},ratingsCountRange:{min:5000}}},sort:{sortBy:${if (best) "USER_RATING,sortOrder:DESC" else "POPULARITY,sortOrder:ASC"}}){pageInfo{endCursor hasNextPage} edges{node{title{titleType{id} titleText{text} originalTitleText{text} releaseYear{year} ratingsSummary{aggregateRating} metacritic{metascore{score}}}}}}}"
            imdbRanked(Pages.load("https://caching.graphql.imdb.com/", body = JSONObject().put("query", query).toString(), headers = mapOf("x-imdb-client-name" to "imdb-web-next-localized"), every = Pages.DAY))
        }
        "rt" -> coroutineScope {
            val critics = if (min >= 75) "critics:certified_fresh~" else if (min >= 60) "critics:fresh~" else ""
            listOf("movies_at_home", "tv_series_browse").map { list -> async {
                rtRanked(Pages.load("https://www.rottentomatoes.com/cnapi/browse/$list/${critics}sort:popular${after?.let { "?after=${enc(it)}" }.orEmpty()}", every = Pages.DAY), min)
            } }.awaitAll().let { l -> Ranked(l.flatMap { it.hits }, l.firstNotNullOfOrNull { it.next }) }
        }
        else -> coroutineScope {
            val at = after?.toIntOrNull() ?: 0
            listOf("movies&mcoTypeId=2", "tv&mcoTypeId=1").map { type -> async {
                mcRanked(Pages.load("https://backend.metacritic.com/finder/metacritic/web?sortBy=-metaScore&offset=$at&limit=30&productType=$type", every = Pages.DAY), min, at)
            } }.awaitAll().let { l -> Ranked(l.flatMap { it.hits }, l.firstNotNullOfOrNull { it.next }) }
        }
    }
    internal fun cardJson(c: Card) = JSONObject().put("path", c.path).put("title", c.title).put("poster", c.poster).put("rating", c.rating).put("year", c.year).put("badge", c.badge).put("desc", c.desc).put("dub", c.dub).toString()
    internal fun cardOf(s: String) = JSONObject(s).let { j ->
        val path = j.getString("path"); val slug = path.removePrefix("/cinema/")
        Card(path, "cinema", j.getString("title"), j.getString("poster"), j.getString("rating"), j.getString("year"), j.getString("badge"), null, path,
            open = if (slug.startsWith("episode/")) Screen.CinemaTitle(slug, show = true) else null, desc = j.getString("desc"), dub = j.getBoolean("dub")) // as Cinema.cards
    }
    /** a listed title's card on the movie site, if it has it: kept, found or not, so the same list comes back at once */
    suspend fun onSite(h: Hit): Card? {
        val key = "find|${h.names[0]}|${h.year}|${h.series}"
        Pages.saved(key)?.takeIf { !Pages.due(key, KEPT) }?.let { return if (it.isEmpty()) null else cardOf(it) }
        return Cinema.find(h.names[0]).firstOrNull { pick(listOf(h), it) != null }.also { Pages.put(key, it?.let(::cardJson).orEmpty()) }
    }
    // its film rows spell their attributes tomatometer-score and release-year, its TV rows tomatometerscore and startyear
    internal fun rtHits(html: String) = Jsoup.parse(html).select("search-page-result[type=movie], search-page-result[type=tvSeries]").flatMap { sec ->
        sec.select("search-page-media-row").map { r ->
            Hit(listOf(r.selectFirst("a[slot=title]")?.text().orEmpty()), listOf("release-year", "releaseyear", "startyear", "start-year").firstNotNullOfOrNull { k -> r.attr(k).ifEmpty { null } }.orEmpty(), sec.attr("type") == "tvSeries",
                (r.attr("tomatometer-score").ifEmpty { r.attr("tomatometerscore") }).toDoubleOrNull())
        }
    }
    private suspend fun imdb(c: Card): Hit? {
        val q = term(c) ?: return null
        val query = "query{mainSearch(first:6,options:{searchTerm:${JSONObject.quote(q)},type:TITLE}){edges{node{entity{... on Title{titleType{id} titleText{text} originalTitleText{text} releaseYear{year} ratingsSummary{aggregateRating} metacritic{metascore{score}}}}}}}}"
        return pick(imdbHits(Pages.load("https://caching.graphql.imdb.com/", body = JSONObject().put("query", query).toString(), headers = mapOf("x-imdb-client-name" to "imdb-web-next-localized"), every = Pages.DAY)), c)
    }
    internal fun mcHits(json: String) = objs(JSONObject(json).optJSONObject("data")?.optJSONArray("items")).map { i ->
        Hit(listOf(i.optString("title")), i.optString("premiereYear"), i.optString("type") == "show", i.optJSONObject("criticScoreSummary")?.optDouble("score")?.takeIf { it.isFinite() && it in 0.0..100.0 })
    }
    // its own search: IMDb's answer has Metacritic's score for films, and never for a series
    private suspend fun mc(c: Card): Double? {
        val q = term(c) ?: return null
        return pick(mcHits(Pages.load("https://backend.metacritic.com/finder/metacritic/search/${enc(q)}/web?offset=0&limit=12&mcoTypeId=1%2C2&componentName=search-tabs&componentDisplayName=Search+Page+Tab+Filters&componentType=FilterConfig", every = Pages.DAY, interactive = false)), c)?.a
    }
    private suspend fun rt(c: Card): Double? {
        val q = term(c) ?: return null
        val key = "rt|${c.path}|$q"
        Pages.saved(key)?.takeIf { !Pages.due(key, KEPT) }?.let { return it.toDoubleOrNull() } // its page is 100KB: only the number is kept
        val r = Net.fetch("https://www.rottentomatoes.com/search?search=${enc(q)}")
        if (r.status >= 400) throw java.io.IOException("HTTP ${r.status}")
        return pick(rtHits(r.body), c)?.a.also { Pages.put(key, it?.toString().orEmpty()) }
    }
    internal class MalRow(val name: String, val type: String, val score: Double?, val url: String)
    internal class MalTitle(val names: List<String>, val type: String, val score: Double?)
    private fun malScore(s: String?) = s?.trim()?.toDoubleOrNull()?.takeIf { it > 0 && it <= 10 } // "N/A", "-": none yet
    private fun malNorm(s: String) = Manga.norm(s).removePrefix("the ") // "Infinite Mage" is its "The Infinite Mage"
    // its search page: a row per title, its name in bold, its type, and last its score. A row's closest <tr> may be missing on a page of another shape
    internal fun malRows(d: org.jsoup.nodes.Document) = d.select("a.hoverinfo_trigger strong").mapNotNull { n ->
        val tr = n.closest("tr") ?: return@mapNotNull null
        MalRow(n.text(), tr.children().getOrNull(2)?.text().orEmpty(), malScore(tr.children().lastOrNull()?.text()), n.closest("a")?.attr("href").orEmpty())
    }
    // a title's own page, with every name it goes by. A search it's sure of goes straight here, with no rows to read
    internal fun malTitle(d: org.jsoup.nodes.Document): MalTitle? {
        if (!Regex("/(anime|manga)/\\d+").containsMatchIn(d.selectFirst("meta[property=og:url]")?.attr("content").orEmpty())) return null
        val lines = d.select(".spaceit_pad").map { it.text() }
        fun line(k: String) = lines.find { it.startsWith("$k:") }?.substringAfter(':')?.trim().orEmpty()
        val names = listOf(d.selectFirst("meta[property=og:title]")?.attr("content").orEmpty(), line("English"), line("Synonyms")) + line("Synonyms").split(", ")
        return MalTitle(names.filter { it.isNotBlank() }, line("Type"), malScore(d.selectFirst("span[itemprop=ratingValue]")?.text()))
    }
    // what it went straight to is what it took the words for: most of them there, under one name or another, and every number (another season's isn't this one)
    internal fun malTrusts(asked: String, t: MalTitle): Boolean {
        val words = Manga.norm(asked).split(' ').filter { it.isNotEmpty() }
        val theirs = t.names.flatMap { Manga.norm(it).split(' ') }.toSet()
        fun digits(l: Collection<String>) = l.flatMap { Regex("\\d+").findAll(it).map { m -> m.value } }.toSet()
        return words.count { it in theirs } * 2 >= words.size && digits(theirs).containsAll(digits(words))
    }
    private fun malNovel(type: String) = "Novel" in type // manga.php has the light novels too, often under the manga's very name
    /**
     * a title's score, asked by each of its names. Rows only by an exact name (a near one is often another season; two of that name: none,
     * rather than the wrong one's). None by name: its first rows' own pages, for one with that name among its others ("My House is a
     * Magic Power Spot" is "Ore no Ie ga Maryoku Spot Datta"). get: a page, null if there's no such page, which is its answer to finding nothing
     */
    internal suspend fun malFind(names: List<String>, kind: String, get: suspend (String) -> String?): Double? {
        val latin = names.map { Witanime.courName(it.trim()) }.filter { Manga.norm(it).isNotEmpty() }.distinct() // its titles are never Arabic
        val want = latin.map(::malNorm).toSet()
        var near = emptyList<MalRow>()
        for (name in latin.take(3)) {
            val d = Jsoup.parse(get("https://myanimelist.net/$kind.php?q=${enc(name)}&cat=$kind") ?: continue)
            val t = malTitle(d)
            if (t != null) { if (!malNovel(t.type) && malTrusts(name, t)) t.score?.let { return it }; continue }
            val rows = malRows(d).filter { !malNovel(it.type) }
            val same = rows.filter { malNorm(it.name) in want }
            same.singleOrNull()?.score?.let { return it }
            if (same.isEmpty() && near.isEmpty()) near = rows.take(2)
        }
        for (r in near) {
            val t = malTitle(Jsoup.parse(get(r.url) ?: continue)) ?: continue
            if (!malNovel(t.type) && t.names.any { malNorm(it) in want }) return t.score
        }
        return null
    }
    suspend fun mal(names: List<String>, kind: String): Double? {
        val key = "mal2|$kind|${names.firstOrNull { Manga.norm(it).isNotEmpty() }?.trim() ?: return null}" // 2: the first version's "none"s were its own misreading: not kept a week more
        Pages.saved(key)?.takeIf { !Pages.due(key, KEPT) }?.let { return it.toDoubleOrNull() } // its pages are 200KB: only the number is kept
        return malFind(names, kind) { url ->
            val r = Net.fetch(url, interactive = false)
            if (r.status == 404) null else if (r.status >= 400) throw java.io.IOException("HTTP ${r.status}") else r.body // not kept: it may just be busy
        }.also { Pages.put(key, it?.toString().orEmpty()) }
    }
    private fun aniKey(c: Card) = "al|${c.path}"
    private const val KEPT = 7 * Pages.DAY
    /**
     * AniList takes 30 requests a minute, and a page of the catalogue is about that many titles: 25 to a request. Each
     * title's score is kept on its own, since the same one comes up in different company next time
     */
    suspend fun primeAniList(cards: List<Card>) = cards.filter { Pages.due(aniKey(it), KEPT) }.chunked(25).forEach { batch ->
        val query = batch.mapIndexed { i, c -> "a$i:Page(perPage:6){media(search:${JSONObject.quote(Credits.clean(c.title))},type:${if (kindOf(c) == "manga") "MANGA" else "ANIME"}){title{romaji english native} synonyms averageScore}}" }.joinToString(" ", "{", "}")
        val data = calm { JSONObject(Net.fetch("https://graphql.anilist.co", json = JSONObject().put("query", query).toString()).body).getJSONObject("data") } ?: return@forEach
        batch.forEachIndexed { i, c -> Pages.put(aniKey(c), SourceRatings.aniScore(data.optJSONObject("a$i")?.optJSONArray("media"), listOf(c.title) + c.names)?.toString().orEmpty()) }
    }
    internal suspend fun <T> calm(go: suspend () -> T): T? = try { go() } catch (e: CancellationException) { throw e } catch (e: Exception) { android.util.Log.w("medflix", "score", e); null }

    /** the scores asked for, of a card these rate; one that can't be had (offline, not found) is none */
    suspend fun get(c: Card, ids: Set<String>): Map<String, Double?> = coroutineScope {
        val i = if ("imdb" in ids) async { calm { imdb(c) } } else null
        val rot = if ("rt" in ids) async { calm { rt(c) } } else null
        ids.associateWith { id -> when (id) { "imdb" -> i?.await()?.a; "mc" -> calm { mc(c) }; "rt" -> rot?.await(); "anilist" -> Pages.saved(aniKey(c))?.toDoubleOrNull(); "mal" -> calm { mal(listOf(c.title) + c.names, kindOf(c)) }; else -> null } } // anilist: primeAniList asked already
    }
}

/**
 * many answers arriving together redraw the screen a few times a second, not once each: every redraw judges all the cards,
 * and one per title kept the main thread from the scrolling. work's coroutines hand theirs in; what's in hand still arrives if it's cancelled
 */
internal suspend fun <T> batched(apply: (List<T>) -> Unit, work: kotlinx.coroutines.CoroutineScope.((T) -> Unit) -> Unit) = coroutineScope {
    val held = ArrayList<T>()
    val flush = { if (held.isNotEmpty()) { apply(held.toList()); held.clear() } }
    val tick = launch { while (true) { delay(300); flush() } }
    try { coroutineScope { work { held += it } } } finally { tick.cancel(); flush() }
}

/** the search's cards as they're looked up, a few at a time */
internal class Looked(val scores: Map<String, Map<String, Double?>>, val left: Int, val total: Int)
@Composable
internal fun scoresOf(cards: List<Card>, f: RateFilter, got: androidx.compose.runtime.snapshots.SnapshotStateMap<String, Map<String, Double?>> = remember { mutableStateMapOf() }): Looked { // got: kept as more cards join and sliders move: a score doesn't change meanwhile
    val rated = { c: Card -> f.asks.filter { id -> RATERS.find { it.id == id }?.kinds?.contains(kindOf(c)) == true } }
    val need = { c: Card -> rated(c).filter { it !in got[c.path].orEmpty() }.toSet() }
    LaunchedEffect(cards, f.asks) {
        val todo = cards.mapNotNull { c -> need(c).ifEmpty { null }?.let { c to it } }
        if (todo.isEmpty()) return@LaunchedEffect
        val primed = async(Dispatchers.IO) { Scores.primeAniList(todo.filter { "anilist" in it.second }.map { it.first }) }
        val gate = kotlinx.coroutines.sync.Semaphore(4)
        batched<Pair<String, Map<String, Double?>>>({ l -> l.forEach { (path, v) -> got[path] = got[path].orEmpty() + v } }) { add ->
            todo.forEach { (c, ids) -> launch { if ("anilist" in ids) primed.await(); add(c.path to withContext(Dispatchers.IO) { gate.withPermit { Scores.get(c, ids) } }) } }
        }
    }
    val asked = cards.filter { rated(it).isNotEmpty() }
    return Looked(got, asked.count { need(it).isNotEmpty() }, asked.size)
}

private val redChip @Composable get() = FilterChipDefaults.filterChipColors(selectedContainerColor = Red, selectedLabelColor = Color.White, selectedLeadingIconColor = Color.White, selectedTrailingIconColor = Color.White)

/** the chip that opens the filter: red, with how many are on, while it's narrowing what's shown */
@Composable
internal fun RateChip(f: RateFilter, kind: String, open: () -> Unit) {
    val n = f.count(kind)
    FilterChip(n > 0 || f.sort.isNotEmpty(), open, { Text(if (n > 0) "${t("rfChip")} · ⁦$n⁩" else t("rfChip")) }, leadingIcon = { Icon(Ic.star, null, Modifier.size(16.dp)) }, trailingIcon = { Icon(Ic.caretDown, null, Modifier.size(12.dp)) }, colors = redChip)
}

/** what's on, one chip each: a tap takes it off without opening the sheet */
@Composable
internal fun RateActive(f: RateFilter, kind: String, set: (RateFilter) -> Unit) {
    val on = RATERS.filter { it.id in f.mins && (kind.isEmpty() || kind in it.kinds) }
    val by = RATERS.find { it.id == f.sort }?.takeIf { kind.isEmpty() || kind in it.kinds }
    if (on.isEmpty() && by == null) return
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        on.forEach { r -> InputChip(true, { set(f.copy(mins = f.mins - r.id)) }, { Text("${r.short} ⁦${r.mark(f.mins.getValue(r.id))}+⁩") }, trailingIcon = { Icon(Ic.x, t("clear"), Modifier.size(14.dp)) }) }
        by?.let { r -> InputChip(true, { set(f.copy(sort = "")) }, { Text("${t("f_sort")}: ${r.short}") }, leadingIcon = { Icon(Ic.sort, null, Modifier.size(14.dp)) }, trailingIcon = { Icon(Ic.x, t("clear"), Modifier.size(14.dp)) }) }
    }
}

/** a score's logo, in the app so it's there at once and offline; IMDb's is wider, the others centred in the same room */
@Composable
private fun RaterLogo(r: Rater) = androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(r.logo), null, Modifier.size(width = 44.dp, height = 32.dp)) // its name is beside it

/**
 * the filter: each score has its own switch and, once on, its slider. Only the scores for the section being searched are
 * listed. It applies as it's moved, the results behind it and the button's count following, and stays set for next time
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RateSheet(f: RateFilter, kind: String, matches: Int?, set: (RateFilter) -> Unit, done: () -> Unit) = ModalBottomSheet(done, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = CardC, contentColor = Color.White) {
    val raters = RATERS.filter { kind.isEmpty() || kind in it.kinds }
    val chip = @Composable { on: Boolean, label: String, pick: () -> Unit -> FilterChip(on, pick, { Text(label) }, colors = redChip) }
    Column(Modifier.weight(1f, false).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t("rfTitle"), Modifier.weight(1f), fontSize = 18.sp, fontWeight = FontWeight.Bold)
            if (f != RateFilter()) TextButton({ set(RateFilter()) }) { Text(t("reset"), color = Red) }
        }
        Text(t("rfHint"), Modifier.padding(bottom = 8.dp), color = Muted, fontSize = 13.sp)
        raters.forEach { r ->
            val min = f.mins[r.id]
            Row(Modifier.fillMaxWidth().toggleable(min != null, role = androidx.compose.ui.semantics.Role.Switch) { on -> set(f.copy(mins = if (on) f.mins + (r.id to r.top * 7 / 10.0) else f.mins - r.id, sort = if (!on && f.sort == r.id) "" else f.sort)) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                RaterLogo(r)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(r.label, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    Text(r.covers(), color = Muted, fontSize = 12.sp)
                }
                if (min != null) Text("⁦${r.mark(min)}+⁩", Modifier.padding(end = 12.dp), color = Color(0xFFF5C518), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Switch(min != null, null, colors = SwitchDefaults.colors(checkedTrackColor = Red))
            }
            // twenty notches: half a star, or 5%; a Float's 6.9999 would refuse a 7.0
            if (min != null) Slider(min.toFloat(), { v -> val x = Math.round(v * 20.0 / r.top) * r.top / 20.0; if (x != min) set(f.copy(mins = f.mins + (r.id to x))) }, Modifier.semantics { contentDescription = r.label }, valueRange = 0f..r.top.toFloat(), steps = 19,
                colors = SliderDefaults.colors(thumbColor = Red, activeTrackColor = Red, activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent))
        }
        if (f.mins.size > 1) {
            Text(t("rfMatch"), Modifier.padding(top = 12.dp, bottom = 4.dp), color = Muted, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                chip(!f.any, t("rfAll")) { set(f.copy(any = false)) }
                chip(f.any, t("rfAny")) { set(f.copy(any = true)) }
            }
        }
        if (f.mins.isNotEmpty()) Row(Modifier.fillMaxWidth().toggleable(f.keep, role = androidx.compose.ui.semantics.Role.Switch) { set(f.copy(keep = it)) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                Text(t("rfKeep"), fontSize = 15.sp)
                Text(t("rfKeepHint"), color = Muted, fontSize = 12.sp)
            }
            Switch(f.keep, null, colors = SwitchDefaults.colors(checkedTrackColor = Red))
        }
        Text(t("f_sort"), Modifier.padding(top = 8.dp, bottom = 4.dp), color = Muted, fontSize = 13.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            chip(f.sort.isEmpty(), t("rfBest")) { set(f.copy(sort = "")) }
            raters.forEach { r -> chip(f.sort == r.id, r.short) { set(f.copy(sort = r.id)) } }
        }
    }
    Button(done, Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), colors = ButtonDefaults.buttonColors(Red)) { Text(if (matches != null) t("rfShow", matches) else t("rfDone"), color = Color.White) }
}

/** how the lookup's going, then how much the filter took out */
@Composable
internal fun RateStatus(l: Looked, hidden: Int) {
    if (l.left > 0) Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        LinearProgressIndicator({ 1f - l.left.toFloat() / maxOf(1, l.total) }, Modifier.fillMaxWidth(), color = Red, trackColor = CardC)
        Text(t("rfChecking", l.total - l.left, l.total), Modifier.padding(top = 4.dp), color = Muted, fontSize = 12.sp)
    } else if (hidden > 0) Text(t("rfHidden", hidden), Modifier.padding(horizontal = 16.dp, vertical = 6.dp), color = Muted, fontSize = 12.sp)
}

/** one section's cards as a grid, or each its own row */
@Composable
internal fun RatedCards(rows: List<Pair<String, List<Card>>>, typed: String, nav: Nav, grid: LazyGridState? = null) { // rows: by section
    if (grid != null) CardsGrid(rows.flatMap { it.second }, nav, grid)
    // a row's title opens that section alone: the same search, as its full grid
    else LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) { rows.forEach { (k, l) -> item { CardRowView(t(k), l, nav, Screen.Search(typed, k)) } } }
}

/** typing with a filter on looks through what it found: by a title's start or middle, or a near spelling */
internal fun narrows(typed: String, c: Card) = typed.isEmpty() || (listOf(c.title) + c.names).any { fold(it).contains(fold(typed)) || closeness(typed, it) >= .62 }

/** a section's catalogue, best rated first where its site can sort. Films and series: the foreign lists, as the raters only know Latin names */
private suspend fun shelf(kind: String, page: Int, seen: MutableSet<String>): Listing = when (kind) {
    "anime" -> Witanime.list("/browse?sort=Top Rated", page).first()
    "cinema" -> coroutineScope {
        val films = async { Cinema.list("english", page) }; val shows = async { Cinema.list("english-series", page) }
        val f = films.await(); val s = shows.await()
        Listing(f.items + s.items, maxOf(f.pages, s.pages))
    }
    else -> Manga.browse(mapOf("order_by" to "-rating"), page, seen)
}
// a show's episodes run on across the list's pages, a different card each
private fun shelfKey(c: Card) = if (kindOf(c) == "cinema") Credits.norm(c.title) + "|" + if (Regex("^/cinema/(serie|season|episode)/").containsMatchIn(c.path)) "" else c.year else c.path

private class Walk {
    val cards = mutableStateMapOf<String, List<Card>>() // by section
    val ended = mutableStateListOf<String>()
    val seen = HashSet<String>() // manga's: one series once across its pages
    private val keys = HashSet<String>() // the cards so far: a new one's checked against these, not every card against every other
    /** cards with their shelfKey, worked out off the main thread: it's slow text matching */
    fun add(k: String, l: List<Pair<String, Card>>) { cards[k] = cards[k].orEmpty() + l.filter { keys.add(it.first) }.map { it.second } }
    var page by mutableIntStateOf(0)
    var goal by mutableIntStateOf(24)
    var run by mutableIntStateOf(0) // pages since the last ask: a strict filter stops after a few and asks, rather than spend hundreds of lookups unseen
    var failed by mutableStateOf(false)
    var stepping by mutableStateOf(false) // a page under way finishes: scores coming in as it goes don't stop it
    var epoch by mutableIntStateOf(0)
    val scores = mutableStateMapOf<String, Map<String, Double?>>()
    private val after = HashMap<String, String>() // each rating list's place
    private val spent = HashSet<String>() // those with no more
    fun more(shown: Int) { goal = shown + 24; run = 0; failed = false }
    /** a minimum changed: the lists were asked with the old one. What's shown stays, only filtered again */
    fun restart() { after.clear(); spent.clear(); ended.remove("cinema"); run = 0; failed = false; epoch++ }
    /** a page of each rating list: each title looked for on the movie site, showing as it's found. False: they've no more */
    suspend fun films(leads: List<String>, f: RateFilter): Boolean = coroutineScope {
        val gate = kotlinx.coroutines.sync.Semaphore(4)
        val pages = leads.filter { it !in spent }.map { id -> async(Dispatchers.IO) { id to Scores.ranked(id, f.mins[id] ?: 0.0, f.sort == id, after[id]) } }.awaitAll()
        batched<Triple<String, Card, Map<String, Double?>>>({ l ->
            l.forEach { (_, c, seed) -> scores[c.path] = scores[c.path].orEmpty() + seed } // the list said: no asking again
            add("cinema", l.map { it.first to it.second })
        }) { hand ->
            pages.forEach { (id, r) -> r.hits.forEach { h -> launch {
                val c = withContext(Dispatchers.IO) { gate.withPermit { Scores.calm { Scores.onSite(h)?.let { it to shelfKey(it) } } } } ?: return@launch
                hand(Triple(c.second, c.first, if (id == "imdb") mapOf("imdb" to h.a) + (h.b?.let { mapOf("mc" to it) }.orEmpty()) else mapOf(id to h.a)))
            } } }
        }
        pages.forEach { (id, r) -> r.next?.let { after[id] = it } ?: spent.add(id) }
        leads.any { it !in spent }
    }
}

/**
 * nothing typed, a filter on: the sections it rates are gone through page by page, keeping what passes, until there's a
 * screenful or it's looked far enough; scrolling to the end or Find more goes on. A section no score turned on rates stays
 * out of it. Films start from the rating sites' own lists (the movie site lists newest first, mostly low scores); anime and
 * manga from their sites' best rated, as AniList takes 25 titles to a request where its list would mean a site search each.
 * What's typed meanwhile only looks through what's been found; everywhere: the whole sites' search instead
 */
@Composable
internal fun RateShelf(f: RateFilter, kind: String, typed: String, nav: Nav, set: (RateFilter) -> Unit, everywhere: () -> Unit, matches: (Int?) -> Unit) {
    val kinds = f.sections(kind)
    if (kinds.isEmpty()) {
        SideEffect { matches(null) }
        if (kind != "novels") Text(t("rfStart"), Modifier.fillMaxWidth().padding(32.dp), color = Muted, fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        return
    }
    val leads = f.leads()
    val w = remember(kinds, leads) { Walk() }
    val all = kinds.flatMap { w.cards[it].orEmpty() }
    val looked = scoresOf(all, f, w.scores)
    // once a slider has settled, not on each notch of it
    val floors = leads?.map { f.mins[it] }
    var settled by remember(w) { mutableStateOf(floors) }
    LaunchedEffect(w, floors) { if (floors != settled) { delay(600); settled = floors; w.restart() } }
    Store.version.intValue // a title hidden
    val passed = kinds.map { k -> k to f.apply(w.cards[k].orEmpty().filter { !isHidden(it) }, looked.scores) }
    val found = passed.sumOf { it.second.size } // how far it's gone is by these: what's typed doesn't send it looking further
    val rows = passed.map { (k, l) -> k to l.filter { narrows(typed, it) } }
    val shown = rows.sumOf { it.second.size }
    SideEffect { matches(shown) }
    val over = w.ended.containsAll(kinds)
    val walking = (looked.left == 0 || w.stepping) && found < w.goal && w.run < 3 && !over && !w.failed
    LaunchedEffect(w, walking, w.page, w.epoch) {
        if (!walking) return@LaunchedEffect
        w.stepping = true
        try {
            val n = w.page + 1
            val got = kinds.filter { it !in w.ended }.map { k -> async {
                k to try {
                    if (k == "cinema" && leads != null) w.films(leads, f)
                    else withContext(Dispatchers.Default) { shelf(k, n, w.seen).let { l -> l to l.items.map { shelfKey(it) to it } } }.let { (l, keyed) -> w.add(k, keyed); l.items.isNotEmpty() && n < l.pages }
                } catch (e: CancellationException) { throw e } catch (e: Exception) { android.util.Log.w("medflix", "shelf $k", e); null }
            } }.awaitAll()
            if (got.all { it.second == null }) { w.failed = true; return@LaunchedEffect }
            got.forEach { (k, more) -> if (more != true) w.ended += k } // one that failed sits out: the others go on
            w.run++; w.page = n
        } finally { w.stepping = false }
    }
    val grid = rememberLazyGridState()
    val nearEnd by remember { derivedStateOf { grid.layoutInfo.let { (it.visibleItemsInfo.lastOrNull()?.index ?: 0) >= it.totalItemsCount - 6 } } }
    LaunchedEffect(nearEnd, found, looked.left, typed) { if (nearEnd && typed.isEmpty() && found >= w.goal && looked.left == 0 && !over) w.more(found) }
    Column {
        when {
            looked.left > 0 -> RateStatus(looked, 0)
            walking -> Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                LinearProgressIndicator(Modifier.fillMaxWidth(), color = Red, trackColor = CardC)
                Text(t("rfWalking"), Modifier.padding(top = 4.dp), color = Muted, fontSize = 12.sp)
            }
            else -> Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (w.failed) t("unreachable") else t("rfWent", all.size), Modifier.weight(1f), color = Muted, fontSize = 12.sp)
                if (w.failed) TextButton({ w.more(found) }) { Text(t("retry"), color = Red) }
                else if (typed.isNotEmpty()) TextButton(everywhere) { Text(t("rfEverywhere"), color = Red) }
                else if (!over) TextButton({ w.more(found) }) { Text(t("rfMore"), color = Red) }
            }
        }
        if (shown > 0) RatedCards(rows, typed, nav, grid.takeIf { kinds.size == 1 })
        else if (!walking && looked.left == 0 && !w.failed) {
            if (typed.isEmpty()) Empty(t("rfNone"), t("rfNoneHint")) { Button({ set(RateFilter()) }, colors = ButtonDefaults.buttonColors(Red)) { Text(t("reset")) } }
            else Empty(t("nothing"), t("rfNotHere")) { Button(everywhere, colors = ButtonDefaults.buttonColors(Red)) { Text(t("rfEverywhere")) } }
        }
    }
}
