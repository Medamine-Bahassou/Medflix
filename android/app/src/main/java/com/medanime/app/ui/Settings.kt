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

@Composable
private fun Card(title: String, hint: String? = null, content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(8.dp)).background(CardC).padding(16.dp)) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
        if (hint != null) Text(hint, Modifier.padding(top = 4.dp, bottom = 8.dp), color = Muted, fontSize = 13.sp)
        content()
    }

/** settings (app.js settingsView): the dock, the MEDFLIX folder, language, updates */
@Composable
fun SettingsScreen(nav: Nav) {
    Store.version.intValue
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        PageTitle(t("settings"), nav)
        val dock = Store.dock()
        Card(t("dockTitle"), t("dockHint")) {
            Text("${t("inDock")}  ${dock.size}/4", Modifier.padding(vertical = 6.dp), color = Muted, fontSize = 13.sp)
            dock.forEachIndexed { i, id ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(NAV.getValue(id).second(), null, Modifier.size(22.dp), tint = Red)
                    Text(navLabel(id), Modifier.weight(1f).padding(horizontal = 12.dp))
                    val move = { j: Int -> Store.setDock(dock.toMutableList().apply { add(j, removeAt(i)) }) }
                    IconButton({ move(i - 1) }, enabled = i > 0) { Icon(Ic.caretUp, t("moveUp"), Modifier.size(18.dp)) }
                    IconButton({ move(i + 1) }, enabled = i < dock.size - 1) { Icon(Ic.caretDown, t("moveDown"), Modifier.size(18.dp)) }
                    IconButton({ if (dock.size <= 1) toast(t("dockMin")) else Store.setDock(dock - id) }) { Icon(Ic.minus, t("removeDock"), Modifier.size(18.dp)) }
                }
            }
            Text(t("available"), Modifier.padding(top = 12.dp, bottom = 6.dp), color = Muted, fontSize = 13.sp)
            NAV.keys.filter { it !in dock }.forEach { id ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(NAV.getValue(id).second(), null, Modifier.size(22.dp), tint = Muted)
                    Text(navLabel(id), Modifier.weight(1f).padding(horizontal = 12.dp), color = Color(0xFFCCCCCC))
                    IconButton({ if (dock.size >= 4) toast(t("dockFull")) else Store.setDock(dock + id) }) { Icon(Ic.plus, t("addDock"), Modifier.size(18.dp)) }
                }
            }
        }
        Card(t("storage"), t("storageHint")) {
            val on = Store.granted()
            Row(Modifier.clip(RoundedCornerShape(6.dp)).clickable(onClick = ::openFolder).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) { // tap: the folder in the file manager
                Icon(Ic.folder, null, Modifier.size(22.dp), tint = if (on) Red else Muted)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(Store.shared.absolutePath, fontSize = 13.sp, color = if (on) Red else Color.White, style = LocalTextStyle.current.copy(textDirection = androidx.compose.ui.text.style.TextDirection.Ltr)) // a path reads left to right in Arabic too
                    Text(if (on) t("storageOn") else t("storageOff"), color = Muted, fontSize = 12.sp)
                }
                if (!on) Button(::requestStorage, colors = ButtonDefaults.buttonColors(Red)) { Text(t("storageAllow")) }
            }
        }
        Card(t("hiddenTitle"), t("hiddenHint").replace("✕", "…")) {
            TextButton({ nav.go(Screen.Hidden) }) { Icon(Ic.eyeSlash, null, Modifier.size(18.dp), tint = Color.White); Spacer(Modifier.width(8.dp)); Text(t("openHidden", Store["hidden"].length()), color = Color.White) }
        }
        Card(t("language")) { LangSwitch(Modifier.padding(top = 8.dp)) }
        Card(t("updateTitle")) {
            var busy by remember { mutableStateOf(false) }
            var found by remember { mutableStateOf<Updater.Release?>(null) }
            Text("Build ${BuildConfig.BUILD}", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp))
            OutlinedButton({
                busy = true
                scope.launch {
                    val u = runCatching { Updater.check() }.getOrNull()
                    busy = false
                    if (u == null) toast(if (Store.lang == "ar") "أنت على آخر إصدار" else "You're on the latest version") else found = u
                }
            }, enabled = !busy) { Icon(Ic.refresh, null, Modifier.size(16.dp), tint = Color.White); Spacer(Modifier.width(6.dp)); Text(if (Store.lang == "ar") "البحث عن تحديث" else "Check for updates", color = Color.White) }
            found?.let { u -> UpdateSheet(u) { found = null } }
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

/** a newer APK on GitHub: downloaded in the app, then Android's installer (app.js updateSheet) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdateSheet(u: Updater.Release, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var pct by remember { mutableStateOf<Int?>(null) }
    val open = openUrl()
    ModalBottomSheet(done, containerColor = CardC) { // closing mid-download: Android's installer still opens
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(t("updateTitle"), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text("${t("updateText")} (${u.tag})", Modifier.padding(vertical = 12.dp), color = Color(0xFFCCCCCC), fontSize = 14.sp, lineHeight = 22.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(done) { Text(t("later"), color = Color.White) }
                Button({
                    pct = -1
                    scope.launch {
                        runCatching { Updater.install(u.url) { pct = it } }.onSuccess { done() }.onFailure {
                            pct = null
                            if (it.message == "allow installs") toast(t("updateAllow")) // Android's settings page opened for it
                            else { toast(t("updateFailed")); open(u.url) } // the browser downloads it instead
                        }
                    }
                }, enabled = pct == null, colors = ButtonDefaults.buttonColors(Red)) {
                    Text(pct?.let { t("updateGetting") + if (it >= 0) " $it%" else "…" } ?: t("updateGo"))
                }
            }
        }
    }
}
