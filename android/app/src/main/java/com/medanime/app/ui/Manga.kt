package com.medanime.app.ui

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import java.net.URLEncoder

// manga.js in Kotlin: MeshManga's catalogue (the JSON API its site runs on, appswat.com) merged with MangaTek's
data class MSeries(val id: String, val title: String, val alt: String, val story: String, val type: String, val status: String,
                   val genres: List<String>, val poster: String, val cover: String, val rating: String, val views: Long,
                   val names: List<String> = emptyList(), val chapters: List<Ch> = emptyList())
data class Ch(val id: String, val n: String)
data class MChapter(val id: String, val n: String, val prev: String?, val next: String?, val serieId: String, val serieTitle: String, val seriePoster: String, val images: List<String>)
// chapters newest first, one per number; ids: the series' ids on both sites; alts: a number's copies when there are several (the reader's source picker)
class MFull(val s: MSeries, val chs: List<Ch>, val ids: List<String>, val alts: Map<String, List<Ch>> = emptyMap())

object Manga {
    private const val API = "https://appswat.com/v2/api/v2/"
    private const val TEK = "https://api.mangatek.com/"
    private fun q(params: Map<String, Any>) = if (params.isEmpty()) "" else "?" + params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value.toString(), "UTF-8")}" }
    fun mUrl(path: String, params: Map<String, Any> = emptyMap()) = API + path + q(params)
    private fun tUrl(path: String, params: Map<String, Any> = emptyMap()) = TEK + "api/" + path + q(params)
    private suspend fun json(url: String, force: Boolean = false) = JSONObject(Pages.load(url, force))

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
    private fun tImg(p: String) = if (p.isEmpty() || p.startsWith("http")) p else TEK + p // detail pages give covers relative
    private fun tNames(m: JSONObject) = listOf(m.str("title"), m.str("title_ar")) + m.str("alternative_titles").split('|')
    private fun tCard(m: JSONObject) = Card("/manga/series/t${m.get("id")}", "manga", m.str("title"), tImg(m.str("cover_image")),
        rating(m.optDouble("rating_blended", 0.0)), "", m.str("type").let { if (it.isEmpty()) "" else typeName(it) }, null, "/manga/series/t${m.get("id")}", names = tNames(m))

    class Page(val items: List<Card>, val count: Int)
    suspend fun list(params: Map<String, Any>, force: Boolean = false) = json(mUrl("series/", params), force).let { j -> Page(j.getJSONArray("results").objs().map(::mCard), j.optInt("count")) }
    private suspend fun tekList(params: Map<String, Any>, force: Boolean = false) = json(tUrl("manga", params), force).getJSONObject("data").let { d ->
        Page(d.getJSONArray("mangas").objs().map(::tCard), d.optJSONObject("pagination")?.optInt("total") ?: 0)
    }

    // latest chapters feeds: one card per series, opening that chapter
    suspend fun latest(force: Boolean = false): List<Card> = coroutineScope {
        val swat = async {
            val seen = HashSet<String>()
            json(mUrl("chapters/", mapOf("page_size" to 60, "order_by" to "-created_at")), force).getJSONArray("results").objs()
                .filter { it.optJSONObject("serie") != null && seen.add(it.getJSONObject("serie").get("id").toString()) }
                .map { mCard(it.getJSONObject("serie")).copy(badge = "${t("chShort")} ${chNum(it.opt("chapter"))}", open = Screen.MangaRead(it.get("id").toString())) }
        }
        val tek = async {
            runCatching { // MangaTek down: just MangaSwat's
                json(tUrl("manga", mapOf("limit" to 40)), force).getJSONObject("data").getJSONArray("mangas").objs().filter { (it.optJSONArray("MangaChapters")?.length() ?: 0) > 0 }.map {
                    val c = it.getJSONArray("MangaChapters").getJSONObject(0)
                    tCard(it).copy(badge = "${t("chShort")} ${chNum(c.opt("chapter_number"))}", open = Screen.MangaRead("t" + c.get("id")))
                }
            }.getOrDefault(emptyList())
        }
        merge(listOf(swat.await(), tek.await()))
    }
    suspend fun popular(force: Boolean = false) = coroutineScope {
        val a = async { list(mapOf("order_by" to "-views_count", "page_size" to 30), force).items }
        val b = async { runCatching { tekList(mapOf("sort" to "views", "limit" to 30), force).items }.getOrDefault(emptyList()) }
        merge(listOf(a.await(), b.await()))
    }
    suspend fun fresh(force: Boolean = false) = coroutineScope {
        val a = async { list(mapOf("order_by" to "-created_at", "page_size" to 30), force).items }
        val b = async { runCatching { tekList(mapOf("sort" to "created_at", "limit" to 30), force).items }.getOrDefault(emptyList()) }
        merge(listOf(a.await(), b.await()))
    }
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
    private suspend fun tekSeries(id: String, force: Boolean = false): MSeries {
        val m = json(tUrl("manga/$id"), force).getJSONObject("data")
        return MSeries("t" + m.get("id"), m.str("title"), m.str("alternative_titles").ifEmpty { m.str("title_ar") }, m.str("description").ifEmpty { m.str("description_sid") },
            m.str("type"), STATUS.find { it.third.equals(m.str("status"), true) }?.first ?: "", m.optJSONArray("Tags")?.objs()?.map { it.str("name") } ?: emptyList(),
            tImg(m.str("cover_image")), tImg(m.str("cover_image")), rating(m.optDouble("rating_blended", 0.0)), m.optLong("views"), tNames(m),
            m.optJSONArray("MangaChapters")?.objs()?.filter { it.optInt("visible", 1) != 0 && (if (it.has("access") && !it.isNull("access")) it.optBoolean("access") else it.optDouble("price", 0.0) == 0.0) }
                ?.map { Ch("t" + it.get("id"), chNum(it.opt("chapter_number"))) }?.reversed() ?: emptyList())
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
        val groups = byNum(all).groupBy { it.n } // stable: within a number, the order given (MangaSwat's, then MangaTek's)
        return MFull(s, groups.values.map { it.first() }, ids, groups.filterValues { it.size > 1 })
    }

    // the other site's copy of a series, found by searching its title
    private suspend fun tekTwin(s: MSeries, force: Boolean): MSeries? {
        val k = keys(listOf(s.title) + s.alt.split(Regex("[|,،]")))
        if (k.isEmpty()) return null
        val hit = runCatching { tekList(mapOf("search" to s.title, "limit" to 20)).items }.getOrNull()?.find { c -> keys(c.names).any { it in k } } ?: return null
        return runCatching { tekSeries(hit.path.substringAfterLast("/t"), force) }.getOrNull()
    }
    // MangaSwat's search only finds its own title, which may be one of MangaTek's alternatives: each Latin name in turn
    private suspend fun swatTwin(m: MSeries): String? {
        val k = keys(m.names)
        for (name in m.names.map { it.trim() }.filter { Regex("[a-z]", RegexOption.IGNORE_CASE).containsMatchIn(it) }.distinct().take(4)) {
            val hit = runCatching { list(mapOf("search" to name, "page_size" to 20)).items }.getOrNull()?.find { norm(it.title) in k }
            if (hit != null) return hit.path.substringAfterLast('/')
        }
        return null
    }
    /** a series as shown: MangaSwat's (plus its MangaTek twin's extra chapters), or MangaTek's alone */
    suspend fun full(id: String, force: Boolean = false): MFull {
        if (id.startsWith("t")) {
            val m = tekSeries(id.drop(1), force)
            val f = swatTwin(m)?.let { runCatching { full(it, force) }.getOrNull() }
            return if (f != null) MFull(f.s, f.chs, f.ids + m.id, f.alts) else merged(m, m.chapters, listOf(m.id))
        }
        val (s, chs) = coroutineScope { val a = async { seriesOf(id, force) }; val b = async { chapters(id, force) }; a.await() to b.await() }
        val tk = tekTwin(s, force) ?: return merged(s, chs, listOf(s.id))
        return merged(s, chs + tk.chapters, listOf(s.id, tk.id)) // MangaTek fills the numbers MangaSwat lacks, and is an alternative for the rest
    }

    /** one chapter from either site */
    suspend fun chapter(cid: String): MChapter {
        if (!cid.startsWith("t")) {
            val j = json(mUrl("chapters/$cid/"))
            val s = j.getJSONObject("serie")
            return MChapter(j.get("id").toString(), chNum(j.opt("chapter")), j.opt("previous_chapter_id")?.takeIf { it != JSONObject.NULL }?.toString(),
                j.opt("next_chapter_id")?.takeIf { it != JSONObject.NULL }?.toString(), s.get("id").toString(), s.str("title"), s.optJSONObject("poster")?.str("medium") ?: "",
                (j.optJSONArray("images")?.objs() ?: emptyList()).sortedBy { it.optInt("order") }.map { it.str("image") })
        }
        val c = json(tUrl("chapters/" + cid.drop(1))).getJSONObject("data")
        val sery = c.getJSONObject("MangaSery")
        // the page list is only in the reader page, as the props of its image viewer island
        val html = Pages.load("https://mangatek.com/reader/${URLEncoder.encode(sery.str("slug"), "UTF-8")}/${URLEncoder.encode(c.opt("chapter_number").toString(), "UTF-8")}")
        val props = Jsoup.parse(html).selectFirst("astro-island[component-url*=ChapterImageViewer]")?.attr("props") ?: "{}"
        val urls = JSONObject(props).optJSONArray("imageUrls")?.optJSONArray(1)
        return MChapter("t" + c.get("id"), chNum(c.opt("chapter_number")), null, null, "t" + c.get("manga_id"), sery.str("title"), "",
            (0 until (urls?.length() ?: 0)).map { urls!!.getJSONArray(it).getString(1) })
    }

    // ---------- browse: a page of each site, merged; past the end of one site's pages, just the other's ----------
    // the filters in MangaTek's terms; null when they can't apply (the two sites' genre lists differ)
    private fun tekQuery(p: Map<String, String>): Map<String, Any>? {
        if (p["genres"] != null) return null
        val q = mutableMapOf<String, Any>("sort" to (mapOf("-views_count" to "views", "-rating" to "rating", "title" to "title")[p["order_by"]] ?: if (p["is_hot"] != null) "views" else "created_at"))
        p["type"]?.let { v -> TYPES.find { it.first == v }?.let { q["type"] = it.third.lowercase() } }
        p["status"]?.let { v -> STATUS.find { it.first == v }?.let { q["status"] = it.third.lowercase() } }
        p["search"]?.let { q["search"] = it }
        return q
    }
    suspend fun browse(p: Map<String, String>, page: Int, seen: MutableSet<String>, force: Boolean = false): Listing = coroutineScope {
        val per = 30
        val tq = tekQuery(p)
        val d = async { runCatching { list(p + mapOf("page" to page, "page_size" to per), force) }.getOrElse { if (page == 1 && tq == null) throw it else null } }
        val tk = async { tq?.let { runCatching { tekList(it + mapOf("page" to page, "limit" to per), force) }.getOrNull() } }
        val a = d.await(); val b = tk.await()
        if (a == null && b == null) throw java.io.IOException(t("unreachable"))
        Listing(merge(listOf(a?.items, b?.items), seen), maxOf(1, ((a?.count ?: 0) + per - 1) / per, ((b?.count ?: 0) + per - 1) / per))
    }
}
