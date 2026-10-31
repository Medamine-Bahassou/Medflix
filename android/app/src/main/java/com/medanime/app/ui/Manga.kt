package com.medanime.app.ui

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import java.net.URLEncoder

// manga.js in Kotlin: MeshManga's catalogue (the JSON API its site runs on, appswat.com) merged with Olympus Staff's (Team-X)
data class MSeries(val id: String, val title: String, val alt: String, val story: String, val type: String, val status: String,
                   val genres: List<String>, val poster: String, val cover: String, val rating: String, val views: Long,
                   val names: List<String> = emptyList(), val chapters: List<Ch> = emptyList())
data class Ch(val id: String, val n: String)
data class MChapter(val id: String, val n: String, val prev: String?, val next: String?, val serieId: String, val serieTitle: String, val seriePoster: String, val images: List<String>)
// chapters newest first, one per number; ids: the series' ids on both sites; alts: a number's copies when there are several (the reader's source picker)
class MFull(val s: MSeries, val chs: List<Ch>, val ids: List<String>, val alts: Map<String, List<Ch>> = emptyMap())

object Manga {
    private const val API = "https://appswat.com/v2/api/v2/"
    // Olympus Staff: plain pages (no API), read with Jsoup. Its ids carry "o:": series o:<slug>, chapter o:<slug>:<number>
    private const val OLY = "https://olympustaff.com/"
    private fun q(params: Map<String, Any>) = if (params.isEmpty()) "" else "?" + params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value.toString(), "UTF-8")}" }
    fun mUrl(path: String, params: Map<String, Any> = emptyMap()) = API + path + q(params)
    private suspend fun json(url: String, force: Boolean = false) = JSONObject(Pages.load(url, force))
    private suspend fun doc(url: String, force: Boolean = false) = Jsoup.parse(Pages.load(url, force), url)

    // the API's fixed ids, with labels
    val TYPES = listOf(Triple("131", "مانهوا", "Manhwa"), Triple("132", "مانها", "Manhua"), Triple("133", "مانجا", "Manga"), Triple("134", "كوميك", "Comic"))
    val STATUS = listOf(Triple("79", "مستمر", "Ongoing"), Triple("80", "مكتمل", "Completed"), Triple("81", "متوقف", "Hiatus"))
    val SORT = listOf("" to "mSortNew", "-views_count" to "mSortViews", "-rating" to "mSortRating", "title" to "mSortTitle")
    fun label(list: List<Triple<String, String, String>>, v: String) = list.find { it.first == v }?.let { if (Store.lang == "ar") it.second else it.third } ?: v
    fun typeName(name: String) = TYPES.find { it.third.equals(name, true) }?.let { if (Store.lang == "ar") it.second else it.third } ?: name

    // chapter labels carry extras ("FREE 1", "153 [S3 START]", "05 (side story)"): just the number
    fun chNum(v: Any?): String {
        val m = Regex("(?<![a-z\\d.])\\d+(\\.\\d+)?", RegexOption.IGNORE_CASE).find(v?.toString() ?: "") ?: return v?.toString() ?: ""
        val d = m.value.toDouble()
        return if (d % 1 == 0.0) d.toLong().toString() else d.toString()
    }
    private fun rating(v: Double) = if (v > 0) "%.1f".format(java.util.Locale.US, v) else ""
    private fun JSONArray.objs() = (0 until length()).map { getJSONObject(it) }
    private fun JSONObject.str(k: String) = if (isNull(k)) "" else optString(k)

    private fun mCard(s: JSONObject) = Card("/manga/series/${s.get("id")}", "manga", s.str("title"),
        s.optJSONObject("poster")?.let { it.str("medium").ifEmpty { it.str("thumbnail") } } ?: "", rating(s.optDouble("rating", 0.0)), "",
        s.optJSONObject("type")?.str("name")?.let(::typeName) ?: "", null, "/manga/series/${s.get("id")}")
    // its types in its words, as MangaSwat's (the rest kept as they are)
    private val O_TYPES = mapOf("مانهوا كورية" to "Manhwa", "مانها صيني" to "Manhua", "مانجا ياباني" to "Manga")
    private fun oType(s: String) = O_TYPES[s.trim()]?.let(::typeName) ?: s.trim()
    private fun oCard(slug: String, title: String, poster: String, type: String) =
        Card("/manga/series/o:$slug", "manga", title.trim(), poster, "", "", oType(type), null, "/manga/series/o:$slug", names = listOf(title.trim()))
    // a listing's cards: the series list's (.bsx) or the search's (.tx-card)
    private fun oCards(d: org.jsoup.nodes.Document) = d.select(".bsx > a[href], a.tx-card[href]").mapNotNull { a ->
        val slug = a.attr("href").substringAfter("/series/", "").takeIf { it.isNotEmpty() && '/' !in it && '?' !in it } ?: return@mapNotNull null
        oCard(slug, a.attr("title").ifEmpty { a.selectFirst(".tx-card-title")?.text() ?: "" }, a.selectFirst("img")?.attr("src") ?: "", a.selectFirst(".type, .tx-type")?.text() ?: "")
    }
    // the last of a listing's page links (?page=N), 1 when there are none
    private fun lastPage(d: org.jsoup.nodes.Document, base: String) = d.select("a[href^=$base?page=], a[href^=$base&page=]").maxOfOrNull { it.attr("href").substringAfterLast("page=").substringBefore('&').toIntOrNull() ?: 1 } ?: 1

    class Page(val items: List<Card>, val count: Int)
    suspend fun list(params: Map<String, Any>, force: Boolean = false) = json(mUrl("series/", params), force).let { j -> Page(j.getJSONArray("results").objs().map(::mCard), j.optInt("count")) }
    // its listing (type) or its search (keyword): a page of cards, and how many pages there are
    private suspend fun oList(p: Map<String, Any>, page: Int, force: Boolean = false): Pair<List<Card>, Int> {
        val base = OLY + if (p["keyword"] != null) "search" else "series"
        val d = doc(base + q(p + mapOf("page" to page)), force)
        return oCards(d) to lastPage(d, base)
    }

    // latest chapters feeds: one card per series, opening that chapter
    suspend fun latest(force: Boolean = false): List<Card> = coroutineScope {
        val swat = async {
            val seen = HashSet<String>()
            json(mUrl("chapters/", mapOf("page_size" to 60, "order_by" to "-created_at")), force).getJSONArray("results").objs()
                .filter { it.optJSONObject("serie") != null && seen.add(it.getJSONObject("serie").get("id").toString()) }
                .map { mCard(it.getJSONObject("serie")).copy(badge = "${t("chShort")} ${chNum(it.opt("chapter"))}", open = Screen.MangaRead(it.get("id").toString())) }
        }
        val oly = async {
            runCatching { // Olympus down: just MangaSwat's. Its home page's updates: a series each, its newest free chapter first
                doc(OLY, force).select(".uta").mapNotNull { b ->
                    val slug = b.selectFirst(".imgu a[href]")?.attr("href")?.substringAfter("/series/", "")?.takeIf { it.isNotEmpty() && '/' !in it } ?: return@mapNotNull null
                    // a paid chapter has no link (a "buy" box instead): the first that has one
                    val n = b.select("li a[href^=${OLY}series/$slug/]").firstOrNull()?.attr("href")?.substringAfterLast('/') ?: return@mapNotNull null
                    oCard(slug, b.selectFirst(".info h3")?.text() ?: "", b.selectFirst(".imgu img")?.attr("src") ?: "", "")
                        .copy(badge = "${t("chShort")} ${chNum(n)}", open = Screen.MangaRead("o:$slug:$n"))
                }
            }.getOrDefault(emptyList())
        }
        merge(listOf(swat.await(), oly.await()))
    }
    // Olympus's list can't sort by views or by date: these are MangaSwat's
    suspend fun popular(force: Boolean = false) = list(mapOf("order_by" to "-views_count", "page_size" to 30), force).items
    suspend fun fresh(force: Boolean = false) = list(mapOf("order_by" to "-created_at", "page_size" to 30), force).items
    suspend fun hot(force: Boolean = false) = list(mapOf("is_hot" to true, "page_size" to 30), force).items

    // same series on both sites = a shared title, ignoring case and punctuation (Arabic-only titles never match)
    fun norm(s: String?) = (s ?: "").lowercase().replace(Regex("[^a-z0-9]+"), " ").trim()
    private fun keys(names: List<String>) = names.map(::norm).filter { it.isNotEmpty() }
    /** lists of cards, interleaved, each series once (by an earlier list first); seen carries over between pages of one browse */
    fun merge(lists: List<List<Card>?>, seen: MutableSet<String> = HashSet()): List<Card> {
        val kept = lists.map { l -> (l ?: emptyList()).filter { c -> val k = keys(listOf(c.title) + c.names); if (k.any { it in seen }) false else { seen += k; true } } }
        return (0 until (kept.maxOfOrNull { it.size } ?: 0)).flatMap { i -> kept.mapNotNull { it.getOrNull(i) } }
    }

    private fun series(j: JSONObject) = MSeries(j.get("id").toString(), j.str("title"), j.str("alternative"), j.str("story"), j.optJSONObject("type")?.str("name") ?: "",
        j.optJSONObject("status")?.opt("id")?.toString() ?: "", j.optJSONArray("genres")?.objs()?.map { it.str("name") } ?: emptyList(),
        j.optJSONObject("poster")?.str("medium") ?: "", j.optJSONObject("cover")?.str("medium")?.ifEmpty { null } ?: j.optJSONObject("poster")?.str("medium") ?: "",
        rating(j.optDouble("rating", 0.0)), j.optLong("views_count"))
    suspend fun seriesOf(id: String, force: Boolean = false) = series(json(mUrl("series/$id/"), force))
    // a series' page: its details, and its chapters (about 40 a page, ?page=N), every page. A paid chapter has no link: left out
    private suspend fun oSeries(slug: String, force: Boolean = false): MSeries = coroutineScope {
        val url = OLY + "series/" + slug
        val d = doc(url, force)
        val rest = (2..lastPage(d, url)).map { n -> async { runCatching { doc("$url?page=$n", force) }.getOrNull() } }.awaitAll()
        val chs = (listOf(d) + rest.filterNotNull()).flatMap { p -> p.select(".chapter-card a.chapter-link[href^=$url/]").map { it.attr("href").substringAfterLast('/') } }
            .distinct().map { Ch("o:$slug:$it", chNum(it)) }
        val info = { label: String -> d.select(".full-list-info").find { label in it.text() }?.select("a")?.text() ?: "" }
        val st = info("الحالة") // its words: مستمرة, مكتملة, متوقفة, متروك
        val title = d.selectFirst(".author-info-title h1, .author-info-title h6")?.text() ?: slug
        MSeries("o:$slug", title, "", d.selectFirst(".review-content")?.text() ?: "", O_TYPES[info("النوع")] ?: info("النوع"),
            when { "مستمر" in st -> "79"; "مكتمل" in st -> "80"; st.isNotEmpty() -> "81"; else -> "" }, d.select("a[href*=series?genre=]").map { it.text() }.distinct(),
            d.selectFirst(".whitebox img.shadow-sm")?.attr("src") ?: "", d.selectFirst(".whitebox img.shadow-sm")?.attr("src") ?: "", "", 0, listOf(title), chs)
    }

    // the API hands out at most 200 chapters a page, whatever page_size asks for: every page
    private suspend fun chapters(id: String, force: Boolean): List<Ch> = coroutineScope {
        fun at(page: Int) = async { json(mUrl("series/$id/chapters/", mapOf("page" to page, "page_size" to 200)), force) }
        val first = at(1).await()
        val rest = (2..((first.optInt("count") + 199) / 200)).map(::at).awaitAll()
        (listOf(first) + rest).flatMap { p -> p.getJSONArray("results").objs().map { Ch(it.get("id").toString(), chNum(it.opt("chapter"))) } }
    }
    // newest first, by number: the sites list chapters in upload order, so an extra added later (37.5, 0.5) sits out of place
    private fun byNum(chs: List<Ch>) = chs.sortedByDescending { it.n.toDoubleOrNull() ?: 0.0 }
    // one entry per chapter number (a site may list one twice: "FREE 1" and "1"); MangaSwat's copy first, the rest kept as alternatives
    private fun merged(s: MSeries, all: List<Ch>, ids: List<String>): MFull {
        val groups = byNum(all).groupBy { it.n } // stable: within a number, the order given (MangaSwat's, then Olympus's)
        return MFull(s, groups.values.map { it.first() }, ids, groups.filterValues { it.size > 1 })
    }

    // the other site's copy of a series, found by searching its title
    private suspend fun oTwin(s: MSeries, force: Boolean): MSeries? {
        val k = keys(listOf(s.title) + s.alt.split(Regex("[|,،]")))
        if (k.isEmpty()) return null
        val hit = runCatching { oList(mapOf("keyword" to s.title), 1).first }.getOrNull()?.find { c -> keys(c.names).any { it in k } } ?: return null
        return runCatching { oSeries(hit.path.substringAfterLast("/o:"), force) }.getOrNull()
    }
    // MangaSwat's search only finds its own title, which may be one of the other site's names: each Latin name in turn
    private suspend fun swatTwin(m: MSeries): String? {
        val k = keys(m.names)
        for (name in m.names.map { it.trim() }.filter { Regex("[a-z]", RegexOption.IGNORE_CASE).containsMatchIn(it) }.distinct().take(4)) {
            val hit = runCatching { list(mapOf("search" to name, "page_size" to 20)).items }.getOrNull()?.find { norm(it.title) in k }
            if (hit != null) return hit.path.substringAfterLast('/')
        }
        return null
    }
    /** a series as shown: MangaSwat's (plus its Olympus twin's extra chapters), or Olympus's alone */
    suspend fun full(id: String, force: Boolean = false): MFull {
        if (id.matches(Regex("t\\d+"))) { // a series saved under a removed source's id: found again by its title
            val title = listOf("manga" to id, "list" to "/manga/series/$id", "notify" to "/manga/series/$id", "autoDl" to "/manga/series/$id")
                .firstNotNullOfOrNull { (k, key) -> Store[k].optJSONObject(key)?.optString("title")?.takeIf { it.isNotEmpty() } }
                ?: com.medanime.app.Downloads.all().let { o -> o.keys().asSequence().mapNotNull { o.optJSONObject(it) }.find { it.optString("show") == "/manga/series/$id" }?.optString("title") }
                ?: throw java.io.IOException(t("unreachable"))
            val hit = browse(mapOf("search" to title), 1, HashSet(), force).items.firstOrNull() ?: throw java.io.IOException(t("unreachable"))
            return full(hit.path.substringAfterLast('/'), force)
        }
        if (id.startsWith("o:")) {
            val m = oSeries(id.drop(2), force)
            val f = swatTwin(m)?.let { runCatching { full(it, force) }.getOrNull() }
            return if (f != null) MFull(f.s, f.chs, f.ids + m.id, f.alts) else merged(m, m.chapters, listOf(m.id))
        }
        val (s, chs) = coroutineScope { val a = async { seriesOf(id, force) }; val b = async { chapters(id, force) }; a.await() to b.await() }
        val tw = oTwin(s, force) ?: return merged(s, chs, listOf(s.id))
        return merged(s, chs + tw.chapters, listOf(s.id, tw.id)) // Olympus fills the numbers MangaSwat lacks, and is an alternative for the rest
    }

    /** one chapter from either site */
    suspend fun chapter(cid: String): MChapter {
        if (cid.startsWith("o:")) { // its page lists the page images; prev / next come from the series' merged list (the reader's)
            val slug = cid.drop(2).substringBefore(':'); val n = cid.substringAfterLast(':')
            val d = doc(OLY + "series/$slug/$n")
            val imgs = d.select(".image_list img.manga-chapter-img").map { it.attr("src") }.filter { it.isNotEmpty() }.distinct() // each is there twice
            if (imgs.isEmpty()) throw Locked() // a paid chapter: its page comes without them
            return MChapter(cid, chNum(n), null, null, "o:$slug", d.selectFirst("a[href=${OLY}series/$slug]")?.text() ?: "", "", imgs)
        }
        val j = json(mUrl("chapters/$cid/"))
        val s = j.getJSONObject("serie")
        return MChapter(j.get("id").toString(), chNum(j.opt("chapter")), j.opt("previous_chapter_id")?.takeIf { it != JSONObject.NULL }?.toString(),
            j.opt("next_chapter_id")?.takeIf { it != JSONObject.NULL }?.toString(), s.get("id").toString(), s.str("title"), s.optJSONObject("poster")?.str("medium") ?: "",
            (j.optJSONArray("images")?.objs() ?: emptyList()).sortedBy { it.optInt("order") }.map { it.str("image") })
    }

    /** a chapter its site keeps back (sold, on Olympus): said plainly, not as a parse error */
    class Locked : java.io.IOException(t("mLocked"))

    // ---------- browse: a page of each site, merged; past the end of one site's pages, just the other's ----------
    // the filters in Olympus's terms; null when they can't apply: its list only filters by type, and can't sort (its genre
    // and status words differ too). A search is its search page, which takes nothing else
    private fun oQuery(p: Map<String, String>): Map<String, Any>? {
        if (p["genres"] != null || p["status"] != null || p["is_hot"] != null || !p["order_by"].isNullOrEmpty()) return null
        p["search"]?.let { return mapOf("keyword" to it) }
        val type = p["type"] ?: return emptyMap()
        val name = TYPES.find { it.first == type }?.third ?: return null
        return O_TYPES.entries.find { it.value == name }?.let { mapOf("type" to it.key) }
    }
    suspend fun browse(p: Map<String, String>, page: Int, seen: MutableSet<String>, force: Boolean = false): Listing = coroutineScope {
        val per = 30
        val oq = oQuery(p)
        val d = async { runCatching { list(p + mapOf("page" to page, "page_size" to per), force) }.getOrElse { if (page == 1 && oq == null) throw it else null } }
        val o = async { oq?.let { runCatching { oList(it, page, force) }.getOrNull() } }
        val a = d.await(); val b = o.await()
        if (a == null && b == null) throw java.io.IOException(t("unreachable"))
        Listing(merge(listOf(a?.items, b?.first), seen), maxOf(1, ((a?.count ?: 0) + per - 1) / per, b?.second ?: 0))
    }
}
