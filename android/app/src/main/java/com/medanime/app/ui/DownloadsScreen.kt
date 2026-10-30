package com.medanime.app.ui

import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import coil3.compose.AsyncImage
import com.medanime.app.Downloads
import org.json.JSONObject

private fun JSONObject.manga() = optString("kind") == "manga"
private fun mb(n: Long) = "\u2066%.0f MB\u2069".format(n / 1048576.0) // an LTR isolate: the number stays before MB in Arabic
private val PENDING = setOf("active", "queued", "paused")
private val RUNNING = setOf("active", "queued")

// a download's line under its number: progress, or where it stands (app.js dlStatus)
private fun status(d: JSONObject): String {
    val r = d.optLong("received"); val tot = d.optLong("total"); val pct = if (tot > 0) (r * 100 / tot).toInt() else 0
    return when (d.optString("state")) {
        "active" -> if (tot <= 0) t("dlPreparing") else if (d.manga()) "${t("pagesOf", r, tot)} · $pct%" else "\u2066${mb(r)} / ${mb(tot)} · $pct%\u2069"
        "done" -> t("offline") + if (tot > 0) " · " + (if (d.manga()) t("pagesN", tot) else mb(tot)) else ""
        "queued" -> t("dlQueued"); "paused" -> t("dlPaused"); "error" -> t("dlFailed"); "cancelled" -> t("dlCancelled")
        else -> ""
    }
}

/** downloads: one card per anime / manga; show: that one's episodes or chapters (app.js drawDownloads) */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun DownloadsScreen(show: String, nav: Nav) {
    Downloads.tick.intValue; Store.version.intValue
    val all = Downloads.all().let { o -> o.keys().asSequence().mapNotNull { o.optJSONObject(it) }.toList() }
    val groups = all.groupBy { it.optString("show") }.entries.sortedByDescending { e -> e.value.maxOf { it.optLong("at") } }
    var ask by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) } // "are you sure?" before deleting
    val picks = remember(show) { Picks() } // long-press a show or a download to pick several (app.js dlActs / its shows' acts)
    val byId = all.associateBy { it.optString("id") }
    Column {
        if (show.isEmpty()) {
            TopBar(nav)
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t("downloads"), Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 22.sp)
                // Pause all / Resume all: while anything is downloading, waiting or paused
                if (all.any { it.optString("state") in PENDING }) {
                    val paused = Store["prefs"].optBoolean("dlPaused") || all.none { it.optString("state") in RUNNING }
                    OutlinedButton({ Downloads.hold(null, !paused) }) {
                        Icon(if (paused) Ic.play else Ic.pause, null, Modifier.size(16.dp), tint = Color.White); Spacer(Modifier.width(6.dp))
                        Text(t(if (paused) "resumeAll" else "pauseAll"), color = Color.White)
                    }
                }
            }
        } else PageTitle(t("downloads"), nav)
        if (show.isEmpty()) {
            if (groups.isEmpty()) return@Column Empty(t("noDownloads"), t("noDownloadsHint"))
            val of = { shows: List<String> -> groups.filter { it.key in shows } }
            SelectBar(picks, { groups.map { it.key } }, { shows -> of(shows).let { gs -> listOfNotNull(
                if (gs.any { g -> g.value.any { it.optString("state") in RUNNING } }) "pause" to t("showPause") else null,
                if (gs.any { g -> g.value.any { it.optString("state") == "paused" } }) "resume" to t("showResume") else null,
                "delete" to t("deleteAll")) } }) { v, shows ->
                if (v == "delete") { val items = of(shows).flatMap { it.value }; ask = t("confirmDelN", items.size) to { items.forEach { Downloads.delete(it.optString("id")) } } }
                else shows.forEach { Downloads.hold(it, v == "pause") }
            }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(groups, { it.key }) { (key, items) ->
                    Downloads.tick.intValue; Store.version.intValue
                    val d0 = items.first()
                    val done = items.count { it.optString("state") == "done" }
                    val act = items.filter { it.optString("state") in PENDING }
                    Row(Modifier.fillMaxWidth().picked(picks.has(key)).clip(RoundedCornerShape(8.dp)).background(CardC)
                        .combinedClickable(onLongClick = { if (picks.on) picks.toggle(key) else picks.start(key) }) { if (picks.on) picks.toggle(key) else nav.go(Screen.Downloads(key)) }
                        .padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        AsyncImage(d0.optString("poster"), null, Modifier.width(56.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(d0.optString("title"), fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text("${if (d0.manga()) t("manga") else t("kindAnime")} · ${t(if (d0.manga()) "chCount" else "epCount", done)}" + if (act.isNotEmpty()) " · ${t("dlActiveN", act.size)}" else "",
                                color = Muted, fontSize = 12.sp)
                            if (act.isNotEmpty()) {
                                val r = act.sumOf { it.optLong("received") }; val tot = act.sumOf { it.optLong("total") }
                                LinearProgressIndicator({ if (tot > 0) r.toFloat() / tot else 0f }, Modifier.fillMaxWidth().padding(top = 6.dp), color = Red, trackColor = Color(0x22FFFFFF))
                            }
                        }
                        if (act.isNotEmpty()) ShowToggle(key, Downloads.held(key) || act.none { it.optString("state") in RUNNING })
                        Icon(Ic.next, null, Modifier.size(16.dp), tint = Muted)
                    }
                }
            }
            return@Column
        }
        val items = groups.find { it.key == show }?.value?.sortedWith(compareBy({ it.optString("ep").toDoubleOrNull() ?: 0.0 }, { it.optLong("at") })) ?: emptyList()
        if (items.isEmpty()) return@Column Empty(t("noDownloads"), t("noDownloadsHint"))
        val d0 = items.first()
        val act = items.filter { it.optString("state") in PENDING }
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(d0.optString("poster"), null, Modifier.width(64.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp).clickable { nav.go(if (d0.manga()) Screen.MangaSeries(show.substringAfterLast('/')) else Screen.Title(show)) }) {
                Text(d0.optString("title"), fontWeight = FontWeight.Bold, fontSize = 17.sp)
                val size = items.filter { it.optString("state") == "done" && !it.manga() }.sumOf { it.optLong("total") }
                Text("${if (d0.manga()) t("manga") else t("kindAnime")} · ${t(if (d0.manga()) "chCount" else "epCount", items.size)}" + if (size > 0) " · ${mb(size)}" else "", color = Muted, fontSize = 12.sp)
            }
            if (act.isNotEmpty()) ShowToggle(show, Downloads.held(show) || act.none { it.optString("state") in RUNNING })
            IconButton({ ask = t("confirmDelAll", items.size) to { items.forEach { Downloads.delete(it.optString("id")) } } }) { Icon(Ic.trash, t("deleteAll"), Modifier.size(20.dp)) }
        }
        SelectBar(picks, { items.map { it.optString("id") } }, { ids -> ids.mapNotNull(byId::get).let { ds -> listOfNotNull(
            "seen" to t(if (d0.manga()) "markRead" else "markWatched"), "unseen" to t(if (d0.manga()) "markUnread" else "markUnwatched"),
            if (ds.any { it.optString("state") == "error" || it.optString("state") == "cancelled" }) "retry" to t("retry") else null,
            if (ds.any { it.optString("state") in PENDING }) "cancel" to t("cancel") else null,
            "delete" to t("delDownloads")) } }) { v, ids ->
            val ds = ids.mapNotNull(byId::get)
            for (d in ds) when (v) { // seen: the episode watched / the chapter read (app.js dlAct)
                "seen" -> if (d.manga()) Store["mangaSeen"].put(d.optString("chapterId"), 2) else Store["seen"].put(d.optString("epPath"), 1)
                "unseen" -> if (d.manga()) Store["mangaSeen"].remove(d.optString("chapterId")) else Store["seen"].remove(d.optString("epPath"))
                "retry" -> if (d.optString("state") == "error" || d.optString("state") == "cancelled") Downloads.retry(d.optString("id"))
                "cancel" -> if (d.optString("state") in PENDING) Downloads.cancel(d.optString("id"))
            }
            if (v == "seen" || v == "unseen") { Store.persist("seen"); Store.persist("mangaSeen") }
            if (v == "delete") ask = t("confirmDelN", ds.size) to { ds.forEach { Downloads.delete(it.optString("id")) } }
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, { it.optString("id") }) { d ->
                Downloads.tick.intValue; Store.version.intValue // d is mutated in place: read state here so strong skipping redraws the row
                val st = d.optString("state")
                val id = d.optString("id")
                Row(Modifier.fillMaxWidth().picked(picks.has(id)).clip(RoundedCornerShape(6.dp)).background(CardC)
                    .combinedClickable(onLongClick = { if (picks.on) picks.toggle(id) else picks.start(id) }) { if (picks.on) picks.toggle(id) }
                    .padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("${t(if (d.manga()) "chapter" else "episode")} ${d.optString("ep")}" + d.optString("quality").let { if (it.isEmpty()) "" else "  $it" }, fontWeight = FontWeight.SemiBold)
                            if (d.manga() && Store["mangaSeen"].optInt(d.optString("chapterId")) == 2) ReadBadge()
                        }
                        if (st == "active") LinearProgressIndicator({ d.optLong("total").let { if (it > 0) d.optLong("received").toFloat() / it else 0f } },
                            Modifier.fillMaxWidth().padding(vertical = 4.dp), color = Red, trackColor = Color(0x22FFFFFF))
                        Text(status(d), color = Muted, fontSize = 12.sp)
                    }
                    if (st == "done") IconButton({ nav.go(if (d.manga()) Screen.MangaRead(d.optString("chapterId")) else Screen.Offline(d.optString("epPath"))) }) { Icon(Ic.play, t("play"), Modifier.size(20.dp), tint = Red) }
                    if (st == "error" || st == "cancelled") IconButton({ Downloads.retry(id) }) { Icon(Ic.refresh, t("retry"), Modifier.size(20.dp)) }
                    if (st == "paused") IconButton({ Downloads.resume(id) }) { Icon(Ic.download, t("showResume"), Modifier.size(20.dp), tint = Red) }
                    if (st == "active" || st == "queued") IconButton({ Downloads.pause(id) }) { Icon(Ic.pause, t("showPause"), Modifier.size(20.dp)) }
                    if (st in PENDING) IconButton({ Downloads.cancel(id) }) { Icon(Ic.x, t("cancel"), Modifier.size(20.dp)) }
                    else IconButton({ ask = t("confirmDel", "${d.optString("title")} · ${t(if (d.manga()) "chapter" else "episode")} ${d.optString("ep")}") to { Downloads.delete(id) } }) { Icon(Ic.trash, t("del"), Modifier.size(20.dp)) }
                }
            }
        }
    }
    ask?.let { (what, go) ->
        AlertDialog({ ask = null }, { TextButton({ go(); ask = null }) { Text(t("del"), color = Red) } }, dismissButton = { TextButton({ ask = null }) { Text(t("cancel"), color = Color.White) } },
            title = { Text(what, fontSize = 17.sp) }, text = { Text(t("confirmDelHint")) }, containerColor = CardC)
    }
}

/** a show's Pause / Resume, while it has anything left to download */
@Composable
private fun ShowToggle(show: String, paused: Boolean) {
    Downloads.tick.intValue; Store.version.intValue
    IconButton({ Downloads.hold(show, !paused) }) { Icon(if (paused) Ic.download else Ic.pause, t(if (paused) "showResume" else "showPause"), Modifier.size(20.dp), tint = if (paused) Red else Color.White) }
}

/** a downloaded episode, from its file: Android's own video view (app.js offline) */
@Composable
fun OfflineScreen(epPath: String, nav: Nav) {
    val d = Downloads.of(epPath)
    if (d == null || d.optString("state") != "done") return LaunchedEffect(epPath) { nav.replace(Screen.Play(epPath)) }
    LaunchedEffect(epPath) { Store.watched(d.optString("show"), epPath, d.optString("ep"), d.optString("title"), d.optString("poster")) }
    PlayerChrome(d.optString("title"), "${t("episode")} ${d.optString("ep")} · ${t("offline")}", nav, null, -1, false, {}, null, null, { nav.go(Screen.Title(d.optString("show"))) }, {}, { castTo("${d.optString("title")} · ${t("episode")} ${d.optString("ep")}", d.optString("file"), null) }) {
        AndroidView({ ctx ->
            VideoView(ctx).apply {
                keepScreenOn = true
                setMediaController(MediaController(ctx).also { it.setAnchorView(this) })
                setVideoPath(d.optString("file"))
                setOnPreparedListener { start() }
            }
        }, Modifier.fillMaxWidth().wrapContentHeight(), onRelease = { it.stopPlayback() })
    }
}
