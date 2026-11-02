package com.medanime.app.ui

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.last
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

// the novels section: novltime's open JSON API, the one its own site runs on (language=ar: its Arabic catalogue)
data class NovelCh(val id: String, val slug: String, val n: String, val title: String, val words: Int)
data class NovelChapter(val novel: String, val id: String, val slug: String, val n: String, val title: String, val paras: List<String>, val words: Int, val prev: String?, val next: String?)
data class NovelInfo(val id: String, val title: String, val alt: String, val story: String, val author: String, val genres: List<String>, val done: Boolean,
                     val poster: String, val views: Long, val followers: Int, val count: Int, val cover: String, val locked: Int = 0) // poster: small, the one the cards already saved; cover: full size; locked: chapters its source doesn't open here
data class NovelFull(val n: NovelInfo, val chs: List<NovelCh>, val first: NovelCh?, val similar: List<Card>) // chs: newest first, maybe still coming in; first: its first chapter
data class NovelList(val items: List<Card>, val pages: Int, val cursor: String?, val slides: List<Slide> = emptyList())

object Novels {
    const val SITE = "https://novltime.com"
    private const val API = "$SITE/api/v1"
    // the site's own keys, with labels (its genre names come in English only)
    val GENRES = listOf(Triple("action", "أكشن", "Action"), Triple("adventure", "مغامرة", "Adventure"), Triple("fantasy", "خيال", "Fantasy"), Triple("system", "نظام", "System"),
        Triple("romance", "رومانسي", "Romance"), Triple("drama", "دراما", "Drama"), Triple("comedy", "كوميدي", "Comedy"), Triple("mystery", "غموض", "Mystery"),
        Triple("horror", "رعب", "Horror"), Triple("thriller", "إثارة", "Thriller"), Triple("scifi", "خيال علمي", "Sci-Fi"), Triple("litrpg", "ليت آر بي جي", "LitRPG"),
        Triple("wuxia", "ووشيا", "Wuxia"), Triple("xianxia", "شيانشيا", "Xianxia"), Triple("historical", "تاريخي", "Historical"), Triple("urban", "حضري", "Urban"),
        Triple("sliceoflife", "شريحة من الحياة", "Slice of Life"))
    val SORT = listOf("trending" to "mHot", "views" to "mSortViews", "latest" to "mSortNew", "rating" to "mSortRating")
    fun genre(k: String) = GENRES.find { it.first == k }?.let { if (Store.lang == "ar") it.second else it.third } ?: k

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    // not through Pages: a cursor carries the time it was made, so an address with one never comes up twice, saved it would only fill the disk
    private suspend fun live(url: String) = Net.fetch(url).let { if (it.status >= 400) throw java.io.IOException("HTTP ${it.status}"); it.body }
    private fun JSONArray.objs() = (0 until length()).mapNotNull { optJSONObject(it) }
    private fun JSONArray.strs() = (0 until length()).mapNotNull { optString(it).takeIf { s -> s.isNotEmpty() } }
    private fun JSONObject.str(k: String) = if (isNull(k)) "" else optString(k)

    private fun full(u: String) = if (u.startsWith("/")) SITE + u else u
    // a poster small: the full ones run ~180KB each, a grid's worth was megabytes
    private fun thumb(u: String) = if (u.startsWith("/")) "$SITE/_next/image?url=${enc(u)}&w=280&q=75" else u

    internal fun card(o: JSONObject): Card {
        val path = "/novel/${o.str("id")}"
        val rating = o.optJSONObject("stats")?.optDouble("avgRating", 0.0) ?: 0.0
        return Card(path, "novel", o.str("title"), thumb(o.str("coverURL")), if (rating > 0) "%.1f".format(java.util.Locale.US, rating) else "", "", "", null, path,
            names = listOf(o.str("title")) + (o.optJSONArray("alternativeTitles")?.strs().orEmpty()), desc = o.str("descriptionShort"))
    }

    internal fun parseList(text: String, resume: (String) -> Screen? = { null }): NovelList {
        val j = JSONObject(text); val m = j.optJSONObject("meta")
        val items = j.getJSONArray("data").objs()
        return NovelList(items.map(::card), m?.optInt("totalPages") ?: 1, m?.takeIf { it.optBoolean("hasMore") }?.str("nextCursor")?.ifEmpty { null },
            items.filter { it.str("coverURL").isNotEmpty() }.take(5).map { Slide(full(it.str("coverURL")), it.str("title"), it.str("descriptionShort"), Screen.NovelTitle(it.str("id")), resume(it.str("id"))) })
    }
    private fun resume(id: String) = resumeOf(id)?.let { (to, it) -> Screen.NovelRead(to, it.optString("ch"), it.optString("title"), it.optString("n")) }

    private fun listUrl(q: Map<String, String>, cursor: String? = null, limit: Int = 30) = "$API/novels?language=ar&limit=$limit" +
        (listOf("sort" to q["sort"], "genre" to q["genre"], "search" to q["search"], "cursor" to cursor)).joinToString("") { (k, v) -> if (v.isNullOrEmpty()) "" else "&$k=${enc(v)}" }

    suspend fun list(q: Map<String, String>, force: Boolean = false, limit: Int = 20) = parseList(Pages.load(listUrl(q, null, limit), force), ::resume)
    /** a listing's first page: its saved copy, then the site's (fresh cursors: they expire after a day) */
    fun browseFlow(q: Map<String, String>, force: Boolean = false) = Pages.flow(listUrl(q), force).map { parseList(it) }
    suspend fun browse(q: Map<String, String>, cursor: String) = parseList(live(listUrl(q, cursor)))
    suspend fun search(q: String) = coroutineScope {
        val mine = async { try { list(mapOf("search" to q), limit = 40).items } catch (e: CancellationException) { throw e } catch (_: Exception) { null } }
        merge(listOf(mine.await(), others(mapOf("search" to q), 1).items))
    }

    private val numbered = Regex("^(?:(الفصل|فصل|chapter|ch\\.?)\\s*)?([0-9]+(?:\\.[0-9]+)?)(?:\\s*[:：\\-–—.،|]+\\s*|\\s+|$)", RegexOption.IGNORE_CASE)
    private fun plain(s: String) = s.filterNot { it in '\u200B'..'\u200F' }.trim()
    /** a chapter's own name. The sites' often just repeat what it's shown with: "الفصل 50: الفصل 50", "<the novel> 325", "2304 <its name>". A number that isn't its number stays: that's news */
    internal fun chName(title: String, n: String, novel: String = ""): String {
        var s = plain(title)
        val book = plain(novel)
        while (true) { // either may come first, or twice
            if (book.isNotEmpty() && s.startsWith(book)) s = s.removePrefix(book).trimStart(' ', ':', '-', '–', '—', '|', '،')
            val m = numbered.find(s)?.takeIf { Manga.chNum(it.groupValues[2]) == n } ?: return s
            s = s.substring(m.range.last + 1)
        }
    }
    /** a chapter's text often opens with its heading, the name the list lacks ("الفصل 50 - الأقلام"): it goes up to the heading, not shown twice */
    internal fun tidy(c: NovelChapter, novel: String): NovelChapter {
        val title = chName(c.title, c.n, novel)
        val head = plain(c.paras.firstOrNull().orEmpty())
        val isHead = c.paras.size > 1 && head.length < 150 && (head == title || numbered.find(head)?.let { it.groupValues[1].isNotEmpty() && Manga.chNum(it.groupValues[2]) == c.n } == true)
        return if (isHead) c.copy(title = title.ifEmpty { chName(head, c.n, novel) }, paras = c.paras.drop(1)) else c.copy(title = title)
    }
    private val names = java.util.concurrent.ConcurrentHashMap<String, String>() // a novel's title, once known: its chapters' names may repeat it
    private fun tidy(id: String, f: NovelFull): NovelFull {
        if (f.n.title.isNotEmpty()) names[id] = f.n.title
        fun ok(c: NovelCh) = c.copy(title = chName(c.title, c.n, f.n.title))
        return f.copy(chs = f.chs.map(::ok), first = f.first?.let(::ok))
    }

    /** a title for telling novels apart across sites: its letters only, the spellings of alef, ta marbuta and ya made one */
    internal fun titleKey(s: String) = s.lowercase().filter { it.isLetterOrDigit() }.replace(Regex("[أإآ]"), "ا").replace('ة', 'ه').replace('ى', 'ي')
    /** lists of cards, interleaved, each novel once (by an earlier list first: novltime opens all its chapters); seen carries over between pages of one browse */
    internal fun merge(lists: List<List<Card>?>, seen: MutableSet<String> = HashSet()): List<Card> {
        val kept = lists.map { l -> l.orEmpty().filter { c -> (listOf(c.title) + c.names).map(::titleKey).filter { it.isNotEmpty() }.toSet().let { k -> if (k.any { it in seen }) false else { seen += k; true } } } }
        return (0 until (kept.maxOfOrNull { it.size } ?: 0)).flatMap { i -> kept.mapNotNull { it.getOrNull(i) } }
    }
    private val bg = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    /** this novel on every site that has it, found by its title, each site's as it answers. In the sites' order, so "source 2" stays the same one */
    fun copies(novel: String, titles: List<String>): Flow<List<String>> = channelFlow {
        val keys = titles.map(::titleKey).filter { it.isNotEmpty() }.toSet()
        val q = plain(titles.first())
        val sites = listOf<NovelSite?>(null) + NovelSites.all // null: novltime
        val mine = sites.indexOf(NovelSites.of(novel)?.first)
        val found = java.util.concurrent.ConcurrentHashMap(mapOf(mine to novel))
        fun now() = sites.indices.mapNotNull { found[it] }
        send(now())
        sites.forEachIndexed { i, s -> if (i != mine) launch {
            // kept going by bg if we leave: what it saves makes the next look quick
            val got = bg.async { try { s?.search(q) ?: list(mapOf("search" to q), limit = 40).items } catch (e: CancellationException) { throw e } catch (_: Exception) { null } }.await()
            got?.find { c -> (listOf(c.title) + c.names).any { titleKey(it) in keys } }?.let { found[i] = it.path.substringAfter("/novel/"); send(now()) }
        } }
    }
    /** the chapter with this number in a novel, if it has it open */
    suspend fun sameChapter(novel: String, n: String): NovelCh? = NovelSites.of(novel).let { s -> if (s != null) s.first.find(s.second, n) else fullFlow(novel).last().chs.find { it.n == n } }
    /** reading goes on in another site's copy: the place to come back to is there now, and "continue reading" shows only it */
    fun switched(from: String, to: String) {
        place(from)?.put("use", to); place(to)?.remove("use")
        Store.persist("novels", true)
    }
    /** where this novel was left, on whichever site's copy that was */
    fun resumeOf(id: String): Pair<String, JSONObject>? {
        val r = place(id) ?: return null
        val u = r.optString("use")
        return (if (u.isNotEmpty()) place(u)?.let { u to it } else null) ?: (id to r)
    }
    /**
     * the other sites' page of a catalogue, or their search; genre and sort are novltime's own, so filtered it's novltime alone.
     * wait: a slow site doesn't hold up the rest: its answer, if late, still lands in the cache for next time
     */
    suspend fun others(q: Map<String, String>, p: Int, force: Boolean = false, wait: Long = 15_000): Listing = coroutineScope {
        val s = q["search"]
        if (q["genre"] != null || q["sort"] != null || (s != null && p > 1)) return@coroutineScope Listing(emptyList(), 0)
        val got = NovelSites.all.map { site ->
            async { bg.async { try { if (s != null) Listing(site.search(s), 1) else site.page(p, force) } catch (e: CancellationException) { throw e } catch (_: Exception) { null } }.let { d -> withTimeoutOrNull(wait) { d.await() } } }
        }.awaitAll()
        Listing(merge(got.map { it?.items }), got.maxOfOrNull { it?.pages ?: 0 } ?: 0)
    }

    /** the latest chapters' feed: one card per novel, its newest chapter on the badge */
    suspend fun updates(force: Boolean = false): List<Card> = JSONObject(Pages.load("$API/novels/latest-updates?limit=24", force)).getJSONArray("data").objs()
        .filter { it.str("language") == "ar" }.map { o ->
            card(o).copy(badge = o.optJSONArray("latestChapters")?.optJSONObject(0)?.let { "${t("chShort")} ${Manga.chNum(it.opt("order"))}" }.orEmpty())
        }

    internal fun info(o: JSONObject, stats: JSONObject?, author: JSONObject?) = NovelInfo(o.str("id"), o.str("title"), o.optJSONArray("alternativeTitles")?.strs().orEmpty().joinToString(" · "),
        o.str("descriptionLong").ifEmpty { o.str("descriptionShort") }, author?.str("displayName")?.ifEmpty { author.str("username") }.orEmpty(), o.optJSONArray("genres")?.strs().orEmpty(),
        o.str("completionStatus") == "COMPLETED", thumb(o.str("coverURL")), (stats ?: o.optJSONObject("stats"))?.optLong("views") ?: 0, (stats ?: o.optJSONObject("stats"))?.optInt("followers") ?: 0,
        (stats ?: o.optJSONObject("stats"))?.optInt("chapterCount") ?: 0, full(o.str("coverURL")))

    private fun ch(o: JSONObject) = NovelCh(o.str("id"), o.str("slug"), Manga.chNum(o.opt("order")), o.str("title"), o.optInt("wordCount"))

    private fun chUrl(id: String, cursor: String?, limit: Int = 1000) = "$API/novels/$id/chapters/published?limit=$limit&sort=desc" + (cursor?.let { "&cursor=${enc(it)}" } ?: "&page=1")
    // its 504s come and go, and a second try gets through: one mustn't cost a long novel its list
    private suspend fun chPage(id: String, cursor: String?) = try { JSONObject(live(chUrl(id, cursor))) } catch (e: CancellationException) { throw e } catch (_: Exception) {
        kotlinx.coroutines.delay(300)
        JSONObject(live(chUrl(id, cursor)))
    }
    private fun chsOf(j: JSONObject) = j.getJSONArray("data").objs().map(::ch)
    private fun nextOf(j: JSONObject) = j.optJSONObject("meta")?.takeIf { it.optBoolean("hasMore") }?.str("nextCursor")?.ifEmpty { null }
    // the rest of a long list, up to 1000 a request; null: a page couldn't be had
    private suspend fun walk(id: String, head: List<NovelCh>, from: String): List<NovelCh>? {
        val out = ArrayList(head)
        var cursor: String? = from
        while (cursor != null) {
            val j = try { chPage(id, cursor) } catch (e: CancellationException) { throw e } catch (_: Exception) { return null }
            out += chsOf(j); cursor = nextOf(j)
        }
        return out
    }
    /** the newest page on top of the saved list, what's older being as it was; null: they don't meet, or it isn't the site's count (something changed further back) */
    // ponytail: an older chapter renamed in place stays as saved until the count changes; walk now and then if that shows up
    internal fun splice(top: List<NovelCh>, old: List<NovelCh>, count: Int): List<NovelCh>? {
        val at = old.indexOfFirst { it.id == top.lastOrNull()?.id }
        return if (at < 0) null else (top + old.drop(at + 1)).takeIf { it.size == count }
    }
    /** the newest chapter, for the new-chapter check: one row, not the whole list */
    suspend fun newest(id: String) = NovelSites.of(id)?.let { (site, slug) -> site.full(slug, true, false).last().chs.firstOrNull() } ?: chsOf(JSONObject(live(chUrl(id, null, 1)))).firstOrNull()

    // the whole list is saved as one: its pages can't be, each new first page hands out a new cursor for the one after
    private fun chKey(id: String) = "$API/novels/$id/chapters"
    private fun chsText(l: List<NovelCh>) = JSONArray(l.map { JSONObject().put("id", it.id).put("slug", it.slug).put("n", it.n).put("title", it.title).put("words", it.words) }).toString()
    private fun chsRead(s: String) = JSONArray(s).objs().map { NovelCh(it.str("id"), it.str("slug"), it.str("n"), it.str("title"), it.optInt("words")) }

    /** a novel's page: its saved list at once, else its newest chapters while the older ones come; then only what's new is asked for */
    fun fullFlow(id: String, force: Boolean = false, whole: Boolean = true): Flow<NovelFull> = NovelSites.of(id)?.let { (site, slug) -> site.full(slug, force, whole).map { tidy(id, it) } } ?: flow {
        val key = chKey(id)
        val old = Pages.saved(key)?.let { s -> runCatching { chsRead(s) }.getOrNull() } // cut off by the app being killed: as if it wasn't there
        coroutineScope {
            val view = async { JSONObject(Pages.load("$API/novels/$id/view", force)).getJSONObject("data") }
            val top = if (!force && old != null && !Pages.due(key)) null else async {
                try { chPage(id, null) } catch (e: CancellationException) { throw e } catch (e: Exception) { if (old == null) throw e else null } // offline: the saved list
            }
            val v = view.await()
            val n = info(v.getJSONObject("novel"), v.optJSONObject("stats"), v.optJSONObject("author"))
            val first = v.optJSONArray("chapters")?.optJSONObject(0)?.let(::ch) // its first 20 come oldest first
            val similar = v.optJSONArray("similar")?.objs().orEmpty().map(::card)
            val out = { l: List<NovelCh> -> l.forEach { ids["$id/${it.slug}"] = it.id }; tidy(id, NovelFull(n, l, first, similar)) }
            if (old != null) emit(out(old))
            val j = top?.await() ?: return@coroutineScope
            val head = chsOf(j); val cursor = nextOf(j)
            val all = if (cursor == null) head else old?.let { splice(head, it, n.count) } ?: run {
                if (old == null) emit(out(head))
                walk(id, head, cursor)
            }
            if (all != null) { Pages.put(key, chsText(all)); emit(out(all)) }
        }
    }

    // the text as paragraphs: contentJson's blocks, or the plain copy split on its line breaks
    internal fun parseChapter(novel: String, c: JSONObject, ctx: JSONObject?): NovelChapter {
        val blocks = c.optJSONArray("contentJson")?.objs().orEmpty().map { it.str("text") }
        val paras = (blocks.ifEmpty { c.str("content").split('\n') }).map { it.trim() }.filter { it.isNotEmpty() }
        return NovelChapter(novel, c.str("id"), c.str("slug"), Manga.chNum(c.opt("order")), c.str("title"), paras, c.optInt("wordCount"),
            ctx?.optJSONObject("prev")?.str("slug")?.ifEmpty { null }, ctx?.optJSONObject("next")?.str("slug")?.ifEmpty { null })
    }

    private fun chapterUrl(novel: String, slug: String) = "$API/novels/$novel/chapters/by-slug/${enc(slug)}"
    private fun contextUrl(id: String) = "$API/chapters/$id/context"

    // a chapter's id, once a list or a neighbour has named it: what's around it can then be asked for alongside it, not after
    private val ids = java.util.concurrent.ConcurrentHashMap<String, String>()
    /** a chapter: its saved copy straight away if downloaded, else the site's; with its neighbours (no list needed to go on). Off the main thread: the reader asks while it's being scrolled */
    suspend fun chapter(novel: String, slug: String, force: Boolean = false): NovelChapter {
        val file = com.medanime.app.Downloads.of(dlId(novel, slug))?.takeIf { it.optString("state") == "done" }?.optString("file").orEmpty()
        val book = names[novel] ?: place(novel)?.optString("title").orEmpty()
        return tidy(withContext(Dispatchers.IO) {
            if (file.isNotEmpty()) runCatching { JSONObject(java.io.File(file).readText()) }.getOrNull()?.let { return@withContext parseChapter(novel, it.getJSONObject("c"), it.optJSONObject("x")) }
            NovelSites.of(novel)?.let { (site, s) -> return@withContext site.chapter(s, slug) }
            suspend fun around(id: String) = try { JSONObject(Pages.load(contextUrl(id), force)).optJSONObject("data") } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            val early = ids["$novel/$slug"]?.let { async { around(it) } }
            val c = JSONObject(Pages.load(chapterUrl(novel, slug), force, every = Pages.DAY)).getJSONObject("data") // its text hardly changes
            val x = early?.await() ?: around(c.str("id"))
            listOf("prev", "next").forEach { k -> x?.optJSONObject(k)?.let { ids["$novel/${it.str("slug")}"] = it.str("id") } }
            parseChapter(novel, c, x)
        }, book)
    }
    private val chNames = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val namesGate = kotlinx.coroutines.sync.Semaphore(4) // a screenful of rows at once, not on top of the chapter being opened
    /**
     * a chapter's name from its own text, for a row the list came without one: seanovel's lists name only its first few, others only say the number again.
     * Asked for rows as they come into view, once: thousands of pages up front would be a crawl of the site. Failing, it's just a row with no name, for now
     */
    suspend fun chapterName(novel: String, slug: String): String = chNames["$novel/$slug"] ?: try {
        kotlinx.coroutines.delay(200) // flung past: never asked
        namesGate.withPermit { chapter(novel, slug).title }.also { chNames["$novel/$slug"] = it }
    } catch (e: CancellationException) { throw e } catch (_: Exception) { "" }
    /** a download's file: the chapter and its neighbours, as they came */
    suspend fun chapterFile(novel: String, slug: String): String {
        NovelSites.of(novel)?.let { (site, s) -> // the same shape as novltime's, for parseChapter
            val c = site.chapter(s, slug)
            fun near(x: String?) = x?.let { JSONObject().put("slug", it) } ?: JSONObject.NULL
            return JSONObject().put("c", JSONObject().put("id", c.id).put("slug", c.slug).put("order", c.n).put("title", c.title).put("wordCount", c.words)
                .put("contentJson", JSONArray(c.paras.map { JSONObject().put("text", it) }))).put("x", JSONObject().put("prev", near(c.prev)).put("next", near(c.next))).toString()
        }
        suspend fun get(u: String) = JSONObject(live(u)).getJSONObject("data")
        val c = get(chapterUrl(novel, slug))
        return JSONObject().put("c", c).put("x", get(contextUrl(c.str("id")))).toString()
    }
    fun dlId(novel: String, slug: String) = "novel:$novel/$slug"

    // ---------- where the reader is: store.novels { id: { title, poster, ch, n, spots: { chapter: paragraph + how far down it }, at } } ----------
    fun place(novel: String): JSONObject? = Store["novels"].optJSONObject(novel)
    fun spot(novel: String, slug: String) = place(novel)?.optJSONObject("spots")?.optDouble(slug, 0.0) ?: 0.0
    /** this chapter's now the one being read; opened once: seen (1), read to its end: 2 */
    fun opened(novel: String, title: String, poster: String, c: NovelChapter) {
        val was = place(novel)
        // back on a copy it had moved on from: this one's the current one again
        was?.optString("use")?.takeIf { it.isNotEmpty() }?.let { u -> was.remove("use"); place(u)?.put("use", novel) }
        val r = (was ?: JSONObject().put("id", novel).put("spots", JSONObject()))
        if (title.isNotEmpty()) r.put("title", title)
        if (poster.isNotEmpty()) r.put("poster", poster)
        Store["novels"].put(novel, r.put("ch", c.slug).put("n", c.n).put("chTitle", c.title).put("at", System.currentTimeMillis()))
        if (!Store["novelSeen"].has(c.id)) Store["novelSeen"].put(c.id, 1)
        Store.persist("novels", true); Store.persist("novelSeen", true)
    }
    fun keep(novel: String, slug: String, at: Double) {
        val spots = place(novel)?.optJSONObject("spots") ?: return
        spots.put(slug, at)
        Store.persist("novels", true)
    }
    // its spot goes too: a novel's thousands of chapters mustn't each stay in the file, saved twice a second
    fun finished(c: NovelChapter) {
        val spot = place(c.novel)?.optJSONObject("spots")?.remove(c.slug) // read again later: gone again
        if (spot != null) Store.persist("novels", true)
        if (Store["novelSeen"].optInt(c.id) != 2) { Store["novelSeen"].put(c.id, 2); Store.persist("novelSeen", true) }
    }

    // ---------- bookmarks and highlights: store.novelMarks { novel: [ { ch, n, p, text, kind: "mark" | "hl", at } ] } ----------
    fun marks(novel: String) = Store["novelMarks"].optJSONArray(novel)?.objs().orEmpty().sortedByDescending { it.optLong("at") }
    fun marked(novel: String, slug: String, para: Int, kind: String) = marks(novel).any { it.optString("ch") == slug && it.optInt("p") == para && it.optString("kind") == kind }
    fun dropMark(novel: String, m: JSONObject) { setMarks(novel, marks(novel).filter { it !== m && !(it.optString("ch") == m.optString("ch") && it.optInt("p") == m.optInt("p") && it.optString("kind") == m.optString("kind")) }) }
    fun toggleMark(novel: String, c: NovelChapter, para: Int, kind: String): Boolean {
        val on = marked(novel, c.slug, para, kind)
        setMarks(novel, if (on) marks(novel).filter { !(it.optString("ch") == c.slug && it.optInt("p") == para && it.optString("kind") == kind) }
            else marks(novel) + JSONObject().put("ch", c.slug).put("n", c.n).put("p", para).put("text", c.paras.getOrNull(para).orEmpty().take(140)).put("kind", kind).put("at", System.currentTimeMillis()))
        return !on
    }
    private fun setMarks(novel: String, l: List<JSONObject>) {
        Store["novelMarks"].put(novel, JSONArray(l))
        Store.persist("novelMarks") // not quiet: the pages' marks redraw
    }

    // ---------- plain logic, tested on its own (NovelsTest) ----------
    /** a search of the text that doesn't mind its tashkeel: "ملك" finds "مَلِك" */
    internal fun findRe(q: String) = q.trim().takeIf { it.isNotEmpty() }?.let { s ->
        Regex(s.filter { it !in 'ً'..'ْ' && it != 'ـ' }.map { Regex.escape(it.toString()) }.joinToString("[\\u064B-\\u0652\\u0640]*"), RegexOption.IGNORE_CASE)
    }
    /** a paragraph in pieces the speech engine takes (it refuses more than ~4000 characters at once), cut after a sentence where it can */
    internal fun speechParts(text: String, max: Int = 3800): List<String> {
        val out = ArrayList<String>()
        var rest = text
        while (rest.length > max) {
            val cut = rest.lastIndexOfAny(charArrayOf('.', '؟', '!', '،', '\n', ' '), max - 1).takeIf { it > 0 } ?: (max - 1)
            out += rest.substring(0, cut + 1)
            rest = rest.substring(cut + 1)
        }
        if (rest.isNotBlank()) out += rest
        return out
    }
    /** a run of a paragraph's lines on one page */
    internal data class Slice(val block: Int, val from: Int, val to: Int)
    /** lines to pages: the blocks' line heights, a block running on to the next page where it doesn't fit; a line taller than the page still gets one */
    internal fun fitPages(blocks: List<FloatArray>, height: Float, gap: Float): List<List<Slice>> {
        val pages = ArrayList<List<Slice>>()
        var page = ArrayList<Slice>()
        var y = 0f
        blocks.forEachIndexed { b, lines ->
            var from = 0
            if (page.isNotEmpty()) y += gap
            lines.forEachIndexed { i, h ->
                if (y + h > height && (page.isNotEmpty() || i > from)) {
                    if (i > from) page.add(Slice(b, from, i))
                    pages.add(page); page = ArrayList(); y = 0f; from = i
                }
                y += h
            }
            if (lines.size > from) page.add(Slice(b, from, lines.size))
        }
        if (page.isNotEmpty()) pages.add(page)
        return pages
    }
    /** the page a spot (paragraph + how far down it) falls on; block 0 is the chapter's heading */
    internal fun pageOf(pages: List<List<Slice>>, lineCount: (Int) -> Int, at: Double): Int {
        val para = at.toInt(); val block = para + 1
        val line = ((at - para) * lineCount(block.coerceAtMost(pages.lastOrNull()?.lastOrNull()?.block ?: 0))).toInt()
        val i = pages.indexOfFirst { p -> p.any { it.block > block || (it.block == block && it.to > line) } }
        return if (i >= 0) i else (pages.size - 1).coerceAtLeast(0)
    }
}
