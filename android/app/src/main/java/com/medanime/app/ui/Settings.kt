package com.medanime.app.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.medanime.app.BuildConfig
import kotlinx.coroutines.launch

/** the MEDFLIX folder in the phone's own file manager (Android's Files app; some phones only open its folder picker there) */
fun openFolder() {
    val act = Net.activity
    Store.shared.mkdirs()
    val uri = android.provider.DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:MEDFLIX")
    val tries = listOf(
        Intent(Intent.ACTION_VIEW).setDataAndType(uri, android.provider.DocumentsContract.Document.MIME_TYPE_DIR),
        Intent(Intent.ACTION_VIEW).setDataAndType(uri, "resource/folder"),
        Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, uri),
    )
    if (tries.none { i -> runCatching { act.startActivity(i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }.isSuccess }) toast(Store.shared.absolutePath)
}

/** Android's "all files access" page for the app (the MEDFLIX folder) */
fun requestStorage() {
    val act = Net.activity
    if (Build.VERSION.SDK_INT >= 30) runCatching {
        act.startActivity(Intent(AndroidSettings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + act.packageName)))
    }.onFailure { act.startActivity(Intent(AndroidSettings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) } // some phones only have the list of all apps
}

/** one kind of thing kept only to be quicker: safe to clear, it comes back when needed */
private class CachePart(val title: String, val size: Long, val color: Color, val clear: suspend () -> Unit)
private suspend fun <T> io(what: () -> T) = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { what() }
// counts folders' files: off the main thread
private fun cacheParts() = listOf(
    CachePart(t("cachePages"), Pages.size(), SLICES[0]) { io { Pages.clear() } },
    CachePart(t("cacheImages"), coil3.SingletonImageLoader.get(Net.app).diskCache?.size ?: 0L, SLICES[1]) { io { coil3.SingletonImageLoader.get(Net.app).run { diskCache?.clear(); memoryCache?.clear() } } },
    // the hosts' pages and scripts, in the app's cache folder; the update APKs are next to them, on their own row
    CachePart(t("cachePlayer"), Net.app.cacheDir.walkTopDown().filter { it.isFile && !it.name.startsWith("update") }.sumOf { it.length() }, SLICES[2]) {
        // only the WebView can empty its own files, on the main thread; cookies stay, so Cloudflare's checks aren't asked again
        runCatching { android.webkit.WebView(Net.activity).run { clearCache(true); destroy() } }
        kotlinx.coroutines.delay(500) // it clears behind the call: the size read next would still count them
    },
    CachePart(t("cacheUpdates"), Updater.savedSize(), SLICES[3]) { io { Updater.clearSaved() } },
)

/** a group of settings: its heading, a line on it, then its rows on one rounded card (Material 3's settings lists) */
@Composable
private fun Group(title: String?, hint: String? = null, content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        if (title != null) Text(title, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp), color = Red, style = MaterialTheme.typography.titleSmall)
        if (hint != null) Text(hint, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp), color = Muted, style = MaterialTheme.typography.bodySmall)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(CardC), content = content)
    }

/** a settings row: Material's list item, its icon, title and a line under it; trailing: a switch, a value, buttons */
@Composable
private fun Item(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, sub: String? = null, tint: Color = Red, onClick: (() -> Unit)? = null,
                 trailing: (@Composable () -> Unit)? = null) =
    ListItem({ Text(title, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) },
        if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
        supportingContent = sub?.let { { Text(it) } }, leadingContent = { Icon(icon, null, Modifier.size(24.dp), tint = tint) }, trailingContent = trailing,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent, supportingColor = Muted, trailingIconColor = Muted))

/** a row opening a page of its own, its count or state beside the arrow */
@Composable
private fun Part(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, value: String, tint: Color = Red, open: () -> Unit) =
    Item(icon, title, tint = tint, onClick = open) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (value.isNotEmpty()) Text(value, color = Muted, style = MaterialTheme.typography.bodyMedium)
            Icon(Ic.next, null, Modifier.padding(start = 6.dp).size(16.dp), tint = Muted)
        }
    }

/** a settings switch: the whole row toggles it */
@Composable
private fun Toggle(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, hint: String?, on: Boolean, set: (Boolean) -> Unit) =
    Item(icon, title, hint, if (on) Red else Muted, { set(!on) }) { Switch(on, set, colors = SwitchDefaults.colors(checkedTrackColor = Red)) }

/**
 * settings (app.js settingsView): a short menu, the long parts (dock, MEDFLIX folder, notifications) on pages of their own
 * (part), so the page isn't one endless scroll. The bar stays put above it, as in Android's own settings
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(part: String, nav: Nav) {
    Store.version.intValue
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        PageTitle(t(when (part) { "dock" -> "dockTitle"; "storage" -> "storage"; "cache" -> "cacheTitle"; "notify" -> "notifyTitle"; else -> "settings" }), nav, back = part.isNotEmpty()) // the menu page is a section's own: ☰; its pages go back to it
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        val dock = Store.dock()
        val n = Store["notify"]
        when (part) {
            "" -> {
                Group(null) {
                    Part(Ic.home, t("dockTitle"), "\u2066${dock.size}/${Store.DOCK_MAX}\u2069") { nav.go(Screen.Settings("dock")) }
                    Part(Ic.folder, t("storage"), "", if (Store.granted()) Red else Muted) { nav.go(Screen.Settings("storage")) }
                    val cache by produceState<Long?>(null) { value = io { cacheParts().sumOf { it.size } } }
                    Part(Ic.pie, t("cacheTitle"), cache?.let(::mb).orEmpty()) { nav.go(Screen.Settings("cache")) }
                    Part(Ic.eyeSlash, t("hiddenTitle"), "\u2066${Store["hidden"].length()}\u2069") { nav.go(Screen.Hidden) }
                    Part(Ic.bell, t("notifyTitle"), "\u2066${n.keys().asSequence().count { it != "movies" }}\u2069") { nav.go(Screen.Settings("notify")) }
                }
                if (Build.VERSION.SDK_INT >= 26 && Net.activity.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) Group(t("playback")) {
                    Toggle(Ic.play, t("autoPip"), t("autoPipHint"), autoPipEnabled(Store["prefs"])) { on ->
                        Store["prefs"].put("autoPip", on); Store.persist("prefs")
                        (Net.activity as? NativeActivity)?.pip(playerUp)
                    }
                }
                Group(t("downloads")) {
                    Toggle(Ic.download, t("dlWifi"), t("dlWifiHint"), Store["prefs"].optBoolean("dlWifi"), com.medanime.app.Downloads::wifiOnly)
                    Toggle(Ic.trash, t("dlAutoDel"), t("dlAutoDelHint"), Store["prefs"].optBoolean("dlAutoDel")) { Store["prefs"].put("dlAutoDel", it); Store.persist("prefs") }
                    Toggle(Ic.external, t("extPlayer"), t("extPlayerHint"), Store["prefs"].optBoolean("extPlayer")) { Store["prefs"].put("extPlayer", it); Store.persist("prefs") }
                }
                Group(t("language")) { LangSwitch(Modifier.fillMaxWidth().padding(16.dp)) }
                Group(t("updateTitle")) {
                    var busy by remember { mutableStateOf(false) }
                    var found by remember { mutableStateOf<Updater.Release?>(null) }
                    Item(Ic.refresh, if (Store.lang == "ar") "البحث عن تحديث" else "Check for updates", "Build \u2066${BuildConfig.BUILD}\u2069", onClick = {
                        if (!busy) {
                            busy = true
                            scope.launch {
                                val u = runCatching { Updater.check() }.getOrNull()
                                busy = false
                                if (u == null) toast(if (Store.lang == "ar") "أنت على آخر إصدار" else "You're on the latest version") else found = u
                            }
                        }
                    }) { if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Red, strokeWidth = 2.dp) }
                    found?.let { u -> UpdateSheet(u) { found = null } }
                }
            }
            "dock" -> {
                Group("${t("inDock")}  \u2066${dock.size}/${Store.DOCK_MAX}\u2069", t("dockHint")) {
                    dock.forEachIndexed { i, id ->
                        val move = { j: Int -> Store.setDock(dock.toMutableList().apply { add(j, removeAt(i)) }) }
                        Item(NAV.getValue(id).second(), navLabel(id)) {
                            Row {
                                IconButton({ move(i - 1) }, enabled = i > 0) { Icon(Ic.caretUp, t("moveUp"), Modifier.size(18.dp)) }
                                IconButton({ move(i + 1) }, enabled = i < dock.size - 1) { Icon(Ic.caretDown, t("moveDown"), Modifier.size(18.dp)) }
                                IconButton({ if (dock.size <= 1) toast(t("dockMin")) else Store.setDock(dock - id) }) { Icon(Ic.minus, t("removeDock"), Modifier.size(18.dp)) }
                            }
                        }
                    }
                }
                val rest = NAV.keys.filter { it !in dock }
                if (rest.isNotEmpty()) Group(t("available")) {
                    rest.forEach { id ->
                        Item(NAV.getValue(id).second(), navLabel(id), tint = Muted, onClick = { if (dock.size >= Store.DOCK_MAX) toast(t("dockFull")) else Store.setDock(dock + id) }) {
                            Icon(Ic.plus, t("addDock"), Modifier.size(18.dp))
                        }
                    }
                }
            }
            "storage" -> {
                val on = Store.granted()
                Group(null, t("storageHint")) { // tap: the folder in the file manager; a path reads left to right in Arabic too
                    Item(Ic.folder, "\u2066${Store.shared.absolutePath}\u2069", if (on) t("storageOn") else t("storageOff"), if (on) Red else Muted, ::openFolder) {
                        if (!on) Button(::requestStorage, colors = ButtonDefaults.buttonColors(Red)) { Text(t("storageAllow")) }
                    }
                }
            }
            "cache" -> {
                // what's kept to open pages and posters instantly and offline: how much of each, and a way to free any of it
                var parts by remember { mutableStateOf<List<CachePart>?>(null) }
                LaunchedEffect(parts == null) { if (parts == null) parts = io { cacheParts() } }
                val clear = { what: List<CachePart> -> scope.launch { what.forEach { it.clear() }; parts = null; toast(t("cacheCleared")) } }
                var askAll by remember { mutableStateOf(false) }
                val total = parts?.sumOf { it.size } ?: 0L
                Group(t("cacheTitle"), t("cacheHint")) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(if (parts != null) mb(total) else "…", fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        Text(t("cacheTotal"), color = Muted, fontSize = 12.sp)
                        // the same colours as the rows' icons: the chart alone never carries a figure
                        if (total > 0) Row(Modifier.padding(top = 10.dp).fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Color(0xFF242424))) {
                            parts.orEmpty().filter { it.size > 0 }.forEach { Box(Modifier.weight(it.size.toFloat()).fillMaxHeight().background(it.color)) }
                        }
                    }
                    parts.orEmpty().forEach { p ->
                        Item(Ic.pie, p.title, "${mb(p.size)} · ⁦${if (total > 0) p.size * 100 / total else 0}%⁩", p.color) {
                            TextButton({ clear(listOf(p)) }, enabled = p.size > 0) { Text(t("clear"), color = if (p.size > 0) Red else Muted) }
                        }
                    }
                }
                if (total > 0) Button({ askAll = true }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), colors = ButtonDefaults.buttonColors(Red)) {
                    Icon(Ic.trash, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text(t("cacheAll"))
                }
                if (askAll) AlertDialog({ askAll = false }, { TextButton({ askAll = false; clear(parts.orEmpty()) }) { Text(t("clear"), color = Red) } }, dismissButton = { TextButton({ askAll = false }) { Text(t("cancel"), color = Color.White) } },
                    title = { Text(t("cacheAllAsk"), fontSize = 17.sp) }, text = { Text(t("cacheAllHint")) }, containerColor = CardC)
                // not cache (clearing would lose them for good): how much, and where to choose which go
                val downloads = com.medanime.app.Downloads.all().let { o -> o.keys().asSequence().mapNotNull { o.optJSONObject(it) }.filter { it.optString("state") == "done" }.sumOf(com.medanime.app.Downloads::size) }
                Group(null, t("cacheDlHint")) { Part(Ic.downloads, t("downloads"), mb(downloads)) { nav.go(Screen.Downloads()) } }
            }
            "notify" -> {
                Group(null, t("notifyHint")) { // the new films switch, then each followed title (✕ stops it)
                    Toggle(Ic.cinema, t("notifyMovies"), null, Alerts.moviesOn()) { Alerts.toggleMovies() }
                    n.keys().asSequence().filter { it != "movies" }.toList().forEach { p ->
                        Item(Ic.bellFill, n.getJSONObject(p).optString("title"), onClick = { nav.go(Alerts.screen(p)) }) {
                            IconButton({ Alerts.toggle(p, "", "", "") }) { Icon(Ic.x, t("remove"), Modifier.size(18.dp)) }
                        }
                    }
                }
                val a = Store["autoDl"]
                Group(t("autoDl"), t("autoDlHint")) { // the titles downloaded as they come out, each set on its page (✕ stops it)
                    a.keys().asSequence().toList().forEach { p ->
                        Item(Ic.download, a.getJSONObject(p).optString("title"), onClick = { nav.go(Alerts.screen(p)) }) {
                            IconButton({ Alerts.toggleDl(p, "", "", "") }) { Icon(Ic.x, t("remove"), Modifier.size(18.dp)) }
                        }
                    }
                }
            }
        }
    }
    }
}

/** asked once per install: the folder keeps the data across reinstalls (app.js storageSheet) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StorageSheet(done: () -> Unit) {
    val close = { Store["prefs"].put("storageAsked", 1); Store.persist("prefs"); done() }
    ModalBottomSheet(close, containerColor = CardC) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(t("storage"), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(t("storageAsk"), Modifier.padding(vertical = 12.dp), color = Color(0xFFCCCCCC), fontSize = 14.sp, lineHeight = 22.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(close) { Text(t("later"), color = Color.White) }
                Button({ requestStorage(); close() }, colors = ButtonDefaults.buttonColors(Red)) { Icon(Ic.folder, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text(t("storageAllow")) }
            }
        }
    }
}

/** the drawer's feedback / bug report form, emailed on by web3forms (app.js feedbackSheet) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedbackSheet(done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    ModalBottomSheet(done, containerColor = CardC) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(t("feedback"), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(t("feedbackHint"), Modifier.padding(vertical = 12.dp), color = Color(0xFFCCCCCC), fontSize = 14.sp, lineHeight = 22.sp)
            OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), placeholder = { Text(t("feedbackEmail")) }, singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Email))
            OutlinedTextField(msg, { msg = it.take(5000) }, Modifier.fillMaxWidth().heightIn(min = 120.dp).padding(vertical = 12.dp), placeholder = { Text(t("feedbackMsg")) })
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(done) { Text(t("cancel"), color = Color.White) }
                Button({
                    sending = true
                    scope.launch {
                        runCatching {
                            val r = Net.fetch("https://api.web3forms.com/submit", mapOf("Accept" to "application/json"), form = mapOf("access_key" to "197ce167-d8f2-4479-ae56-1ebfcdd5b787",
                                "subject" to "Medflix feedback (android ${BuildConfig.BUILD})", "email" to email.trim(), "message" to msg.trim()))
                            check(r.status == 200) { "HTTP ${r.status}" } // a form post gets an HTML page back, not JSON: refusals are 4xx
                        }.onSuccess { toast(t("feedbackSent")); done() }.onFailure { sending = false; toast(t("feedbackFailed")) } // kept open: the text isn't lost
                    }
                }, enabled = !sending && msg.isNotBlank(), colors = ButtonDefaults.buttonColors(Red)) { Text(t(if (sending) "feedbackSending" else "feedbackSend")) }
            }
        }
    }
}

/** a newer APK on GitHub: downloaded in the app, then Android's installer (app.js updateSheet) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdateSheet(u: Updater.Release, done: () -> Unit) {
    var pct by remember { mutableStateOf<Int?>(null) }
    val ready = remember(u.tag) { Updater.apk(u.tag).exists() } // downloaded before: installed straight away
    val open = openUrl()
    ModalBottomSheet(done, containerColor = CardC) { // closing mid-download: Android's installer still opens
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(t("updateTitle"), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text("${t(if (ready) "updateReadyText" else "updateText")} (${u.tag})", Modifier.padding(vertical = 12.dp), color = Color(0xFFCCCCCC), fontSize = 14.sp, lineHeight = 22.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(done) { Text(t("later"), color = Color.White) }
                Button({
                    pct = -1
                    Updater.scope.launch {
                        runCatching { Updater.install(u) { pct = it } }.onSuccess { done() }.onFailure {
                            pct = null
                            if (it.message == "allow installs") toast(t("updateAllow")) // Android's settings page opened for it
                            else { toast(t("updateFailed")); open(u.url) } // the browser downloads it instead
                        }
                    }
                }, enabled = pct == null, colors = ButtonDefaults.buttonColors(Red)) {
                    Text(pct?.let { t("updateGetting") + if (it >= 0) " $it%" else "…" } ?: t(if (ready) "updateInstall" else "updateGo"))
                }
            }
        }
    }
}
