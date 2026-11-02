package com.medanime.app.ui

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.last
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import org.jsoup.Jsoup
import java.net.URLEncoder

/** the novels' sources besides novltime: plain pages. Their novels' ids carry a tag ("sea~<slug>"), novltime's none: what's saved of those stays valid */
internal abstract class NovelSite(val tag: String, val home: String) {
    abstract suspend fun page(p: Int, force: Boolean): Listing
    abstract suspend fun search(q: String): List<Card>
    /** whole: every chapter (the title page); the reader only needs what's cheap */
    abstract fun full(slug: String, force: Boolean, whole: Boolean): Flow<NovelFull>
    abstract suspend fun chapter(slug: String, ch: String): NovelChapter
    open suspend fun find(slug: String, n: String) = full(slug, false, true).last().chs.find { it.n == n }

    protected fun id(slug: String) = "$tag~$slug"
    protected fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    protected fun card(slug: String, title: String, poster: String, desc: String = "", rating: String = "") =
        "/novel/${id(slug)}".let { Card(it, "novel", title, poster, rating, "", "", null, it, names = listOf(title), desc = desc) }
    protected fun info(slug: String, title: String, alt: String, story: String, genres: List<String>, done: Boolean, poster: String, count: Int, cover: String = poster, locked: Int = 0) =
        NovelInfo(id(slug), title, alt, story, "", genres, done, poster, 0, 0, count, cover, locked)
    protected fun chapterOf(slug: String, chId: String, ch: String, n: String, title: String, paras: List<String>, prev: String?, next: String?): NovelChapter {
        val text = paras.map { it.trim() }.filter { it.isNotEmpty() }
        if (text.isEmpty()) throw java.io.IOException(t("nvNoText"))
        return NovelChapter(id(slug), chId, ch, n, title, text, text.sumOf { it.split(' ').size }, prev, next)
    }
    protected suspend fun text(url: String, force: Boolean = false, every: Long = 600_000L) = Pages.load(url, force, every = every)
    protected suspend fun doc(url: String, force: Boolean = false, every: Long = 600_000L) = Jsoup.parse(text(url, force, every), url)
}

internal object NovelSites {
    val all = listOf(Sea, Kol, Sun)
    /** the site and slug in a tagged id; null: one of novltime's */
    fun of(id: String) = id.substringBefore('~', "").let { tag -> all.find { it.tag == tag }?.let { it to id.substringAfter('~') } }

    /** a Next.js page's data, as its own scripts hand it over: one string in pieces */
    fun flight(html: String) = Regex("""self\.__next_f\.push\(\[1,("[^"\\]*+(?:\\.[^"\\]*+)*+")\]\)""").findAll(html).joinToString("") { JSONArray("[${it.groupValues[1]}]").getString(0) }
    /** the JSON value after a key in it */
    fun after(f: String, key: String) = f.indexOf("\"$key\":").takeIf { it >= 0 }?.let { JSONTokener(f.substring(it + key.length + 3)).nextValue() }
}

// seanovel: its catalogue and search run on /api/, which its robots.txt asks to be left alone: only its pages here, one per novel
internal object Sea : NovelSite("sea", "https://seanovel.org") {
    private const val PER_PAGE = 24
    private val gate = Semaphore(6) // a page of cards is a request per novel: not all at once
    private suspend fun slugs() = Regex("/novels/([^/<]+)</loc>").findAll(text("$home/sitemap-novels.xml", every = Pages.DAY)).map { it.groupValues[1] }.toList()
    private suspend fun cards(slugs: List<String>) = coroutineScope {
        slugs.map { s -> async { gate.withPermit {
            try { doc("$home/novels/$s", every = Pages.DAY).let { d -> card(s, d.selectFirst("h1.novel-title")?.text().orEmpty(), "$home/api/novel/$s/cover?type=webp", d.selectFirst(".novel-description-para")?.text().orEmpty()) } }
            catch (e: CancellationException) { throw e } catch (_: Exception) { null }
        } } }.awaitAll().filterNotNull().filter { it.title.isNotEmpty() }
    }
    override suspend fun page(p: Int, force: Boolean): Listing {
        val all = slugs().chunked(PER_PAGE)
        return Listing(all.getOrNull(p - 1)?.let { cards(it) }.orEmpty(), all.size)
    }
    // its titles are only on the novels' own pages: read once for the first search, then from the saved copies. English goes by the address
    override suspend fun search(q: String): List<Card> {
        val k = Novels.titleKey(q)
        return cards(slugs()).filter { Novels.titleKey(it.title).contains(k) || Novels.titleKey(it.path).contains(k) }
    }
    override fun full(slug: String, force: Boolean, whole: Boolean): Flow<NovelFull> = flow {
        val html = text("$home/novels/$slug", force)
        val d = Jsoup.parse(html); val f = NovelSites.flight(html)
        // only the first few are in the page: the rest by number (the site's ids run from 1), named when opened
        val names = Regex("""\{"id":(\d+),"title":"([^"]*)","volume"""").findAll(f).associate { it.groupValues[1] to it.groupValues[2] }
        val total = Regex("\"totalChapters\":(\\d+)").find(f)?.groupValues?.get(1)?.toInt() ?: 0
        val chs = (total downTo 1).map { NovelCh("sea~$slug~$it", "$it", "$it", names["$it"].orEmpty(), 0) }
        val poster = "$home/api/novel/$slug/cover?type=webp"
        emit(NovelFull(info(slug, d.selectFirst("h1.novel-title")?.text().orEmpty(), d.selectFirst(".novel-original-title")?.text().orEmpty(), d.select(".novel-description-para").joinToString("\n") { it.text() },
            d.select(".novel-tags-section-ios a[href^=/search?genre=]").map { it.text() }, false, poster, total), chs, chs.lastOrNull(), emptyList()))
    }
    override suspend fun chapter(slug: String, ch: String): NovelChapter {
        val f = NovelSites.flight(text("$home/novels/$slug/chapters/$ch", every = Pages.DAY))
        val paras = NovelSites.after(f, "initialParagraphs") as? JSONArray ?: throw java.io.IOException(t("nvNoText")) // past the end the page is still a 200
        fun near(k: String) = (NovelSites.after(f, k) as? String)?.substringAfterLast('/')
        return chapterOf(slug, "sea~$slug~$ch", ch, ch, (NovelSites.after(f, "chapterTitle") as? String).orEmpty(), (0 until paras.length()).map { paras.getString(it) }, near("prevChapterUrl"), near("nextChapterUrl"))
    }
}

// sunovels: its list marks most of a novel's chapters as locked, readable only in its own app. Those are left out, here and in the reader
internal object Sun : NovelSite("sun", "https://sunovels.com") {
    private val row = Regex(""""href":"/novel/([^"/?]+)","children":\[\["\$","\${'$'}L[0-9a-z]+",null,\{"src":"([^"]+)"[^}]*\}\],\["\$","h4",null,\{"dir":"rtl","children":"([^"]+)"""")
    private fun cards(html: String) = row.findAll(NovelSites.flight(html)).map { m -> card(m.groupValues[1], m.groupValues[3], home + m.groupValues[2]) }.toList()
    override suspend fun page(p: Int, force: Boolean): Listing {
        val html = text("$home/library?page=$p", force)
        return Listing(cards(html), Regex(">(\\d+)</(?:a|button|li)>").findAll(html).maxOfOrNull { it.groupValues[1].toInt() } ?: 1)
    }
    override suspend fun search(q: String) = cards(text("$home/search/?title=${enc(q)}"))
    // the open chapters, oldest first, page after page of 50 until a locked one's reached (.fa-lock; an open one's icon is fa-lock-open)
    private fun rows(slug: String, force: Boolean) = flow {
        val out = ArrayList<NovelCh>()
        var p = 0 // its pages count from 0
        while (true) {
            val d = doc("$home/novel/$slug?activeTab=chapters&page=$p", force)
            val l = d.select("ul.chaptersList a[href^=/novel/$slug/]")
            val open = l.takeWhile { it.selectFirst(".fa-lock") == null }.map { it.attr("href").substringAfterLast('/') }
            out += open.map { NovelCh("sun~$slug~$it", it, it, "", 0) }
            emit(d to out.toList())
            if (open.size < l.size || l.size < 50) break
            p++
        }
    }
    override fun full(slug: String, force: Boolean, whole: Boolean): Flow<NovelFull> = flow {
        var base: NovelInfo? = null
        rows(slug, force).collect { (d, open) ->
            val b = base ?: run {
                val f = NovelSites.flight(d.outerHtml())
                val at = Regex("\"url\":\"${Regex.escape(slug)}\",\"status\"").find(f)?.range?.first ?: throw java.io.IOException(t("unreachable"))
                val o = JSONTokener(f.substring(f.lastIndexOf("{\"id\":", at))).nextValue() as JSONObject
                val total = Regex("\"chaptersCount\":(\\d+)").find(f)?.groupValues?.get(1)?.toInt() ?: 0
                val cover = d.select("img[src^=/uploads/]").firstOrNull()?.attr("src")?.let { home + it }.orEmpty()
                info(slug, o.optString("arabicTitle").ifEmpty { o.optString("title") }, o.optString("title"), o.optString("about").takeIf { it != "null" }.orEmpty(),
                    d.select("a[href^=/library?category=]").map { it.text() }.distinct(), o.optString("status") == "Completed", cover, total).also { base = it }
            }
            emit(NovelFull(b.copy(count = open.size, locked = (b.count - open.size).coerceAtLeast(0)), open.reversed(), open.firstOrNull(), emptyList()))
        }
    }
    override suspend fun chapter(slug: String, ch: String): NovelChapter {
        var open = emptyList<NovelCh>()
        rows(slug, false).collect { open = it.second }
        val i = open.indexOfFirst { it.slug == ch }
        if (i < 0) throw java.io.IOException(t("nvLockedCh"))
        // class d-none: its marks, hidden on its own page too
        val paras = doc("$home/novel/$slug/$ch", every = Pages.DAY).select(".chapter-content p:not(.d-none)").map { it.text() }
        if (paras.any { it.contains("الفصل المطلوب مقفل") }) throw java.io.IOException(t("nvLockedCh"))
        return chapterOf(slug, open[i].id, ch, ch, "", paras, open.getOrNull(i - 1)?.slug, open.getOrNull(i + 1)?.slug)
    }
}

// kolnovel: its listings and chapters come quickly, but a novel's own page is built anew each time and takes 30-60s (at times a 504)
// and holds 24 chapters: so what's known of it shows at once, and its other pages follow one at a time, each saved
internal object Kol : NovelSite("kol", "https://kolnovel.com") {
    private val known = java.util.concurrent.ConcurrentHashMap<String, Card>()
    private fun slugOf(u: String) = u.trimEnd('/').substringAfterLast('/')
    private fun cards(d: org.jsoup.nodes.Document) = d.select("article.kol-series-archive__item").mapNotNull { a ->
        val link = a.selectFirst("h3 a") ?: return@mapNotNull null
        val s = slugOf(link.attr("href"))
        card(s, link.text(), a.selectFirst("img")?.attr("src").orEmpty(), a.selectFirst(".kol-series-archive__excerpt")?.text().orEmpty(), a.selectFirst(".kol-series-archive__cover-badges b")?.text().orEmpty()).also { known[s] = it }
    }
    override suspend fun page(p: Int, force: Boolean) = doc("$home/series/?paged=$p", force).let { d -> Listing(cards(d), d.select(".kol-series-archive__pagination strong").lastOrNull()?.text()?.toIntOrNull() ?: 1) }
    override suspend fun search(q: String) = cards(doc("$home/series/?s=${enc(q)}"))

    private fun listUrl(slug: String, order: String, p: Int) = "$home/series/$slug/?chapter_volume=__kol_all__&chapter_search&chapter_order=$order&chapter_page=$p"
    private fun rows(d: org.jsoup.nodes.Document) = d.select("li.kol-series-chapter").mapNotNull { r ->
        val a = r.selectFirst("a.kol-series-chapter__link") ?: return@mapNotNull null
        NovelCh("kol~${r.attr("data-chapter-id")}", slugOf(a.attr("href")), Manga.chNum(r.selectFirst("[data-kol-chapter-number]")?.attr("data-kol-chapter-number")), r.selectFirst("[data-kol-chapter-title]")?.text().orEmpty(), 0)
    }
    // one more try: its 504s pass. Asked again at most hourly, a pull too: each costs it a minute's work
    private suspend fun sheet(url: String, force: Boolean, every: Long): org.jsoup.nodes.Document {
        val f = force && Pages.due(url, every)
        return try { doc(url, f, every) } catch (e: CancellationException) { throw e } catch (_: Exception) { doc(url, f, every) }
    }
    override fun full(slug: String, force: Boolean, whole: Boolean): Flow<NovelFull> = flow {
        known[slug]?.let { c -> emit(NovelFull(info(slug, c.title, "", c.desc, emptyList(), false, c.poster, 0), emptyList(), null, emptyList())) }
        coroutineScope {
            val oldest = async { try { rows(sheet(listUrl(slug, "oldest", 1), false, Pages.DAY)).firstOrNull() } catch (e: CancellationException) { throw e } catch (_: Exception) { null } }
            val html = sheet(listUrl(slug, "newest", 1), force, 3600_000L)
            val pages = Regex("chapter_page=(\\d+)").findAll(html.outerHtml()).maxOfOrNull { it.groupValues[1].toInt() } ?: 1
            val cover = html.selectFirst("meta[property=og:image]")?.attr("content").orEmpty()
            val n = info(slug, html.selectFirst("h1")?.text().orEmpty(), html.selectFirst(".kol-series-editorial__alt-title")?.text().orEmpty(),
                html.selectFirst("[itemprop=description]")?.text().orEmpty().ifEmpty { html.selectFirst(".kol-series-editorial__synopsis-preview")?.text().orEmpty() },
                html.select("a[href*=/genre]").map { it.text() }.distinct(), html.select("[class*=status]").text().contains("مكتملة"), known[slug]?.poster.orEmpty().ifEmpty { cover }, 0, cover)
            val chs = ArrayList(rows(html))
            emit(NovelFull(n, chs.toList(), if (pages == 1) chs.lastOrNull() else null, emptyList()))
            val first = if (pages == 1) chs.lastOrNull() else oldest.await()
            if (pages > 1) emit(NovelFull(n, chs.toList(), first, emptyList()))
            if (whole) for (p in 2..pages) {
                chs += try { rows(sheet(listUrl(slug, "newest", p), false, Pages.DAY)) } catch (e: CancellationException) { throw e } catch (_: Exception) { break } // the rest next time
                emit(NovelFull(n, chs.toList(), first, emptyList()))
            }
        }
    }
    // its whole list would take many minutes: only the one sheet this number should be on (24 a sheet)
    // ponytail: numbers that don't run evenly (a chapter 0, half chapters) can land a sheet off and read as missing; look at the neighbours if that shows up
    override suspend fun find(slug: String, n: String): NovelCh? {
        val sheet = ((n.toDoubleOrNull()?.toInt() ?: 1) - 1).coerceAtLeast(0) / 24 + 1
        return rows(sheet(listUrl(slug, "oldest", sheet), false, Pages.DAY)).find { it.n == n }
    }
    override suspend fun chapter(slug: String, ch: String): NovelChapter {
        val d = doc("$home/$ch/", every = Pages.DAY)
        fun near(rel: String) = d.selectFirst("a[rel=$rel]")?.attr("href")?.let(::slugOf)
        return chapterOf(slug, "kol~${ch.substringAfterLast('-')}", ch, Manga.chNum(d.selectFirst("[data-chapter-number]")?.attr("data-chapter-number")), d.selectFirst("h1")?.text().orEmpty(),
            d.select(".epcontent p").map { it.text() }, near("prev"), near("next"))
    }
}
