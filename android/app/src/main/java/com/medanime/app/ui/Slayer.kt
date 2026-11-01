package com.medanime.app.ui

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.net.URI
import java.net.URLEncoder
import okio.ByteString.Companion.encodeUtf8
import okio.ByteString.Companion.decodeBase64

// Recovered from Manga Slayer v41's app_config.gz and its public main_source_config.
// Spark is the current main source; Starz is the bundled previous domain. Dilar's dispatcher was stripped.
object Slayer {
    val sources = linkedMapOf("spark" to "https://sparkmanga.net", "starz" to "https://manga-starz.net")
    data class Ref(val key: String, val origin: String, val path: String)
    fun id(key: String, path: String): String = "s:$key:" + URI(URI(sources.getValue(key)).resolve(path).toASCIIString()).rawPath.encodeUtf8().base64Url().trimEnd('=')
    fun ref(id: String): Ref {
        val parts = id.split(':', limit = 3)
        val origin = sources.getValue(parts[1])
        return Ref(parts[1], origin, requireNotNull(parts[2].decodeBase64()).utf8())
    }
    fun url(id: String) = ref(id).let { it.origin + it.path }
    fun blockedTitle(s: String) = Regex("^(access denied|just a moment|attention required|403 forbidden)\\b", RegexOption.IGNORE_CASE).containsMatchIn(s.trim())
    private fun image(e: org.jsoup.nodes.Element?, base: String = ""): String {
        if (e == null) return ""
        val candidates = listOf("data-src", "data-lazy-src", "src").map { e.attr(it) } +
            listOf("data-srcset", "srcset").flatMap { e.attr(it).split(',').map { v -> v.trim().substringBefore(' ') } }
        return candidates.firstNotNullOfOrNull { value ->
            val v = value.trim()
            if (v.isEmpty() || Regex("^(data|javascript|about):", RegexOption.IGNORE_CASE).containsMatchIn(v)) null else
                runCatching { URI(base).resolve(v).takeIf { it.scheme == "https" || it.scheme == "http" }?.toASCIIString() }.getOrNull()
        } ?: ""
    }
    fun number(s: String) = Manga.chNum(s.map { if (it in '٠'..'٩') '0' + (it - '٠') else it }.joinToString(""))
    fun parseList(d: Document, key: String): Listing {
        val cards = d.select(".page-item-detail, .c-tabs-item__content").mapNotNull { b ->
            val a = b.selectFirst(".post-title a, .tab-summary h3 a") ?: return@mapNotNull null
            if (a.text().isBlank() || blockedTitle(a.text())) return@mapNotNull null
            val path = "/manga/series/" + id(key, a.attr("href"))
            Card(path, "manga", a.text(), image(b.selectFirst("img"), sources.getValue(key)), "", "", "", null, path, names = listOf(a.text()))
        }.distinctBy { it.path }
        val pages = maxOf(1, d.select("a[href]").maxOfOrNull { Regex("/page/(\\d+)").find(it.attr("href"))?.groupValues?.get(1)?.toIntOrNull() ?: 1 } ?: 1)
        return Listing(cards, pages)
    }
    fun parseChapters(d: Document, key: String) = d.select("li.wp-manga-chapter a[href]").map { Ch(id(key, it.attr("href")), number(it.text())) }.distinctBy { it.id }
    data class Details(val s: MSeries, val postId: String)
    fun parseSeries(d: Document, sid: String): Details {
        val r = ref(sid)
        fun info(label: String) = d.select(".post-content_item").find { it.select(".summary-heading").text().contains(label) }?.select(".summary-content")?.text() ?: ""
        // A blocked embed may add its own h1 before the real series heading.
        val title = d.select(".post-title h1, h1.post-title").firstOrNull { it.text().isNotBlank() && !blockedTitle(it.text()) }?.text().orEmpty()
        val post = d.selectFirst("[data-manga]")?.attr("data-manga")?.takeIf { it.isNotEmpty() }
            ?: d.selectFirst("#manga-chapters-holder")?.attr("data-id")?.takeIf { it.isNotEmpty() }
            ?: Regex("postid-(\\d+)").find(d.body().className())?.groupValues?.get(1)
            ?: throw java.io.IOException("Manga details unavailable")
        require(title.isNotBlank()) { "Manga details unavailable" }
        val alt = info("Alternative").ifEmpty { info("أسماء") }
        val status = info("Status").ifEmpty { info("الحالة") }
        val base = url(sid)
        val poster = image(d.selectFirst(".summary_image img, .summary-image img"), base).ifEmpty {
            d.selectFirst("meta[property=og:image]")?.attr("content")?.let { value ->
                image(org.jsoup.nodes.Element("img").attr("src", value), base)
            }.orEmpty()
        }
        return Details(MSeries(sid, title, alt, d.select(".summary__content, .description-summary .summary-content").text(), info("Type"),
            when { Regex("مستمر|ongoing", RegexOption.IGNORE_CASE).containsMatchIn(status) -> "79"; Regex("مكتمل|completed", RegexOption.IGNORE_CASE).containsMatchIn(status) -> "80"; else -> "" },
            d.select(".genres-content a").map { it.text() }, poster, poster, "", 0, listOf(title) + alt.split(Regex("[,;|،]")), parseChapters(d, r.key)), post)
    }
    fun parseImages(d: Document) = d.select("img.wp-manga-chapter-img").map { image(it) }.filter { it.startsWith("https://") || it.startsWith("http://") }.distinct()
    fun transformImage(url: String, key: String) = url.replace(Regex("^(https?://)(s\\d+|lek|temp|s)\\.")) { it.groupValues[1] + it.groupValues[2] + if (key == "spark") "darko." else "likey." }
        .replace("lekmanga.site", if (key == "spark") "link-manga.net" else "like-manga.net")
    fun parsePageResponse(text: String) = parseImages(Jsoup.parse(JSONObject(text).getJSONObject("data").getJSONObject("data").getString("content")))
    fun supports(p: Map<String, String>) = listOf("type", "status", "genres", "is_hot", "order_by").none { !p[it].isNullOrEmpty() }
    suspend fun list(key: String, p: Map<String, String>, page: Int, force: Boolean): Listing {
        val origin = sources.getValue(key)
        val search = p["search"]?.takeIf { it.isNotEmpty() }
        val path = if (page > 1) (if (search != null) "/page/$page/" else "/manga/page/$page/") else "/"
        val query = if (search != null) "?s=${URLEncoder.encode(search, "UTF-8")}&post_type=wp-manga" else ""
        return parseList(Jsoup.parse(Pages.load(origin + path + query, force, interactive = false)), key)
    }
    suspend fun lists(p: Map<String, String>, page: Int, force: Boolean): List<Listing> = coroutineScope {
        if (!supports(p)) return@coroutineScope emptyList()
        sources.keys.map { key -> async {
            try { list(key, p, page, force) }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { null }
        } }.awaitAll().filterNotNull()
    }
    suspend fun twins(s: MSeries, force: Boolean): List<MSeries> = coroutineScope {
        val keys = (listOf(s.title) + s.alt.split(Regex("[,;|،]"))).map(Manga::norm).filter { it.isNotEmpty() }
        if (keys.isEmpty()) return@coroutineScope emptyList()
        lists(mapOf("search" to s.title), 1, force).flatMap { it.items }.filter { Manga.norm(it.title) in keys }.map { c ->
            async { runCatching { series(c.path.substringAfterLast('/'), force, interactive = false) }.getOrNull() }
        }.awaitAll().filterNotNull()
    }
    private suspend fun details(sid: String, force: Boolean = false, interactive: Boolean = true): Details {
        val address = url(sid)
        val page = Pages.load(address, force, interactive = interactive)
        try { return parseSeries(Jsoup.parse(page), sid) }
        catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) {
            Pages.forget(address)
            if (force) throw e
            try { return parseSeries(Jsoup.parse(Pages.load(address, true, interactive = interactive)), sid) }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { Pages.forget(address); throw e }
        }
    }
    suspend fun series(sid: String, force: Boolean, interactive: Boolean = true): MSeries {
        val r = ref(sid)
        val detail = details(sid, force, interactive)
        val chapters = detail.s.chapters.ifEmpty {
            parseChapters(Jsoup.parse(Pages.load("${r.origin}/wp-admin/admin-ajax.php?action=manga_get_chapters&manga=${detail.postId}", force, form = mapOf("action" to "manga_get_chapters", "manga" to detail.postId), interactive = interactive)), r.key)
        }
        return detail.s.copy(chapters = chapters)
    }
    suspend fun chapter(cid: String): MChapter {
        val r = ref(cid)
        val parts = r.path.trim('/').split('/'); val chapter = parts.last()
        val sid = id(r.key, "/" + parts.dropLast(1).joinToString("/") + "/")
        val detail = details(sid)
        val s = detail.s
        val ajax = "${r.origin}/wp-admin/admin-ajax.php?action=chapter_navigate_page&postID=${detail.postId}&manga-paged=1&chapter=${URLEncoder.encode(chapter, "UTF-8")}&style=list"
        var images = try {
            parsePageResponse(Pages.load(ajax, form = mapOf("action" to "chapter_navigate_page"))).map { transformImage(it, r.key) }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { emptyList() }
        if (images.isEmpty()) images = parseImages(Jsoup.parse(Pages.load(url(cid))))
        if (images.isEmpty()) throw java.io.IOException(t("unreachable"))
        return MChapter(cid, number(chapter), null, null, sid, s.title, s.poster, images)
    }
}
