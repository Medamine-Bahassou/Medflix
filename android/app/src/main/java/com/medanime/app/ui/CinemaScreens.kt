package com.medanime.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Movies & series: the site's categories, a row each (cinema.js cinemaHome) */
@Composable
fun CinemaHomeScreen(nav: Nav) {
    val (l, refresh) = loadedOnce("cinema", quiet = true) { f -> Cinema.list("all", 1, f) }
    val rows = remember { mutableStateMapOf<String, List<Card>>() } // a row scrolled back to is drawn at once, not loaded (and parsed) again
    SectionPage(l, refresh, nav, { filmSlides(it.items.take(5)) }) { d ->
        item { Chips(Cinema.CATS.drop(1).map { Cinema.catName(it[0]) to Screen.CinemaBrowse(it[0]) }, nav) }
        item { CardRowView(t("continueWatching"), continued(setOf("cinema")), nav) }
        item { CardRowView(Cinema.catName("all"), d.items, nav, Screen.CinemaBrowse("all")) }
        items(Cinema.CATS.drop(1).map { it[0] }, { it }) { id -> // each row asks for its category as it scrolls into view
            val r = rows[id]
            if (r == null) {
                LaunchedEffect(id) { rows[id] = try { kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { Cinema.list(id, 1).items } } catch (e: CancellationException) { throw e } catch (e: Exception) { emptyList() } }
                Spacer(Modifier.height(250.dp)) // a card row's height while it loads: what's below doesn't jump when it fills
            } else CardRowView(Cinema.catName(id), r, nav, Screen.CinemaBrowse(id))
        }
    }
}

// share of words two titles have in common (scraper.js similar); ristoanime matches by it too (Witanime)
fun similar(a: String, b: String): Double {
    val x = Manga.norm(a).split(' ').toSet(); val y = Manga.norm(b).split(' ').toSet()
    return x.count { it in y }.toDouble() / (x + y).size
}

/** a film or a season, with its episodes (cinema.js cinemaTitle) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CinemaTitleScreen(slug: String, show: Boolean, nav: Nav) {
    if (slug.startsWith("episode/") && !show) return LaunchedEffect(slug) { nav.replace(Screen.CinemaPlay(slug)) } // an episode plays straight away
    val (l, refresh) = loadedOnce(slug, show, quiet = true) { f -> Cinema.movie(slug, f) }
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { m ->
            val path = "/cinema/$slug"
            // an episode's card: its season (or show), where it was listed as the show
            if (show) return@Body LaunchedEffect(slug) { nav.replace(Screen.CinemaTitle(m.up.ifEmpty { slug.removePrefix("episode/") })) }
            // an anime film after all (an old link, say): witanime's copy instead
            if (m.cat.any { Regex("انمي|انميات|أنمي").containsMatchIn(it) }) return@Body LaunchedEffect(slug) {
                val hit = runCatching { Witanime.search(m.title).first().items }.getOrNull()?.find { it.type == "movie" && similar(it.title, m.title) >= .75 }
                nav.replace(if (hit != null) Screen.Title(hit.path) else Screen.Search(m.title))
            }
            // a series page with seasons: the season last watched, else the first
            if (m.seasons.isNotEmpty() && (m.episodes.isEmpty() || m.seasons.none { it.path == path })) return@Body LaunchedEffect(slug) {
                val s = m.seasons.maxByOrNull { Store["history"].optJSONObject(it.path)?.optLong("at") ?: 0 }!!
                nav.replace(Screen.CinemaTitle(s.path.removePrefix("/cinema/")))
            }
            Store.version.intValue
            val h = Store["history"].optJSONObject(path)
            val eps = m.episodes
            val play = if (!slug.contains('/')) Screen.CinemaPlay(slug) to t("play") // a film
                else if (h != null) Screen.CinemaPlay(h.optString("slug")) to "${t("play")} · ${t("ep")} ${h.optString("ep")}"
                else eps.firstOrNull()?.let { Screen.CinemaPlay(it.slug) to t("play") }
            DetailPage(m.banner, m.poster, m.title, m.year, m.cat.map { it to true } + (m.tags + m.genres).map { it to false }, m.desc, {
                ListButton(path, m.title, m.poster, "cinema")
                if (slug.contains('/')) NotifyButton(path, m.title, m.poster, eps.lastOrNull()?.slug ?: "") // a series' season; new films have their own switch (settings)
            }, emptyList(), nav, if (eps.isNotEmpty()) t("episodes") else null,
                eps.map { Numbered(it.n, Store["seen"].has("/cinema/${it.slug}"), h?.optString("slug") == it.slug, Screen.CinemaPlay(it.slug), "/cinema/${it.slug}", thumb = m.banner.ifEmpty { m.poster }) }, // the site gives no episode names or stills
                acts = { listOf("seen" to t("markWatched"), "unseen" to t("markUnwatched")) },
                run = { v, ids -> ids.forEach { if (v == "seen") Store["seen"].put(it, 1) else Store["seen"].remove(it) }; Store.persist("seen") },
                before = {
                    if (m.seasons.size > 1) item {
                        Text(t("seasons"), Modifier.padding(start = 16.dp, top = 8.dp), fontSize = 18.sp)
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            m.seasons.forEach { s ->
                                FilterChip(s.path == path, { if (s.path != path) nav.replace(Screen.CinemaTitle(s.path.removePrefix("/cinema/"))) },
                                    { Text(Regex("(الموسم|الجزء)\\s+\\S+").find(s.title)?.value ?: s.title) }, shape = RoundedCornerShape(99.dp),
                                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Red, selectedLabelColor = Color.White))
                            }
                        }
                    }
                },
                after = { item { CardRowView(t("moreLike"), m.related, nav) } }, play = play?.let { (s, label) -> label to { nav.go(s) } },
                menu = listOfNotNull(if (m.trailer.isNotEmpty()) MenuItem(t("trailer"), Ic.play) { nav.go(Screen.Trailer(m.trailer, m.title)) } else null))
        }
    }
}

private class Playing(val m: Movie, val ep: String?, val eps: List<EpRef>)

/** a film or an episode playing: the site's servers, unwrapped to the hosts' players (cinema.js cinemaPlay) */
@Composable
fun CinemaPlayScreen(slug: String, nav: Nav) {
    val (l, retry) = loadedOnce("play:$slug") { _ ->
        val m = Cinema.movie(slug)
        val ep = if (slug.startsWith("episode/")) Regex("الحلقة\\s+(\\d+(\\.\\d+)?)").find(m.title)?.groupValues?.get(1) ?: "?" else null
        Playing(m, ep, m.episodes.ifEmpty { if (ep != null && m.up.isNotEmpty()) runCatching { Cinema.movie(m.up).episodes }.getOrDefault(emptyList()) else emptyList() })
    }
    Body(l, retry) { p ->
        val m = p.m
        val title = if (p.ep != null) m.title.replace(Regex("\\s*الحلقة\\s.*$"), "") else m.title
        LaunchedEffect(slug) { // Continue Watching: one entry per film, or per season for episodes (the one watched last)
            val show = "/cinema/" + (if (p.ep != null) m.up.ifEmpty { slug } else slug)
            Store["history"].put(show, JSONObject().put("show", show).put("slug", slug).put("title", title).put("poster", m.poster).put("at", System.currentTimeMillis()).apply { if (p.ep != null) put("ep", p.ep) })
            Store["seen"].put("/cinema/$slug", 1)
            Store.persist("history"); Store.persist("seen")
        }
        val i = p.eps.indexOfFirst { it.slug == slug }
        val prev = p.eps.getOrNull(i - 1).takeIf { i > 0 }
        val next = p.eps.getOrNull(i + 1).takeIf { i >= 0 }
        var servers by remember(slug) { mutableStateOf<List<Link>?>(null) }
        var downloads by remember(slug) { mutableStateOf<List<Link>?>(null) }
        var why by remember(slug) { mutableStateOf("") }
        var cur by remember(slug) { mutableIntStateOf(-1) }
        var url by remember(slug) { mutableStateOf<String?>(null) }
        val scope = rememberCoroutineScope()
        var job by remember { mutableStateOf<Job?>(null) }
        var attempt by remember { mutableIntStateOf(0) }
        fun pick(n: Int) {
            val s = servers?.getOrNull(n) ?: return
            cur = n; url = null
            PlaybackSession.server("/cinema/$slug", s.label, s.quality)
            Store["prefs"].put("edServer", s.label); Store.persist("prefs")
            job?.cancel()
            job = scope.launch { url = if (s.label == "myseed") runCatching { Cinema.myseedNow(m, slug, s.quality) }.getOrElse { if (it is CancellationException) throw it; s.url } else s.url }
        }
        LaunchedEffect(slug, attempt) {
            // the last server used, else the first one; uqload only when it's all there is
            val start = { l: List<Link> ->
                l.indexOfFirst { "${it.label}|${it.quality}" == PlaybackSession.server("/cinema/$slug") }.takeIf { it >= 0 }
                    ?: l.indexOfFirst { !Cinema.isLast(it) && it.label == Store["prefs"].optString("edServer") }.let { if (it >= 0) it else l.indexOfFirst { s -> !Cinema.isLast(s) }.coerceAtLeast(0) }
            }
            // the answer saved last time (kept 90 days) plays at once, while the sites are asked again behind it (cinema.js edWatchSoon)
            val key = "/cinema/$slug"
            val saved = Store["streams"].optJSONObject(key)?.optJSONObject("w")?.let { linksOf(it, "servers") to linksOf(it, "downloads") }
            if (saved != null && saved.first.isNotEmpty() && attempt == 0) { servers = saved.first; downloads = saved.second; pick(start(saved.first)) }
            try {
                val w = Cinema.watch(m, slug)
                if (w.servers.isNotEmpty()) {
                    Store["streams"].put(key, JSONObject().put("at", System.currentTimeMillis()).put("w", JSONObject().put("servers", linksJson(w.servers)).put("downloads", linksJson(w.downloads))))
                    Store.persist("streams")
                }
                downloads = w.downloads
                val playing = servers?.getOrNull(cur)
                if (servers?.map { it.url } != w.servers.map { it.url }) {
                    servers = w.servers
                    // what's playing carries on; nothing yet: start now
                    if (playing != null) cur = w.servers.indexOfFirst { it.url == playing.url }.let { if (it >= 0) it else cur.coerceAtMost(w.servers.size - 1) }
                    else if (w.servers.isNotEmpty()) pick(start(w.servers))
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                android.util.Log.w("medflix", "servers", e)
                if (servers.isNullOrEmpty()) { why = e.message ?: ""; servers = emptyList(); downloads = emptyList() }
            }
        }
        PlayerChrome(title, if (p.ep != null) "${t("ep")} ${p.ep}" else m.year, nav, servers?.map { it.label to it.quality }, cur, cur >= 0 && url == null, { pick(it) },
            prev?.let { { nav.replace(Screen.CinemaPlay(it.slug)) } }, next?.let { { nav.replace(Screen.CinemaPlay(it.slug)) } },
            { nav.go(Screen.CinemaTitle(if (p.ep != null) m.up.ifEmpty { slug } else slug)) }, { LinksMenu(downloads) }, { castTo(title, null, url) }) { // downloads: third-party hosts, in the browser
            val u = url
            when {
                u != null -> HostPlayer(u, "/cinema/$slug")
                servers?.isEmpty() == true -> Empty(t("noServers"), t("noServersEdHint") + if (why.isNotEmpty()) "\n" + noNames(why) else "") {
                    Button({ servers = null; attempt++ }, colors = ButtonDefaults.buttonColors(Red)) { Text(t("retry")) }
                }
                else -> CircularProgressIndicator(color = Red)
            }
        }
    }
}

// store.streams' saved answer: { servers: [{ label, quality, url, backup }], downloads: [...] }, the web app's format
private fun linksJson(l: List<Link>) = org.json.JSONArray(l.map { JSONObject().put("label", it.label).put("quality", it.quality).put("url", it.url).put("backup", it.backup) })
private fun linksOf(o: JSONObject, k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) }
    .map { Link(it.optString("label"), it.optString("quality"), it.optString("url"), it.optBoolean("backup")) }.filter { it.url.startsWith("https://") } } ?: emptyList()
