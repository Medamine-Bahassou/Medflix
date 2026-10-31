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
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import org.json.JSONObject
import kotlin.math.atan2
import kotlin.math.roundToInt

private fun JSONObject.manga() = optString("kind") == "manga"
private fun mb(n: Long) = if (n >= 1L shl 30) "\u2066%.1f GB\u2069".format(n / 1073741824.0) else "\u2066%.0f MB\u2069".format(n / 1048576.0) // an LTR isolate: the number stays before MB in Arabic
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
    var stats by remember { mutableStateOf(false) } // the storage chart (its button in the bar)
    val picks = remember(show) { Picks() } // long-press a show or a download to pick several (app.js dlActs / its shows' acts)
    val byId = all.associateBy { it.optString("id") }
    Column {
        if (show.isEmpty()) {
            PageTitle(t("downloads"), nav, back = false) {
                // Pause all / Resume all: while anything is downloading, waiting or paused
                if (all.any { it.optString("state") in PENDING }) {
                    val paused = Store["prefs"].optBoolean("dlPaused") || all.none { it.optString("state") in RUNNING }
                    IconButton({ Downloads.hold(null, !paused) }) { Icon(if (paused) Ic.play else Ic.pause, t(if (paused) "resumeAll" else "pauseAll"), Modifier.size(22.dp)) }
                }
                // storage use: its own button, the chart a tap away (once anything has finished)
                if (all.any { it.optString("state") == "done" }) IconButton({ stats = true }) { Icon(Ic.pie, t("dlStats"), Modifier.size(22.dp)) }
                DlMenu(all, picks, { ask = it }, settings = true)
            }
        } else PageTitle(t("downloads"), nav) {
            val its = groups.find { it.key == show }?.value ?: emptyList()
            if (its.isNotEmpty()) DlMenu(its, picks, { ask = it }) { nav.go(if (its[0].manga()) Screen.MangaSeries(show.substringAfterLast('/')) else Screen.Title(show)) }
        }
        if (show.isEmpty()) {
            if (groups.isEmpty()) return@Column Empty(t("noDownloads"), t("noDownloadsHint"))
            val done = all.filter { it.optString("state") == "done" }
            val free = remember(done.size) { Downloads.free() } // a look at the disk: again only when a download finishes or goes, not on every progress tick
            Text(t("dlSpace", mb(done.sumOf(Downloads::size)), mb(free)), Modifier.padding(horizontal = 16.dp), color = Muted, fontSize = 13.sp)
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
                    val size = items.filter { it.optString("state") == "done" }.sumOf(Downloads::size)
                    Row(Modifier.fillMaxWidth().picked(picks.has(key)).clip(RoundedCornerShape(8.dp)).background(CardC)
                        .combinedClickable(onLongClick = { if (picks.on) picks.toggle(key) else picks.start(key) }) { if (picks.on) picks.toggle(key) else nav.go(Screen.Downloads(key)) }
                        .padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        AsyncImage(d0.optString("poster"), null, Modifier.width(56.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(d0.optString("title"), fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text("${if (d0.manga()) t("manga") else t("kindAnime")} · ${t(if (d0.manga()) "chCount" else "epCount", done)}" + (if (size > 0) " · ${mb(size)}" else "") + if (act.isNotEmpty()) " · ${t("dlActiveN", act.size)}" else "",
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
                val size = items.filter { it.optString("state") == "done" }.sumOf(Downloads::size)
                Text("${if (d0.manga()) t("manga") else t("kindAnime")} · ${t(if (d0.manga()) "chCount" else "epCount", items.size)}" + if (size > 0) " · ${mb(size)}" else "", color = Muted, fontSize = 12.sp)
            }
            if (act.isNotEmpty()) ShowToggle(show, Downloads.held(show) || act.none { it.optString("state") in RUNNING })
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
                    .combinedClickable(onLongClick = { if (picks.on) picks.toggle(id) else picks.start(id) }) { // a tap reads or plays it: its download once done, else from the site
                        if (picks.on) picks.toggle(id) else nav.go(if (d.manga()) Screen.MangaRead(d.optString("chapterId"), d.optString("title"), d.optString("ep")) else if (st == "done") Screen.Offline(d.optString("epPath")) else Screen.Play(d.optString("epPath")))
                    }
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
                    if (st == "done") IconButton({ nav.go(if (d.manga()) Screen.MangaRead(d.optString("chapterId"), d.optString("title"), d.optString("ep")) else Screen.Offline(d.optString("epPath"))) }) { Icon(Ic.play, t("play"), Modifier.size(20.dp), tint = Red) }
                    if (st == "error" || st == "cancelled") IconButton({ Downloads.retry(id) }) { Icon(Ic.refresh, t("retry"), Modifier.size(20.dp)) }
                    if (st == "paused") IconButton({ Downloads.resume(id) }) { Icon(Ic.download, t("showResume"), Modifier.size(20.dp), tint = Red) }
                    if (st == "active" || st == "queued") IconButton({ Downloads.pause(id) }) { Icon(Ic.pause, t("showPause"), Modifier.size(20.dp)) }
                    if (st in PENDING) IconButton({ Downloads.cancel(id) }) { Icon(Ic.x, t("cancel"), Modifier.size(20.dp)) }
                    else IconButton({ ask = t("confirmDel", "${d.optString("title")} · ${t(if (d.manga()) "chapter" else "episode")} ${d.optString("ep")}") to { Downloads.delete(id) } }) { Icon(Ic.trash, t("del"), Modifier.size(20.dp)) }
                }
            }
        }
    }
    if (stats) StatsSheet(groups.map { it.key to it.value }, nav) { stats = false }
    ask?.let { (what, go) ->
        AlertDialog({ ask = null }, { TextButton({ go(); ask = null }) { Text(t("del"), color = Red) } }, dismissButton = { TextButton({ ask = null }) { Text(t("cancel"), color = Color.White) } },
            title = { Text(what, fontSize = 17.sp) }, text = { Text(t("confirmDelHint")) }, containerColor = CardC)
    }
}

private fun JSONObject.seen() = if (manga()) Store["mangaSeen"].optInt(optString("chapterId")) == 2 else Store["seen"].has(optString("epPath"))

/**
 * the bar's ⋮: what can be done to these downloads at once (all of them, or one show's), each only when it applies.
 * settings: Wi-Fi only at hand here too; title: the show's page (a show's downloads)
 */
@Composable
private fun DlMenu(items: List<JSONObject>, picks: Picks, ask: (Pair<String, () -> Unit>) -> Unit, settings: Boolean = false, title: (() -> Unit)? = null) {
    var open by remember { mutableStateOf(false) }
    val failed = items.filter { it.optString("state") == "error" || it.optString("state") == "cancelled" }
    val watched = items.filter { it.optString("state") == "done" && it.seen() }
    val running = items.filter { it.optString("state") in RUNNING }
    val ids = { l: List<JSONObject> -> l.map { it.optString("id") } } // the records change as each goes: their ids first
    Box {
        IconButton({ open = true }) { Icon(Ic.dots, t("more"), Modifier.size(22.dp)) }
        DropdownMenu(open, { open = false }, containerColor = CardC) {
            @Composable fun row(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, go: () -> Unit) =
                DropdownMenuItem({ Text(label) }, { open = false; go() }, leadingIcon = { Icon(icon, null, Modifier.size(18.dp)) })
            @Composable fun check(label: String, on: Boolean, set: (Boolean) -> Unit) = // a switch: the menu stays open, so the tick is seen
                DropdownMenuItem({ Text(label) }, { set(!on) }, trailingIcon = { Checkbox(on, null, colors = CheckboxDefaults.colors(checkedColor = Red)) })
            if (title != null) row(t("dlGoTitle"), Ic.info, title)
            row(t("select"), Ic.check) { picks.set = emptySet() }
            if (running.isNotEmpty()) row(t("dlCancelAll"), Ic.x) { ask(t("dlCancelAsk", running.size) to { ids(running).forEach(Downloads::cancel) }) }
            if (failed.isNotEmpty()) {
                row("${t("dlRetryFailed")} (\u2066${failed.size}\u2069)", Ic.refresh) { ids(failed).forEach(Downloads::retry) }
                row(t("dlClearFailed"), Ic.minus) { ids(failed).forEach(Downloads::delete) } // records only: a failed one left no file
            }
            if (watched.isNotEmpty()) row("${t("dlDelWatched")} (\u2066${watched.size}\u2069)", Ic.eye) { ask(t("confirmDelN", watched.size) to { ids(watched).forEach(Downloads::delete) }) }
            row(t("deleteAll"), Ic.trash) { ask(t("confirmDelN", items.size) to { ids(items).forEach(Downloads::delete) }) }
            if (settings) {
                HorizontalDivider(color = Color(0x22FFFFFF))
                check(t("dlWifi"), Store["prefs"].optBoolean("dlWifi"), Downloads::wifiOnly)
                if (Store.granted()) row(t("dlOpenFolder"), Ic.folder, ::openFolder) // the MEDFLIX folder; the app's own one no file manager can open
            }
        }
    }
}

// the chart's slices, in this order always (largest show first): the dark-surface categorical palette, checked for
// colour-blind separation and contrast against the sheet's #181818. A 7th show on would be a hue too many: "other", grey
private val SLICES = listOf(0xFF3987E5, 0xFFD95926, 0xFF199E70, 0xFFC98500, 0xFFD55181, 0xFF008300).map { Color(it) }
private val OTHER = Color(0xFF6B6B68)
private class Slice(val show: String?, val title: String, val poster: String, val bytes: Long, val count: String, val color: Color)

/**
 * storage use, per show: a donut of the finished downloads' room on disk, its list below with the posters, sizes and
 * shares (the chart alone never carries a figure). Tap a slice or a row to pick it (its figures in the middle); a row
 * picked already opens that show's downloads
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatsSheet(groups: List<Pair<String, List<JSONObject>>>, nav: Nav, done: () -> Unit) {
    val shows = groups.map { (k, l) -> Triple(k, l, l.filter { it.optString("state") == "done" }) }.filter { it.third.isNotEmpty() }
        .map { (k, l, d) -> k to Triple(l[0], d.size, d.sumOf(Downloads::size)) }.sortedByDescending { it.second.third }
    val slices = shows.take(SLICES.size).mapIndexed { i, (k, v) ->
        Slice(k, v.first.optString("title"), v.first.optString("poster"), v.third, t(if (v.first.manga()) "chCount" else "epCount", v.second), SLICES[i])
    } + shows.drop(SLICES.size).let { rest -> if (rest.isEmpty()) emptyList() else listOf(Slice(null, t("dlOthers", rest.size), "", rest.sumOf { it.second.third }, "", OTHER)) }
    val total = slices.sumOf { it.bytes }.coerceAtLeast(1)
    val pct = { n: Long -> (n * 100.0 / total).let { if (it < 1) "\u2066<1%\u2069" else "\u2066${it.roundToInt()}%\u2069" } }
    var pick by remember { mutableStateOf<Int?>(null) }
    val grow = remember { androidx.compose.animation.core.Animatable(0f) } // the ring draws itself round on opening
    LaunchedEffect(Unit) { grow.animateTo(1f, androidx.compose.animation.core.tween(700)) }
    val free = remember { Downloads.free() }
    ModalBottomSheet(done, containerColor = CardC) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(t("dlStats"), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(t("dlSpace", mb(total), mb(free)), color = Muted, fontSize = 13.sp)
            Box(Modifier.align(Alignment.CenterHorizontally).padding(vertical = 20.dp).size(220.dp), Alignment.Center) {
                Canvas(Modifier.fillMaxSize().pointerInput(slices) {
                    detectTapGestures { o -> // which slice: the angle from the top, clockwise; a tap off the ring lets go
                        val c = Offset(size.width / 2f, size.height / 2f)
                        val r = (o - c).getDistance()
                        val ring = size.width / 2f
                        if (r < ring - 44.dp.toPx() || r > ring) { pick = null; return@detectTapGestures }
                        val a = ((Math.toDegrees(atan2((o.y - c.y).toDouble(), (o.x - c.x).toDouble())) + 90 + 360) % 360) / 360 * total
                        var acc = 0L
                        pick = slices.indexOfFirst { acc += it.bytes; a < acc }.takeIf { it >= 0 }
                    }
                }) {
                    val w = 36.dp.toPx()
                    val gap = if (slices.size > 1) 1.2f else 0f // a sliver of the sheet between slices (degrees): neighbours never touch
                    var start = -90f
                    slices.forEachIndexed { i, s ->
                        val sweep = s.bytes * 360f / total * grow.value
                        val on = pick == null || pick == i
                        val stroke = if (pick == i) w + 8.dp.toPx() else w // the picked one stands out, the rest fade
                        val inset = (44.dp.toPx() - stroke) / 2 + stroke / 2
                        drawArc(s.color.copy(alpha = if (on) 1f else .35f), start + gap / 2, (sweep - gap).coerceAtLeast(.5f), false,
                            Offset(inset, inset), Size(size.width - inset * 2, size.height - inset * 2), style = Stroke(stroke))
                        start += sweep
                    }
                }
                val s = pick?.let(slices::getOrNull)
                Column(Modifier.width(130.dp), horizontalAlignment = Alignment.CenterHorizontally) { // the middle: the picked show, else the total
                    Text(s?.title ?: t("downloads"), maxLines = 2, overflow = TextOverflow.Ellipsis, fontSize = 13.sp, color = Muted, textAlign = TextAlign.Center)
                    Text(mb(s?.bytes ?: total), fontWeight = FontWeight.Bold, fontSize = 22.sp)
                    if (s != null) Text(pct(s.bytes), color = Muted, fontSize = 13.sp)
                }
            }
            slices.forEachIndexed { i, s ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (pick == i) Color(0x14FFFFFF) else Color.Transparent)
                    .clickable { if (pick == i && s.show != null) { done(); nav.go(Screen.Downloads(s.show)) } else pick = i }
                    .padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(s.color))
                    Box(Modifier.padding(horizontal = 10.dp).width(36.dp).aspectRatio(2 / 3f).clip(RoundedCornerShape(4.dp)).background(Color(0xFF242424)), Alignment.Center) {
                        if (s.poster.isNotEmpty()) AsyncImage(s.poster, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Icon(Ic.dots, null, Modifier.size(16.dp), tint = Muted)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(s.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
                        if (s.count.isNotEmpty()) Text(s.count, color = Muted, fontSize = 12.sp)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(mb(s.bytes), fontSize = 13.sp)
                        Text(pct(s.bytes), color = Muted, fontSize = 12.sp)
                    }
                }
            }
        }
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
    val checkpoint = remember(epPath) { PlaybackSession.position(epPath) }
    var video by remember(epPath) { mutableStateOf<VideoView?>(null) }
    var detach by remember(epPath) { mutableStateOf<(() -> Unit)?>(null) }
    var unbind by remember(epPath) { mutableStateOf<(() -> Unit)?>(null) }
    fun save(v: VideoView) {
        if (v.duration > 0 && !PlaybackSession.suspended) PlaybackSession.position(epPath,
            org.json.JSONObject().put("time", v.currentPosition / 1000.0).put("duration", v.duration / 1000.0).put("paused", !v.isPlaying))
    }
    LaunchedEffect(video) {
        while (true) { video?.let { save(it) }; kotlinx.coroutines.delay(500) }
    }
    PlayerChrome(d.optString("title"), "${t("episode")} ${d.optString("ep")} · ${t("offline")}", nav, null, -1, false, {}, null, null, { nav.go(Screen.Title(d.optString("show"))) }, {}, { castTo("${d.optString("title")} · ${t("episode")} ${d.optString("ep")}", d.optString("file"), null) }) {
        AndroidView({ ctx ->
            VideoView(ctx).apply {
                keepScreenOn = true
                setMediaController(MediaController(ctx).also { it.setAnchorView(this) })
                setVideoPath(d.optString("file"))
                setOnPreparedListener {
                    var playing = !checkpoint.optBoolean("paused", false)
                    seekTo((checkpoint.optDouble("time", 0.0) * 1000).toInt())
                    video = this
                    unbind?.invoke()
                    unbind = PlaybackSession.controls.bind(checkpoint.optBoolean("paused", false)) { play ->
                        if (!PlaybackSession.suspended) {
                            if (play) start() else pause()
                            save(this)
                        }
                    }
                    detach?.invoke()
                    var observed = false
                    var wasStopped = false
                    detach = PlaybackSession.observe { stopped ->
                        keepScreenOn = !stopped
                        if (stopped) {
                            // Save before pausing; dismissal must not overwrite the desired playback state.
                            if (observed && !wasStopped) playing = isPlaying
                            PlaybackSession.position(epPath, org.json.JSONObject().put("time", currentPosition / 1000.0)
                                .put("duration", duration / 1000.0).put("paused", !playing))
                            pause()
                        } else if ((!observed || wasStopped) && playing) start()
                        observed = true
                        wasStopped = stopped
                    }
                }
            }
        }, Modifier.fillMaxWidth().wrapContentHeight(), onRelease = { v ->
            val ended = v.duration > 0 && v.currentPosition >= v.duration * 0.9 // the end credits skipped still counts as watched
            save(v)
            detach?.invoke(); unbind?.invoke(); video = null
            v.stopPlayback()
            if (ended && !pipStopped.value && Store["prefs"].optBoolean("dlAutoDel")) { Downloads.delete(epPath); toast(t("dlAutoDeleted")) }
        })
    }
}
