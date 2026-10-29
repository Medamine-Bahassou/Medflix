package com.medanime.app.ui

import android.util.Base64
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.IOException
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder

// cinema.js in Kotlin: ArabSeed / MySeed films and series (WordPress, server-rendered), selectors also covering EgyDead.
// No anime here: witanime has every anime title, so the site's "انمي" cards are dropped wherever they show up.
// A film's slug is its root path ("by-any-means"); a series' carries its folder ("serie/x", "season/x-s02", "episode/x-s02e01").
data class EpRef(val slug: String, val n: String)
data class Movie(val title: String, val year: String, val dub: Boolean, val origin: String, val poster: String, val banner: String, val desc: String,
                 val cat: List<String>, val genres: List<String>, val tags: List<String>, val trailer: String, val related: List<Card>,
                 val seasons: List<Card>, val episodes: List<EpRef>, val up: String)
data class Link(val label: String, val quality: String, val url: String, val backup: Boolean = false) // backup: another site's copy of the film

object Cinema {
    const val ED = "https://m.myseed.tv"
    // [id, listing path, ar, en]
    val CATS = listOf(
        listOf("all", "/recently/", "أحدث الأفلام", "Latest movies"), // everything just added: its films (see list)
        listOf("english", "/category/foreign-movies/", "أفلام أجنبية", "Foreign movies"),
        listOf("arabic", "/category/arabic-movies/", "أفلام عربية", "Arabic movies"),
        listOf("netflix", "/category/netflix/netflix-movies/", "أفلام نتفليكس", "Netflix movies"),
        listOf("asian", "/category/asian-movies/", "أفلام آسيوية", "Asian movies"),
        listOf("hindi", "/category/indian-movies/", "أفلام هندية", "Indian movies"),
        listOf("turkish", "/category/turkish-movies/", "أفلام تركية", "Turkish movies"),
        listOf("cartoon", "/category/animation-movies/", "أفلام كرتون", "Cartoon movies"),
        listOf("dubbed", "/category/dubbed-movies/", "أفلام مدبلجة", "Dubbed movies"),
        listOf("classic", "/category/افلام-كلاسيكيه/", "أفلام كلاسيكية", "Classic movies"),
        // series: category pages list episodes, shown as their show (one card per show)
        listOf("series", "/series/", "أحدث المسلسلات", "Latest series"),
        listOf("english-series", "/category/foreign-series/", "مسلسلات أجنبية", "Foreign series"),
        listOf("arabic-series", "/category/arabic-series/", "مسلسلات عربية", "Arabic series"),
        listOf("egyptian-series", "/category/مسلسلات-مصريه/", "مسلسلات مصرية", "Egyptian series"),
        listOf("netflix-series", "/category/netflix/netflix-series/", "مسلسلات نتفليكس", "Netflix series"),
        listOf("turkish-series", "/category/turkish-series/", "مسلسلات تركية", "Turkish series"),
        listOf("asian-series", "/category/مسلسلات-كوريه/", "مسلسلات كورية", "Korean series"),
        listOf("hindi-series", "/category/مسلسلات-هندية/", "مسلسلات هندية", "Indian series"),
        listOf("cartoon-series", "/category/cartoon-series/", "مسلسلات كرتون", "Cartoon series"),
        listOf("dubbed-series", "/category/dubbed-series/", "مسلسلات مدبلجة", "Dubbed series"),
        listOf("ramadan", "/category/مسلسلات-رمضان/", "مسلسلات رمضان", "Ramadan series"),
        listOf("tv-shows", "/category/برامج-تلفزيونية/", "برامج تلفزيونية", "TV shows"),
    )
    fun catName(id: String) = CATS.find { it[0] == id }?.let { if (Store.lang == "ar") it[2] else it[3] } ?: id
    private fun isAnimeCat(s: String) = Regex("انمي|انميات|أنمي").containsMatchIn(s)
    private fun txt(e: Element?) = e?.text()?.trim() ?: ""
    private fun img(e: Element?) = e?.attr("data-src")?.ifEmpty { null } ?: e?.attr("src") ?: ""
    private fun norm(s: String) = Manga.norm(s)

    // "مشاهدة فيلم By Any Means 2026 مترجم" -> title "By Any Means", year "2026"
    fun edTitle(name: String): Pair<String, String> {
        val s = name.replace(Regex("^\\s*(مشاهدة\\s+)?(و\\s*تحميل\\s+)?((فيلم|مسلسل|برنامج|انمي|أنمي)\\s+)?"), "").replace(Regex("\\s+(مترجم|مدبلج)[ةه]?(\\s+.*)?$"), "").trim()
        val year = Regex("\\b(19|20)\\d\\d\\b(?!.*\\b(19|20)\\d\\d\\b)").find(s)?.value ?: ""
        return (s.replace(Regex("\\s*\\(?$year\\)?\\s*$"), "").trim().ifEmpty { s }) to year
    }
    // movies sit at the site root (/slug/); series and seasons under /selary/ (kept in the slug as serie/, season/, episode/)
    fun slugOf(href: String): String {
        var u = try { URI(ED).resolve(href.trim()).rawPath ?: "" } catch (e: Exception) { "" }
        u = runCatching { URLDecoder.decode(u.replace("+", "%2B"), "UTF-8") }.getOrDefault(u)
        val p = Regex("^/(?:(serie|season|episode)s?/|(selary)/)?([^/]+)/?$", RegexOption.IGNORE_CASE).find(u) ?: return ""
        val (d1, d2, name) = p.destructured
        if (Regex("^(page|category|find|movies|series|watch|download|login|register|actor|author|tag|main|genre)$", RegexOption.IGNORE_CASE).matches(d1.ifEmpty { name })) return ""
        val dir = if (d1.isNotEmpty()) d1.lowercase() else if (d2.isNotEmpty()) "serie" else if (Regex("الحلقة|-eps\\d+|^(مسلسل|برنامج)-").containsMatchIn(name)) "episode" else ""
        return (if (dir.isNotEmpty()) "$dir/" else "") + name
    }
    private fun pathOf(slug: String) = slug.replace(Regex("^(serie|season|episode)/")) { if (it.groupValues[1] == "episode") "" else "selary/" }
    fun url(slug: String) = "$ED/${pathOf(slug)}/"
    private fun showKey(c: Card) = if (Regex("^/cinema/(serie|season|episode)/").containsMatchIn(c.path)) c.title.replace(Regex("\\s*(الموسم|الحلقة)\\s.*$"), "") else null

    fun cards(root: Element?): List<Card> {
        root ?: return emptyList()
        val stems = HashSet<String>()
        class Raw(val slug: String, val cat: String, val name: String, val t: Pair<String, String>, val a: Element)
        val raw = root.select("a.movie__block[href], .series__box > a[href], .innov-series-card > a[href], li.movieItem > a[href]").mapNotNull { a ->
            val slug = slugOf(a.attr("href"))
            val cat = txt(a.selectFirst(".cat_name, .post__category"))
            val name = a.attr("title").ifEmpty { txt(a.selectFirst("h1, h3, .title___")) }
            val t = edTitle(name)
            if (isAnimeCat("$cat $name")) { norm(t.first).split(' ').filter { it.isNotEmpty() }.take(2).joinToString(" ").takeIf { it.isNotEmpty() }?.let(stems::add); return@mapNotNull null }
            if (slug.isEmpty()) null else Raw(slug, cat, name, t, a)
        }
        val out = raw.filter { r -> // a cartoon that's one of the anime dropped above
            if (stems.isEmpty() || !Regex("أنيميشن|كرتون").containsMatchIn(r.cat)) true
            else norm(r.t.first).split(' ').filter { it.isNotEmpty() }.take(2).joinToString(" ").let { it.isEmpty() || it !in stems }
        }.map { r ->
            val ep = r.slug.startsWith("episode/")
            val dub = Regex("مدبلج").containsMatchIn(r.name + r.cat)
            // an episode stands for its show: named as it, with the episode as a badge, opening the show
            Card("/cinema/${r.slug}", "cinema", if (ep) r.t.first.replace(Regex("\\s*الحلقة\\s.*$"), "").ifEmpty { r.t.first } else r.t.first,
                img(r.a.selectFirst("img")), Regex("^\\d+(\\.\\d+)?$").find(txt(r.a.selectFirst(".post__ratings")))?.value ?: "", r.t.second,
                if (ep) Regex("الحلقة\\s+\\d+").find(r.name)?.value ?: "" else if (dub) t("dubbed") else "", null, "/cinema/${r.slug}",
                open = if (ep) Screen.CinemaTitle(r.slug, show = true) else null, desc = txt(r.a.selectFirst(".post__info p, .story")), dub = dub)
        }
        // a pinned film is listed twice; a show's newest episode/season stands for it
        return out.filterIndexed { i, c -> out.indexOfFirst { o -> o.path == c.path || (showKey(c) != null && showKey(o) == showKey(c)) } == i }
    }

    private fun parse(html: String, url: String): Document = Jsoup.parse(html, url)

    suspend fun list(id: String, page: Int = 1, force: Boolean = false): Listing {
        val u = ED + CATS.first { it[0] == id }[1] + if (page > 1) "page/$page/" else ""
        val doc = parse(Pages.load(u, force), u)
        val items = cards(doc).let { l -> if (id == "all") l.filter { it.path.startsWith("/cinema/فيلم-") } else l } // latest additions: the films only
        return Listing(items, maxOf(1, doc.select("a[href*=/page/]").maxOfOrNull { Regex("/page/(\\d+)").find(it.attr("href"))?.groupValues?.get(1)?.toInt() ?: 0 } ?: 1))
    }
    suspend fun search(q: String) = cards(parse(Pages.load("$ED/find/?word=${URLEncoder.encode(q, "UTF-8")}"), ED))

    suspend fun movie(slug: String, force: Boolean = false): Movie {
        val u = url(slug)
        val doc = parse(Pages.load(u, force), u)
        val self = slugOf(u)
        fun field(vararg labels: String) = doc.select(".LeftBox li, .info__area__ul > li").find { l -> labels.any { txt(l.selectFirst(".title__kit span, span")).startsWith(it) } }
        fun vals(vararg labels: String) = field(*labels)?.select("a, .as-info-value")?.map(::txt)?.filter { it.isNotEmpty() } ?: emptyList()
        val poster = img(doc.selectFirst(".poster__single img, .single-thumbnail img"))
        val seasonCards = cards(doc.selectFirst(".seasons-list")).reversed()
        val seasonBtns = doc.select(".seasons__list__btns a[href], #seasons__list li[data-url]").mapNotNull { el ->
            slugOf(el.attr("href").ifEmpty { el.attr("data-url") }).takeIf { it.isNotEmpty() }?.let { Card("/cinema/$it", "cinema", txt(el), poster, "", "", "", null, "/cinema/$it") }
        }.distinctBy { it.path }
        val h1 = txt(doc.selectFirst("h1.post__name, .singleTitle"))
        if (h1.isEmpty()) throw IOException("not a title page") // an error page, or another site's
        val (title, year) = edTitle(h1)
        val crumb = doc.selectFirst(".bread__crumbs a[href^=http], .breadcrumbs-single a[href^=http]")?.attr("href") ?: ED
        return Movie(title, year, "مدبلج" in h1, URI(crumb).let { "${it.scheme}://${it.host}" }, poster,
            img(doc.selectFirst(".lcp-cover-img, .aseed-lcp-img, .single__cover img")).ifEmpty { null }
                ?: Regex("url\\([\"']?([^\"')]+)").find(doc.selectFirst(".singleCover")?.attr("style") ?: "")?.groupValues?.get(1) ?: poster,
            txt(doc.selectFirst(".post__story p, .post__content, .extra-content p, .singleStory")),
            vals("القسم", "تصنيف"), vals("النوع", "نوع"),
            vals("السنه", "سنة") + vals("الجوده", "جودة") + vals("البلد", "بلد") + vals("اللغه", "لغة") + vals("مده العرض", "مدة"),
            doc.selectFirst(".show__trailer[data-iframe]")?.attr("data-iframe") ?: doc.selectFirst("#trailerPopup iframe[src*=youtube]")?.attr("src") ?: "",
            cards(doc.selectFirst(".related__blocks, .related_section, .related-posts")),
            seasonCards.ifEmpty { seasonBtns },
            doc.select(".episodes__list a[href], .EpsList a[href]").map { a -> EpRef(slugOf(a.attr("href")), Regex("\\d+(\\.\\d+)?").find(txt(a.selectFirst("b") ?: a))?.value ?: txt(a)) }
                .filter { it.slug.startsWith("episode/") }.distinctBy { it.slug }.sortedBy { it.n.toDoubleOrNull() ?: 0.0 },
            // an episode's season (or series), a season's series: the last such link in the breadcrumbs before self
            doc.select(".bread__crumbs a[href], .breadcrumbs-single a[href]").map { slugOf(it.attr("href")) }.lastOrNull { it.isNotEmpty() && it != self && Regex("^(season|serie)/").containsMatchIn(it) } ?: "")
    }

    // ---------- servers: the watch page (title + watch/), its wrappers unwrapped to the hosts' embeds ----------
    private val GOOD = listOf("myseed", "vidmoly", "vidara", "earnvids", "voe", "dsvplay")
    // old films still list these long-gone hosts first
    private val DEAD = Regex("(^|\\.)(openload|oload|verystream|gounlimited|clipwatching|watchvideo|mystream|uptostream|streamango|rapidvideo|vidlox|vidoza)\\.")
    private const val LAST = "uqload" // plays, but with ads: listed last and never picked by default
    private fun rank(h: String) = if (h == LAST) 100 else GOOD.indexOf(h).let { if (it < 0) 99 else it }
    fun host(u: String) = runCatching { URI(u).host.removePrefix("www.").substringBefore('.') }.getOrDefault("")
    private fun b64(s: String) = runCatching { String(Base64.decode(s.replace('-', '+').replace('_', '/'), Base64.DEFAULT)) }.getOrDefault("")
    private fun myseedUrl(tok: String, origin: String) = "https://d.myseed.tv/player-gateway.php?src=myseed&front=${URI(origin).host}&t=$tok"
    private fun base(m: Movie, slug: String) = "${m.origin}/" + pathOf(slug).split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }

    private suspend fun get(url: String, asPlayer: Boolean = false, headers: Map<String, String> = emptyMap()): String {
        val r = Net.fetch(url, headers, asPlayer = asPlayer)
        if (r.status >= 400) throw IOException("HTTP ${r.status}")
        return r.body
    }

    // egydead's MegaMax player: the hosts it wraps (an Inertia page: its data, then a partial reload asking for streams)
    private suspend fun mirrors(url: String): List<Link> {
        val page = JSONObject(Regex("<script data-page=\"app\" type=\"application/json\">([\\s\\S]*?)</script>").find(get(url))!!.groupValues[1])
        val data = JSONObject(get(url, headers = mapOf("X-Inertia" to "true", "X-Inertia-Version" to page.optString("version"),
            "X-Inertia-Partial-Component" to page.optString("component"), "X-Inertia-Partial-Data" to "streams"))).getJSONObject("props").getJSONObject("streams").optJSONArray("data")
        return (0 until (data?.length() ?: 0)).flatMap { i ->
            val q = data!!.getJSONObject(i); val ms = q.getJSONArray("mirrors")
            (0 until ms.length()).map { ms.getJSONObject(it) }.sortedBy { rank(it.optString("driver")) }
                .map { Link(it.optString("driver"), q.optString("label").replace(Regex("\\s*\\(.*\\)"), ""), it.optString("link").let { l -> if (l.startsWith("//")) "https:$l" else l }) }
        }.filter { it.url.startsWith("https://") }
    }
    private suspend fun unwrap(s: Link, origin: String): List<Link> {
        if (s.url.startsWith("/vids.php")) return Regex("[?&]t=([^&]+)").find(s.url)?.let { listOf(s.copy(label = "myseed", url = myseedUrl(it.groupValues[1], origin))) } ?: emptyList()
        if ("/vid/?id=" in s.url) {
            val u = b64(Regex("[?&]id=([^&]+)").find(s.url)?.groupValues?.get(1) ?: "")
            return if (u.startsWith("https://")) listOf(s.copy(label = host(u).ifEmpty { s.label }, url = u)) else emptyList()
        }
        if (!Regex("/iframe/[A-Za-z0-9]+$").containsMatchIn(s.url))
            return if (s.url.startsWith("https://")) listOf(s.copy(label = if (Regex("^سيرفر\\s*\\d*$").matches(s.label)) host(s.url).ifEmpty { s.label } else s.label)) else emptyList()
        return runCatching { mirrors(s.url) }.getOrNull()?.ifEmpty { null } ?: listOf(s)
    }
    class Watch(val servers: List<Link>, val downloads: List<Link>)
    /**
     * every site's links for the title (cinema.js edWatch): the site's own, then, for a film, EgyDead's, MyCima's and
     * WeCima's copies of it; a host already listed isn't offered again by a later site
     */
    suspend fun watch(m: Movie, slug: String): Watch = kotlinx.coroutines.supervisorScope { // a backup site failing mustn't take the others' links with it
        val mine = async { runCatching { seed(m.origin, pathOf(slug)) } }
        val more = if (slug.contains('/')) emptyList() else listOf(async { egy(m) }, async { mc(m) }, async { wc(m) })
            .map { d -> runCatching { d.await() }.onFailure { android.util.Log.w("medflix", "backup", it) }.getOrNull() }.filterNotNull()
        val own = mine.await().getOrElse { if (more.none { it.servers.isNotEmpty() }) throw it else Watch(emptyList(), emptyList()) }
        fun fresh(have: List<Link>, add: List<Link>) = HashSet(have.map { it.label }).let { seen -> add.filter { seen.add(it.label) } }
        Watch(own.servers + fresh(own.servers, more.flatMap { it.servers }), own.downloads + fresh(own.downloads, more.flatMap { it.downloads }))
    }

    // ---------- the backups: the same film (title, year, dubbed or not) found on the other sites ----------
    private fun key(s: String) = s.lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    /** the same name, or with the years matching, one name's words all in the other's (egydead's "Undisputed 4 Boyka" for "Boyka Undisputed") */
    fun sameFilm(m: Movie, name: String): Boolean {
        val (title, year) = edTitle(name)
        val a = key(title).split(' '); val b = key(m.title).split(' ')
        val (few, all) = if (a.size < b.size) a to b.toSet() else b to a.toSet()
        return Regex("^(مشاهدة\\s+)?فيلم\\s").containsMatchIn(name) && (year.isEmpty() || m.year.isEmpty() || year == m.year) && ("مدبلج" in name) == m.dub &&
            (a == b || (year.isNotEmpty() && m.year.isNotEmpty() && few.all { it in all }))
    }
    private fun backups(servers: List<String>) = servers.filter { it.startsWith("https://") }.map { Link(host(it), "", it, true) }.sortedBy { rank(it.label) }

    // EgyDead (behind Cloudflare's check, passed in its page when it asks): its watch page is laid out like ArabSeed's.
    // It hops domains: egydead.space sends on to the current one, where its links point
    private suspend fun egy(m: Movie): Watch {
        val hit = parse(get("https://egydead.space/?s=" + URLEncoder.encode(key(m.title), "UTF-8")), "https://egydead.space/").select(".posts-list .movieItem a[href]")
            .find { sameFilm(m, it.attr("title").ifEmpty { txt(it.selectFirst(".BottomTitle")) }) } ?: return Watch(emptyList(), emptyList())
        val u = URI(hit.absUrl("href"))
        val w = seed("${u.scheme}://${u.host}", URLDecoder.decode(u.rawPath, "UTF-8").trim('/'))
        return Watch(w.servers.map { it.copy(backup = true) }, w.downloads)
    }
    // MyCima: its search is a form; it often has a film twice ("... مترجم", "... مترجم ماي سيما")
    private const val MC = "https://cima.my-cima.net"
    private suspend fun mc(m: Movie): Watch = coroutineScope {
        val r = Net.fetch("$MC/ajax-search.php", form = mapOf("queryString" to m.title))
        val vids = parse(r.body, MC).select("li[data-video-id]").filter { sameFilm(m, txt(it)) }.map { it.attr("data-video-id") }.take(2)
        val pages = vids.map { v -> async { get("$MC/play.php?vid=$v") to runCatching { get("$MC/downloads.php?vid=$v") }.getOrDefault("") } }.awaitAll()
        Watch(backups(pages.flatMap { (p, _) -> parse(p, MC).select(".list_embedded li[data-embed]").map { Regex("src=['\"]([^'\"]+)").find(it.attr("data-embed"))?.groupValues?.get(1) ?: "" } }),
            pages.flatMap { (_, d) -> if (d.isEmpty()) emptyList() else parse(d, MC).select(".downloadlist a[href]").map { a -> Link(host(a.attr("href")).ifEmpty { txt(a.selectFirst("strong")) }, "", a.attr("href")) } }
                .filter { it.url.startsWith("https://") })
    }
    // WeCima: Cloudflare lets a request through when it names the site as its referrer; its pages are only read for links
    private const val WC = "https://wecima.singles"
    private suspend fun wc(m: Movie): Watch {
        val ref = mapOf("Referer" to "$WC/")
        val hit = parse(get("$WC/?s=" + URLEncoder.encode(m.title, "UTF-8"), headers = ref), WC).select(".GridItem a[href][title]").find { sameFilm(m, it.attr("title")) }
            ?: return Watch(emptyList(), emptyList())
        val doc = parse(get(hit.attr("href"), headers = ref), WC)
        return Watch(backups(doc.select("li[data-watch]").map { it.attr("data-watch") }),
            doc.select(".List--Download--Wecima--Single a[href]").map { it.attr("href") }.filter { it.startsWith("https://") }.map { Link(host(it), "", it) })
    }

    // the watch page's own calls, made as its script makes them (an XHR from the site, with the page's csrf token)
    private fun csrf(html: String) = Regex("csrf__token'\\s*:\\s*\"([^\"]+)").find(html)?.groupValues?.get(1)
    private suspend fun xhr(origin: String, what: String, form: Map<String, String>, asPlayer: Boolean = false) =
        JSONObject(Net.fetch("$origin/$what/", mapOf("X-Requested-With" to "XMLHttpRequest", "Referer" to "$origin/"), asPlayer = asPlayer, form = form).body)
    // the watch page lists one quality's servers (480p); the menu asks for the others (720p, 1080p), then each server's link on its own
    private suspend fun otherQualities(origin: String, html: String, doc: Document): List<Link> = coroutineScope {
        val csrf = csrf(html) ?: return@coroutineScope emptyList()
        val post = doc.selectFirst(".servers__list li[data-post]")?.attr("data-post") ?: return@coroutineScope emptyList()
        val shown = doc.select(".servers__list li[data-qu]").map { it.attr("data-qu") }.toSet()
        doc.select(".qualities__list li[data-quality]").map { it.attr("data-quality") }.filter { it.isNotEmpty() && it !in shown }.map { q ->
            async {
                val form = mapOf("post_id" to post, "quality" to q, "csrf_token" to csrf)
                val lis = runCatching { Jsoup.parse(xhr(origin, "get__quality__servers", form).optString("html")).select("li[data-server]") }.getOrDefault(emptyList())
                lis.map { li ->
                    async { runCatching { xhr(origin, "get__watch__server", form + ("server" to li.attr("data-server"))).optString("server") }.getOrNull()
                        ?.takeIf { it.isNotEmpty() }?.let { Link(li.attr("data-server-name").ifEmpty { txt(li) }.ifEmpty { t("server") }, q, it) } }
                }.awaitAll().filterNotNull()
            }
        }.awaitAll().flatten()
    }

    /** a site's watch page (+ watch/) and download page (+ download/): stream servers, best hosts first, and download links */
    private suspend fun seed(origin: String, path: String): Watch = coroutineScope {
        val base = "$origin/" + path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
        val dl = async { runCatching { parse(get("$base/download/"), origin) }.getOrNull() }
        val html = get("$base/watch/")
        val doc = parse(html, origin)
        if (doc.selectFirst(".serversList, .mob-servers, .servers__list") == null) throw IOException("not the watch page: ${txt(doc.selectFirst("title")).ifEmpty { "empty" }}")
        val listed = doc.select(".serversList li[data-link], .mob-servers li[data-link], .servers__list li[data-link]").map { li ->
            Link(txt(li).ifEmpty { t("server") }, li.attr("data-qu").ifEmpty { li.closest("[data-quality]")?.attr("data-quality") ?: li.attr("data-quality") }, li.attr("data-link"))
        }
        val servers = (listed + otherQualities(origin, html, doc))
            .filter { it.url.isNotEmpty() && !DEAD.containsMatchIn(runCatching { URI(origin).resolve(it.url).host }.getOrDefault("")) } // gone hosts: not offered, nor unwrapped
            .map { async { unwrap(it, origin) } }.awaitAll().flatten()
            .sortedWith(compareBy({ rank(it.label) }, { -(it.quality.toIntOrNull() ?: 0) })) // each host's best quality first
        val dDoc = dl.await() ?: doc
        val downloads = doc.select(".donwload-servers-list li").map { li -> Link(txt(li.selectFirst(".ser-name")), txt(li.selectFirst(".server-info")), li.selectFirst("a.ser-link")?.attr("href") ?: "") } +
            dDoc.select("a.download__item[href]").map { a ->
                val href = a.attr("href")
                val url = Regex("/l/([A-Za-z0-9+/=_-]+)").find(href)?.groupValues?.get(1)?.let(::b64)?.ifEmpty { null } ?: href
                Link(host(url).ifEmpty { txt(a.selectFirst("h4, span")) }, a.closest("[data-quality]")?.attr("data-quality")?.ifEmpty { null } ?: Regex("\\d+p", RegexOption.IGNORE_CASE).find(txt(a.selectFirst("p")))?.value ?: "", url)
            }
        Watch(servers, downloads.filter { it.url.startsWith("https://") })
    }
    // myseed's link only plays for the browser the watch page was made for (its user agent), and not for long: asked anew,
    // past the site's cache and as the player asks, each time it's played
    // (quality: one the page doesn't list is asked for as its menu asks, as the player too)
    suspend fun myseedNow(m: Movie, slug: String, quality: String = ""): String {
        val html = get("${base(m, slug)}/watch/?_=${System.currentTimeMillis()}", asPlayer = true)
        val doc = parse(html, m.origin)
        val direct = doc.selectFirst(".servers__list li[data-direct-arabseed=1]")
        val link = if (quality.isEmpty() || direct == null || direct.attr("data-qu") == quality) html
            else xhr(m.origin, "get__watch__server", mapOf("post_id" to direct.attr("data-post"), "quality" to quality, "server" to direct.attr("data-server"),
                "csrf_token" to (csrf(html) ?: "")), asPlayer = true).optString("server")
        val tok = Regex("vids\\.php\\?t=([A-Za-z0-9]+)").find(link)?.groupValues?.get(1) ?: throw IOException("no myseed link")
        return myseedUrl(tok, m.origin)
    }
    fun isLast(l: Link) = l.label == LAST
}
