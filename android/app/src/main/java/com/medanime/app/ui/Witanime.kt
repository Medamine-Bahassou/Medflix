package com.medanime.app.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.IOException
import java.net.URI
import java.net.URLEncoder

// scraper.js in Kotlin: witanime's HTML (Laravel + Livewire, server-rendered) into plain objects
// open: where it leads when that isn't its show's page (a manga's latest chapter, a series' episode); names: all its titles
// (manga: to spot one series on both sites); desc: its story, for the cover slider
data class Card(val path: String, val type: String, val title: String, val poster: String, val rating: String, val year: String,
                val badge: String, val ep: String?, val showPath: String, val open: Screen? = null, val names: List<String> = emptyList(),
                val desc: String = "", val dub: Boolean = false)
data class Hero(val path: String, val watch: String, val title: String, val desc: String, val banner: String)
data class CardRow(val title: String, val items: List<Card>)
data class HomePage(val hero: List<Hero>, val rows: List<CardRow>)
data class Listing(val items: List<Card>, val pages: Int)
data class Episode(val path: String, val ep: String)
data class EpInfo(val name: String, val thumb: String)
data class Details(val path: String, val title: String, val alt: String, val desc: String, val genres: List<String>, val tags: List<String>,
                   val info: List<Pair<String, String>>, val trailer: String, val poster: String, val banner: String,
                   val episodes: List<Episode>, val related: List<Card>)
data class Server(val label: String, val quality: String, val token: String, val url: String? = null) // url: the host's player, saved from an earlier play (no token needed)

object Witanime {
    private fun txt(e: Element?) = e?.text()?.trim() ?: ""
    private fun pathOf(href: String) = try { URI(SITE).resolve(href.trim()).rawPath ?: "" } catch (e: Exception) { "" }
    private fun src(i: Element?) = i?.attr("data-src")?.ifEmpty { null } ?: i?.attr("src") ?: ""

    // compiled once: cards() runs them on every link of a page
    private val CARD = Regex("^/(anime|movie|watch)/([^/]+)(?:/([^/]+))?$")
    private val BADGE = Regex("الحلقة|TV|Movie|OVA|ONA|Special|فيلم", RegexOption.IGNORE_CASE)
    private val RATING = Regex("^\\d+\\.\\d+$")
    private val YEAR = Regex("^(19|20)\\d\\d$")

    /** any poster card: /anime/x, /movie/x or /watch/x/ep with an <img> and <h3> */
    fun cards(root: Element): List<Card> {
        val seen = HashSet<String>()
        return root.select("a[href]").mapNotNull { a ->
            val p = pathOf(a.attr("href"))
            val m = CARD.find(p) ?: return@mapNotNull null
            val poster = src(a.selectFirst("img")).ifEmpty { return@mapNotNull null }
            val ttl = a.selectFirst("h3, h2, h4") ?: return@mapNotNull null
            if (!seen.add(p)) return@mapNotNull null
            val (kind, a2, a3) = m.destructured
            val spans = a.select("[dir=ltr] span").map(::txt)
            val badge = a.select("div, span").map(::txt).find { it.length < 20 && BADGE.containsMatchIn(it) }
            Card(p, if (kind == "watch") "episode" else kind, txt(ttl), poster,
                spans.find { RATING.matches(it) } ?: "",
                spans.find { YEAR.matches(it) } ?: "",
                (badge ?: "").replace("الحلقة", "EP"),
                if (kind == "watch") a3 else null,
                if (kind == "watch") (if (a2 == "movie") "/movie/$a3" else "/anime/$a2") else p)
        }
    }

    // sorted listings paginate with Livewire buttons (wire:click="gotoPage(N)") instead of links
    private fun maxPage(doc: Document, base: String) = (doc.select("a[href]").mapNotNull { Regex("^${Regex.escape(base)}/page/(\\d+)$").find(pathOf(it.attr("href")))?.groupValues?.get(1)?.toInt() } +
        doc.select("[wire:click^=gotoPage(]").mapNotNull { Regex("\\d+").find(it.attr("wire:click"))?.value?.toInt() }).maxOrNull()?.coerceAtLeast(1) ?: 1

    fun home(doc: Document): HomePage {
        val hero = doc.select("[data-hero-slide]").map { s ->
            val links = s.select("a[href]").map { pathOf(it.attr("href")) }
            val img = s.select("img").find { Regex("banners|posters").containsMatchIn(src(it)) }
            Hero(links.find { Regex("^/(anime|movie)/").containsMatchIn(it) } ?: "", links.find { it.startsWith("/watch/") } ?: "",
                txt(s.selectFirst("h2, h1, .text-balance")).ifEmpty { img?.attr("alt") ?: "" },
                s.select("p").map(::txt).maxByOrNull { it.length } ?: "", src(img))
        }.filter { it.path.isNotEmpty() && it.banner.isNotEmpty() }
        val rows = mutableListOf<CardRow>()
        for (h2 in doc.select("main h2, h2")) {
            var box: Element? = h2.parent()
            // climb to the box holding its cards; a cheap look for a poster link first, the full parse once
            for (i in 0 until 6) { if (box == null || box.selectFirst("a[href] img") != null) break; box = box.parent() }
            val items = box?.let(::cards) ?: emptyList()
            if (items.isNotEmpty() && rows.none { it.items[0].path == items[0].path }) rows += CardRow(txt(h2), items)
        }
        return HomePage(hero, rows)
    }

    fun list(doc: Document, url: String) = Listing(cards(doc.selectFirst("main") ?: doc), maxPage(doc, pathOf(url).replace(Regex("/page/\\d+$"), "")))

    fun details(doc: Document, url: String): Details {
        val ld = doc.select("script[type=application/ld+json]").mapNotNull { runCatching { JSONObject(it.data()) }.getOrNull() }
            .find { it.optString("@type") in listOf("TVSeries", "Movie") } ?: JSONObject()
        fun flat(k: String) = ld.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: listOfNotNull(ld.optString(k).ifEmpty { null })
        fun og(p: String) = doc.selectFirst("meta[property=og:$p]")?.attr("content") ?: ""
        val h1 = doc.selectFirst("main h1, h1")
        val box = h1?.closest("section") ?: doc.selectFirst("main") ?: doc
        val alt = h1?.nextElementSibling()?.takeIf { it.tagName() == "p" }?.let(::txt)?.ifEmpty { null } ?: flat("alternateName").firstOrNull() ?: ""
        val kids = h1?.parent()?.children() ?: emptyList()
        val meta = kids.firstOrNull { it.tagName() == "div" }
        val ps = kids.filter { it.tagName() == "p" && txt(it) != alt }
        val desc = ps.map(::txt).maxByOrNull { it.length } ?: ld.optString("description").ifEmpty { og("description") }
        val genres = ps.find { txt(it) == desc }?.nextElementSibling()?.children()?.filter { it.tagName() == "span" }?.map(::txt)?.ifEmpty { null } ?: flat("genre")
        val info = box.select("div").filter { d -> d.childrenSize() == 2 && d.child(0).tagName() == "span" && d.child(1).tagName() == "p" }.map { txt(it.child(0)) to txt(it.child(1)) }
        val imgs = box.select("img").map(::src)
        val trailer = doc.selectFirst("iframe[src*=youtube]")?.attr("src") ?: "" // jsoup reads <template> contents as plain children
        val seen = HashSet<String>()
        val episodes = doc.select("a[href*=/watch/]").map { pathOf(it.attr("href")) }.filter(seen::add)
            .map { Episode(it, if (it.startsWith("/watch/movie/")) "Movie" else it.substringAfterLast('/')) }
            .let { l -> if (l.all { it.ep.toDoubleOrNull() != null }) l.sortedBy { it.ep.toDouble() } else l }
        val self = pathOf(url)
        val ldImgs = flat("image")
        return Details(self, txt(h1).ifEmpty { ld.optString("name").ifEmpty { og("title") } }, alt, desc, genres,
            meta?.children()?.map(::txt)?.filter { it.isNotEmpty() } ?: emptyList(), info, trailer,
            imgs.find { "/posters/" in it } ?: ldImgs.find { "/posters/" in it } ?: og("image"),
            imgs.find { "/banners/" in it } ?: ldImgs.find { "/banners/" in it } ?: imgs.firstOrNull() ?: og("image"),
            episodes, cards(doc).filter { it.path != self && it.type != "episode" })
    }

    private fun <T> parsed(url: String, force: Boolean, parse: (Document) -> T) = flow {
        Pages.flow(SITE + url, force).collect { val at = System.currentTimeMillis(); emit(parse(Jsoup.parse(it, SITE)).also { android.util.Log.d("medflix", "parsed $url in ${System.currentTimeMillis() - at}ms") }) }
    }.flowOn(Dispatchers.Default)

    fun home(force: Boolean = false) = parsed("/", force, ::home)
    fun details(path: String, force: Boolean = false) = parsed(path, force) { details(it, path) }
    // base may carry a query (/browse?sort=...); the page number goes before it
    fun list(base: String, page: Int = 1, force: Boolean = false): Flow<Listing> {
        val p = base.substringBefore('?'); val q = base.substringAfter('?', "")
        val url = (if (page > 1) "$p/page/$page" else p) + (if (q.isNotEmpty()) "?$q" else "")
        return parsed(url, force) { list(it, url) }
    }
    fun search(q: String) = list("/search?q=" + URLEncoder.encode(q, "UTF-8"))

    // the home page's "latest episodes" row pages through /new-episodes?page=N: { html, hasOlder }; the site gives no page
    // count, so pages is one past this one while older ones exist (scraper.js newEpisodes)
    fun newEpisodes(page: Int, force: Boolean = false) = flow {
        Pages.flow("$SITE/new-episodes?page=$page", force).collect { text ->
            val d = JSONObject(text)
            emit(Listing(cards(Jsoup.parse(d.optString("html"), SITE)), page + if (d.optBoolean("hasOlder")) 1 else 0))
        }
    }.flowOn(Dispatchers.Default)

    // ---------- kitsu: episodes' names and stills, witanime lists numbers only (scraper.js episodeInfo) ----------
    private const val KITSU = "https://kitsu.io/api/edge"
    private fun fold(s: String) = s.lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    /** episode number -> its name and still, for a show found on kitsu by one of its names (only an exact one: a near miss is often another season) */
    suspend fun episodeInfo(names: List<String>): Map<Int, EpInfo> = kotlinx.coroutines.coroutineScope {
        val want = names.map(::fold).filter { it.isNotEmpty() }
        if (want.isEmpty()) return@coroutineScope emptyMap()
        val enc = { v: String -> URLEncoder.encode(v, "UTF-8").replace("+", "%20") }
        val found = JSONObject(Pages.load("$KITSU/anime?${enc("filter[text]")}=${enc(names[0])}&${enc("page[limit]")}=5&${enc("fields[anime]")}=canonicalTitle,titles")).optJSONArray("data")
        val id = (0 until (found?.length() ?: 0)).map { found!!.getJSONObject(it) }.firstOrNull { a ->
            val at = a.getJSONObject("attributes"); val ts = at.optJSONObject("titles")
            (listOf(at.optString("canonicalTitle")) + (ts?.keys()?.asSequence()?.map { ts.optString(it) }?.toList() ?: emptyList())).any { fold(it) in want }
        }?.optString("id") ?: return@coroutineScope emptyMap()
        val page = { o: Int -> async { runCatching { JSONObject(Pages.load("$KITSU/anime/$id/episodes?sort=number&${enc("page[limit]")}=20&${enc("page[offset]")}=$o&${enc("fields[episodes]")}=number,canonicalTitle,titles,thumbnail")) }.getOrNull() } }
        val first = page(0).await() ?: return@coroutineScope emptyMap()
        val count = first.optJSONObject("meta")?.optInt("count") ?: 0
        // ponytail: kitsu gives 20 a page, so a 1000-episode show is 50 requests (once, then cached); 5 at a time to stay polite
        val rest = (20 until count step 20).chunked(5).flatMap { os -> os.map(page).awaitAll() }
        (listOf(first) + rest).filterNotNull().flatMap { p -> p.optJSONArray("data")?.let { d -> (0 until d.length()).map { d.getJSONObject(it).getJSONObject("attributes") } } ?: emptyList() }
            .associate { a ->
                val ts = a.optJSONObject("titles")
                a.optInt("number") to EpInfo(a.optString("canonicalTitle").takeIf { it.isNotEmpty() && it != "null" }
                    ?: listOf("en_us", "en", "en_jp").firstNotNullOfOrNull { ts?.optString(it)?.takeIf { s -> s.isNotEmpty() && s != "null" } } ?: "",
                    a.optJSONObject("thumbnail")?.optString("original").orEmpty())
            }
    }

    // home rows the site has a full listing for (app.js SECTIONS); the latest episodes row pages on its own (newEpisodes)
    val SECTIONS = mapOf("الأكثر مشاهدة" to "/browse?sort=Most Viewed", "أكثر الأنميات مشاهدة" to "/browse?sort=Most Viewed",
        "أكثر الأفلام مشاهدة" to "/movies?sort=Most Viewed", "أشهر أنميات الموسم" to "/seasonal", "أحدث الأفلام" to "/movies")
    const val NEW_EPISODES = "أحدث الحلقات"

    // ---------- servers (mobile.js manifest / stream) ----------
    private var csrf = ""
    private suspend fun post(url: String) = Net.fetch(SITE + url, mapOf("sec-ch-ua" to Net.ch, "Accept" to "application/json", "X-CSRF-TOKEN" to csrf), post = true)

    // the episode's answer (players and download links), shared by the player and its download menu for a few minutes
    private var last: Triple<String, Long, JSONObject>? = null
    // one at a time: the player and the download menu asking together each started a session, the second's csrf token
    // replaced the first's, and one came back with no servers (on a fresh install, the first episode opened)
    private val asking = kotlinx.coroutines.sync.Mutex()
    private suspend fun manifest(epPath: String): JSONObject = asking.withLock { manifestNow(epPath) }
    private suspend fun manifestNow(epPath: String): JSONObject {
        last?.let { (p, at, j) -> if (p == epPath && System.currentTimeMillis() - at < 5 * 60_000) return j }
        if (!Regex("^/watch/[^?#]+$").matches(epPath)) throw IOException("bad path")
        val page = Net.fetch(SITE + epPath, mapOf("sec-ch-ua" to Net.ch), stopAt = "name=\"csrf-token\" content=\"[^\"]+\"") // read only up to it
        if (page.status == 429) throw IOException("rate-limited")
        if (page.status >= 400) throw IOException("episode page HTTP ${page.status}")
        csrf = Regex("name=\"csrf-token\" content=\"([^\"]+)\"").find(page.body)?.groupValues?.get(1) ?: ""
        val res = post("$epPath/sources")
        if (res.status == 429) throw IOException("rate-limited")
        if (res.status >= 400) throw IOException("sources HTTP ${res.status}")
        val j = JSONObject(res.body)
        if ((j.optJSONObject("players")?.length() ?: 0) == 0) { // not kept: the next open asks again
            android.util.Log.w("medflix", "no players: ${page.status} csrf=${csrf.isNotEmpty()} ${res.status} ${res.body.take(300)}")
            return j
        }
        return j.also { last = Triple(epPath, System.currentTimeMillis(), it) }
    }
    val QUALITY = listOf("4K", "FHD", "HD", "SD")
    private fun flat(by: JSONObject?) = (by ?: JSONObject()).keys().asSequence()
        .flatMap { q -> by!!.getJSONArray(q).let { a -> (0 until a.length()).map { a.getJSONObject(it) } }.map { Server(it.optString("label"), q, it.optString("token")) } }
        .sortedBy { QUALITY.indexOf(it.quality) }.toList()

    /** an episode's servers, best quality first, one per host */
    suspend fun sources(epPath: String): List<Server> {
        val seen = HashSet<String>() // sites list one host several times in different qualities: keep the best
        return flat(manifest(epPath).optJSONObject("players")).filter { seen.add(it.label.lowercase().substringBefore(' ')) }
    }
    /** its download links, every host and quality (MediaFire's the app downloads itself; the rest open in the browser) */
    suspend fun downloadLinks(epPath: String) = flat(manifest(epPath).optJSONObject("downloads"))

    /** a download token -> the host's page for it (download gates answer only the site's own page loads) */
    suspend fun downloadPage(token: String): String {
        if (!Regex("^[a-f0-9]{64}$").matches(token)) throw IOException("bad token")
        val src = post("/watch/download-source/$token")
        if (src.status >= 400) throw IOException("server HTTP ${src.status}")
        val r = Net.fetch("$SITE/watch/download-gate/$token", mapOf("sec-ch-ua" to Net.ch, "Sec-Fetch-Dest" to "document", "Sec-Fetch-Mode" to "navigate", "Sec-Fetch-Site" to "same-origin"), redirects = false)
        return r.header("location") ?: r.url.takeIf { !it.startsWith(SITE) } ?: throw IOException("gate HTTP ${r.status}")
    }
    /** MediaFire's direct file link, for the app's own download (mobile.js downloadUrl) */
    suspend fun downloadUrl(token: String): String {
        val page = downloadPage(token)
        if (!java.net.URI(page).host.endsWith("mediafire.com")) throw IOException("unsupported host")
        return Regex("href=\"(https://download\\d*\\.mediafire\\.com/[^\"]+)\"").find(Net.fetch(page).body)?.groupValues?.get(1) ?: throw IOException("no download link")
    }

    /** a server's token -> the host's player address */
    suspend fun stream(token: String): String {
        if (!Regex("^[a-f0-9]{64}$").matches(token)) throw IOException("bad token")
        val src = post("/watch/stream-source/$token")
        if (src.status >= 400) throw IOException("server HTTP ${src.status}")
        // stream gates only answer iframe loads: always asked natively, as the WebView (its user agent and cookies), never through the page
        val r = Net.fetch("$SITE/watch/stream-gate/$token", mapOf("sec-ch-ua" to Net.ch, "Sec-Fetch-Dest" to "iframe", "Sec-Fetch-Mode" to "navigate", "Sec-Fetch-Site" to "same-origin"), redirects = false)
        return r.header("location") ?: r.url.takeIf { !it.startsWith(SITE) } ?: throw IOException("gate HTTP ${r.status}")
    }

    // ---------- ristoanime: backup servers for series' episodes (scraper.js ristoanime) ----------
    // never listed: its own search finds only whole series, some under other names, so WordPress's API is searched for the
    // episode's own post ("انمي Black Clover الموسم 2 الحلقة 4 مترجمة اون لاين"); its servers sit on the episode's /watch page
    private const val RA = "https://ristoanime.me"
    private val AR_NTH = listOf("الاول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر")
    private val ORD = listOf("first", "second", "third", "fourth", "fifth", "sixth")
    // "Black Clover 2nd Season" -> ("Black Clover", 2); null for later cours / parts: their numbering can't be mapped (scraper.js splitSeason)
    private fun splitSeason(title: String): Pair<String, Int>? {
        if (Regex("\\b(?:cour|part)\\s*[2-9]\\b", RegexOption.IGNORE_CASE).containsMatchIn(title)) return null
        var season = 1
        val base = Regex("\\b(?:(\\d+)(?:st|nd|rd|th)|(first|second|third|fourth|fifth|sixth))\\s+season\\b|\\bseason\\s+(\\d+)\\b", RegexOption.IGNORE_CASE)
            .replace(title) { m -> val (n, w, n2) = m.destructured; season = n.ifEmpty { n2 }.toIntOrNull() ?: (ORD.indexOf(w.lowercase()) + 1); "" }
            .replace(Regex("\\b(?:cour|part)\\s*1\\b", RegexOption.IGNORE_CASE), "").replace(Regex("[\\s:\\-–]+$"), "").trim()
        return base to season
    }

    /** the same episode's servers on ristoanime, found by its title (films: none) */
    suspend fun ristoanime(title: String, alt: String, ep: String): List<Server> {
        val (base, season) = splitSeason(title) ?: return emptyList()
        val n = ep.toDoubleOrNull()?.let { if (it % 1 == 0.0) it.toLong().toString() else it.toString() } ?: return emptyList()
        val named = base != title.trim() // witanime's title says which season
        for (name in listOfNotNull(base, splitSeason(alt)?.first).filter { Manga.norm(it).isNotEmpty() }) { // latin names only: similar() ignores the rest
            val posts = org.json.JSONArray(Net.fetch("$RA/wp-json/wp/v2/posts?per_page=100&_fields=link,title&search=" + URLEncoder.encode("$name $n", "UTF-8")).body)
            val hits = (0 until posts.length()).mapNotNull { i ->
                val p = posts.getJSONObject(i)
                val t = Jsoup.parse(p.optJSONObject("title")?.optString("rendered").orEmpty()).text().replace(Regex("[أإآ]"), "ا")
                val m = Regex("^انمي\\s+(.+?)(?:\\s+الموسم\\s+(\\S+))?\\s+الحلقة\\s+(\\d+(?:\\.\\d+)?)").find(t) ?: return@mapNotNull null
                val (b, s, e) = m.destructured
                if (e != n || similar(b, name) < .75) null else p.optString("link") to (if (s.isEmpty()) 1 else s.toIntOrNull() ?: (AR_NTH.indexOf(s) + 1))
            }
            // its season numbers can differ from witanime's split ones: an unnamed season takes the only one it has
            val hit = hits.find { it.second == season } ?: hits.firstOrNull()?.takeIf { !named && hits.map { h -> h.second }.toSet().size == 1 } ?: continue
            val u = hit.first.trimEnd('/') + "/watch"
            return Jsoup.parse(Net.fetch(u).body, u).select("li[data-watch]").map { it.attr("data-watch") }.filter { it.startsWith("https://") }.map { Server(Cinema.host(it), "", "", it) }
        }
        return emptyList()
    }

    // ---------- animeschedule.net: the anime schedule (scraper.js airTimes / airScore) ----------
    private const val AS = "https://animeschedule.net"
    // the timetable's "2026-10-28T14:30+01:00", read where SimpleDateFormat's ISO zone (X) isn't (before Android 7)
    private fun isoMs(s: String) = runCatching {
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mmZ", java.util.Locale.US).parse(s.take(16) + (Regex("([+-]\\d\\d):?(\\d\\d)$").find(s)?.let { it.groupValues[1] + it.groupValues[2] } ?: "+0000"))!!.time
    }.getOrNull()
    // its timetable (this week, Monday to Sunday), one entry per show (by its slug, "route"): its Japanese airing (raw) over sub, then dub
    suspend fun airTimes(force: Boolean = false): List<Air> {
        val html = Pages.load("$AS/", force)
        return withContext(Dispatchers.Default) {
            val rank = mapOf("raw" to 0, "sub" to 1, "dub" to 2)
            val best = LinkedHashMap<String, Pair<Int, Air>>()
            Jsoup.parse(html, AS).select(".timetable-column-show[route]").forEach { s ->
                val route = s.attr("route")
                val at = isoMs(s.selectFirst("time.show-air-time")?.attr("datetime") ?: "") ?: return@forEach
                val r = rank[s.selectFirst("[airtype]")?.attr("airtype")] ?: 3
                if ((best[route]?.first ?: 9) <= r) return@forEach
                best[route] = r to Air(route, txt(s.selectFirst(".show-title-bar")), at,
                    s.selectFirst("img[data-src]")?.attr("data-src") ?: src(s.selectFirst("img.show-poster")), txt(s.selectFirst(".show-episode")).replace(Regex("^\\D+"), ""))
            }
            best.values.map { it.second }
        }
    }
    // a title's words as both sites can agree on them: "2nd Season" / "Season 2" / "II" / a last "2" -> s2, "Cour 2" / "Part 2" /
    // "2nd Cour" -> p2 (season and part 1 dropped), long vowels shortened (Reijou / Reijo, Juuou / Jyu Oh)
    private fun airWords(s: String) = " ${Manga.norm(s)} "
        .replace(Regex(" (\\d+)(?:st|nd|rd|th) season(?= )| season ?(\\d+)(?= )")) { " s" + it.groupValues[1].ifEmpty { it.groupValues[2] } }
        .replace(Regex(" (?:cour|part) (\\d+)(?= )| (\\d+)(?:st|nd|rd|th) cour(?= )")) { " p" + it.groupValues[1].ifEmpty { it.groupValues[2] } }
        .replace(Regex(" (ii|iii|\\d)(?= $)")) { it.groupValues[1].let { n -> " s" + if (n[0] == 'i') n.length else n } }
        .replace(Regex(" [sp]1(?= )"), "")
        .replace("jy", "j").replace("uu", "u").replace(Regex("o[uh]"), "o").split(' ').filter { it.isNotEmpty() }
    // how alike two titles are, 0-1: 1 for the same words; 0 for another season or part; else the words of one found in the
    // other, over the longer one's count (a word matching a longer one it starts: Ranma1 / Ranma)
    fun airScore(a: String, b: String): Double {
        val x = airWords(a); val y = airWords(b)
        if (x.joinToString("") == y.joinToString("")) return 1.0
        fun part(l: List<String>) = l.filter { Regex("^[sp]\\d+$").matches(it) }.sorted().joinToString(",")
        if (part(x) != part(y)) return 0.0
        fun like(u: String, v: String) = u == v || u.length >= 4 && v.length >= 4 && (u.startsWith(v) || v.startsWith(u))
        return x.count { u -> y.any { like(u, it) } }.toDouble() / maxOf(x.size, y.size)
    }
    /**
     * a show's next airing (a schedule card's match, the other way round): the timetable's best-matching title, if alike
     * enough. Aired already this week: the same time a week on, the episode after (app.js nextAir)
     */
    suspend fun nextAir(names: List<String>): Air? {
        val ns = names.filter { it.isNotBlank() }.ifEmpty { return null }
        val a = airTimes().map { a -> ns.maxOf { airScore(a.title, it) } to a }.filter { it.first >= .6 }.maxByOrNull { it.first }?.second ?: return null
        return if (a.at > System.currentTimeMillis()) a else a.copy(at = a.at + 7 * 86_400_000L, ep = a.ep.toIntOrNull()?.plus(1)?.toString() ?: "")
    }
}

data class Air(val route: String, val title: String, val at: Long, val poster: String, val ep: String)
