package com.medanime.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.medanime.app.Downloads
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onEach

private data class NovelHome(val hot: NovelList?, val popular: List<Card>?, val fresh: List<Card>?, val updates: List<Card>?, val others: List<Card>?)

/** novels: the site's rows, a slider of its trending ones; each row on its own: one that fails just isn't there */
@Composable
fun NovelHomeScreen(nav: Nav) {
    val (l, refresh) = loadedOnce("novels", quiet = true) { f ->
        coroutineScope {
            suspend fun <T> tryIt(go: suspend () -> T) = try { go() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { null }
            val hot = async { tryIt { Novels.list(mapOf("sort" to "trending"), f) } }
            val popular = async { tryIt { Novels.list(mapOf("sort" to "views"), f).items } }
            val fresh = async { tryIt { Novels.list(mapOf("sort" to "latest"), f).items } }
            val updates = async { tryIt { Novels.updates(f) } }
            val others = async { tryIt { Novels.others(emptyMap(), 1, f, wait = 4000).items } }
            // what the rows above already show isn't shown again under them
            val seen = HashSet<String>()
            Novels.merge(listOf(hot.await()?.items, popular.await(), fresh.await()), seen)
            NovelHome(hot.await(), popular.await(), fresh.await(), updates.await(), others.await()?.let { Novels.merge(listOf(it), seen) }).also {
                if (it.hot == null && it.popular == null && it.fresh == null && it.updates == null && it.others.isNullOrEmpty()) throw java.io.IOException(t("unreachable"))
            }
        }
    }
    SectionPage(l, refresh, nav, { it.hot?.slides.orEmpty() }) { d ->
        item { Chips(listOf(t("browseAll") to Screen.NovelBrowse()) + Novels.GENRES.map { Novels.genre(it.first) to Screen.NovelBrowse(mapOf("genre" to it.first)) }, nav) }
        item { CardRowView(t("continueReading"), continued(setOf("novel")), nav) }
        item { CardRowView(t("mHot"), d.hot?.items, nav, Screen.NovelBrowse(mapOf("sort" to "trending"))) }
        item { CardRowView(t("mLatest"), d.updates, nav) }
        item { CardRowView(t("mPopular"), d.popular, nav, Screen.NovelBrowse(mapOf("sort" to "views"))) }
        item { CardRowView(t("mNew"), d.fresh, nav, Screen.NovelBrowse(mapOf("sort" to "latest"))) }
        item { CardRowView(t("nvOther"), d.others, nav, Screen.NovelBrowse()) }
    }
}

/** the catalogue with filters: search, genre, sort. novltime's pages come by cursor, each page handing the next one's; the other sites' join them, with no wait for them */
@Composable
fun NovelBrowseScreen(query: Map<String, String>, nav: Nav) {
    val cursors = remember(query) { java.util.concurrent.ConcurrentHashMap<Int, String>() }
    val go = { edit: MutableMap<String, String>.() -> Unit -> nav.replace(Screen.NovelBrowse(query.toMutableMap().apply(edit).filterValues { it.isNotEmpty() })) }
    val seen = remember(query) { java.util.concurrent.ConcurrentHashMap.newKeySet<String>() }
    PagedGrid(query, { f ->
        combine(Novels.browseFlow(query, f).onEach { it.cursor?.let { c -> cursors[2] = c } }.catch { emit(NovelList(emptyList(), 0, null)) }, flow { emit(Listing(emptyList(), 0)); emit(Novels.others(query, 1, f)) }) { l, o ->
            seen.clear()
            Listing(Novels.merge(listOf(l.items, o.items), seen), maxOf(l.pages, o.pages))
        }
    }, { p ->
        val r = cursors[p]?.let { Novels.browse(query, it) }
        r?.cursor?.let { cursors[p + 1] = it }
        val o = Novels.others(query, p)
        Listing(Novels.merge(listOf(r?.items, o.items), seen), maxOf(r?.pages ?: 0, o.pages))
    }, nav) {
        PageTitle(t("novels"), nav)
        var q by rememberSaveable(query) { mutableStateOf(query["search"] ?: "") }
        TextField(q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), placeholder = { Text(t("nvSearchPh")) }, singleLine = true,
            leadingIcon = { Icon(Ic.search, null, Modifier.size(20.dp)) }, trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Ic.x, t("clear"), Modifier.size(18.dp)) } }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { go { put("search", q.trim()) } }), shape = RoundedCornerShape(6.dp),
            colors = TextFieldDefaults.colors(focusedContainerColor = CardC, unfocusedContainerColor = CardC, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Red))
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val active = listOf("genre", "sort").count { query[it] != null }
            if (active > 0) FilterChip(true, { nav.replace(Screen.NovelBrowse()) }, { Text("${t("reset")} · $active") }, leadingIcon = { Icon(Ic.x, null, Modifier.size(14.dp)) })
            Pick(t("nvGenre"), query["genre"], listOf("" to t("all")) + Novels.GENRES.map { it.first to Novels.genre(it.first) }) { v -> go { put("genre", v) } }
            Pick(t("f_sort"), query["sort"], Novels.SORT.map { it.first to t(it.second) }) { v -> go { put("sort", v) } }
        }
    }
}

/** a novel: its story, then every chapter, newest first, with its name */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NovelTitleScreen(id: String, nav: Nav) {
    val (l, refresh) = loaded(id, quiet = true) { f -> Novels.fullFlow(id, f) }
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(l.busy && l.data != null, refresh) {
        Body(l, refresh) { full ->
            val s = full.n
            val path = "/novel/$id"
            Store.version.intValue
            Downloads.tick.intValue
            val r = Novels.place(id)
            val seen = Store["novelSeen"]
            val byId = remember(full) { full.chs.associateBy { it.id } }
            val dlId = { ch: NovelCh -> Novels.dlId(id, ch.slug) }
            val read = { ch: NovelCh -> Screen.NovelRead(id, ch.slug, s.title, ch.n) }
            // a row per chapter, thousands of them: built when they change, not on every redraw
            val rows = remember(full, Store.version.intValue, Downloads.tick.intValue) {
                full.chs.map { Numbered(it.n, seen.has(it.id), r?.optString("ch") == it.slug, read(it), it.id, Downloads.done(dlId(it)), seen.optInt(it.id) == 2, name = it.title, lateName = { Novels.chapterName(id, it.slug) }) }
            }
            // where it was left, else from its first chapter (not from the list: it may not all be here yet)
            val start = Novels.resumeOf(id)?.takeIf { it.second.optString("ch").isNotEmpty() }?.let { (to, p) -> Screen.NovelRead(to, p.optString("ch"), s.title, p.optString("n")) to t("resumeCh", p.optString("n")) } ?: full.first?.let { read(it) to t("read") }
            DetailPage(s.cover, s.poster, s.title, s.alt, Ic.novel,
                listOf(t(if (s.done) "nvDone" else "nvOngoing") to true) + s.genres.map { Novels.genre(it) to false }, s.story, {
                    Action("%,d".format(s.views), Ic.eye)
                    ListButton(path, s.title, s.poster, "novel")
                    NotifyButton(path, s.title, s.poster, full.chs.firstOrNull()?.id ?: "")
                }, listOfNotNull(s.author.takeIf { it.isNotEmpty() }?.let { t("nvAuthor") to it }, t("chapters") to "⁦${"%,d".format(s.count)}⁩", s.locked.takeIf { it > 0 }?.let { t("nvLockedRest") to "⁦${"%,d".format(it)}⁩" }), nav, t("chapters"),
                rows, t("jumpCh"),
                after = { item { CardRowView(t("nvSimilar"), full.similar, nav) } },
                acts = { ids -> listOfNotNull("read" to t("markRead"), "unread" to t("markUnread"),
                    if (ids.any { c -> byId[c]?.let { !Downloads.done(dlId(it)) } == true }) "dl" to t("downloadShort") else null,
                    if (ids.any { c -> byId[c]?.let { Downloads.done(dlId(it)) } == true }) "del" to t("delDownloads") else null) },
                run = { v, ids ->
                    when (v) {
                        "read" -> ids.forEach { seen.put(it, 2) }
                        "unread" -> ids.forEach { seen.remove(it) }
                        "dl" -> Downloads.novel(id, s.title, s.poster, ids.mapNotNull { byId[it] }.filter { !Downloads.done(dlId(it)) }.reversed()) // oldest first
                        "del" -> ids.forEach { c -> byId[c]?.let { Downloads.delete(dlId(it)) } }
                    }
                    Store.persist("novelSeen")
                }, unit = t("chapter"),
                menu = listOf(MenuItem(t("autoDlShort"), Ic.download, Alerts.autoDl(path)) { Alerts.toggleDl(path, s.title, s.poster, full.chs.firstOrNull()?.id ?: "") }),
                play = start?.let { (to, label) -> label to { nav.go(to) } }, fullPoster = s.cover)
        }
    }
}
