package com.medanime.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * picking several items of a list (app.js selectable): while on, a tap picks or unpicks; the bar offers select all and
 * the list's actions on what's picked. set: the picked ids, null when not selecting
 */
class Picks {
    var set by mutableStateOf<Set<String>?>(null)
    val on get() = set != null
    fun start(id: String) { set = setOf(id) }
    fun toggle(id: String) { set = set?.let { if (id in it) it - id else it + id } }
    fun has(id: String) = set?.contains(id) == true
    fun clear() { set = null }
}

// the grid a card is in (null: a row, where cards aren't picked)
val LocalPicks = compositionLocalOf<Picks?> { null }

/** the selection bar, in place of the list's header: close, how many, select all, the actions sheet */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectBar(p: Picks, all: () -> List<String>, acts: (List<String>) -> List<Pair<String, String>>, run: (String, List<String>) -> Unit) {
    if (!p.on) return
    BackHandler { p.clear() }
    var sheet by remember { mutableStateOf(false) }
    val ids = p.set!!.toList()
    Row(Modifier.fillMaxWidth().background(Color(0xFF1F1F1F)).padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(p::clear) { Icon(Ic.x, t("cancel"), Modifier.size(20.dp)) }
        Text(t("selectedN", ids.size), Modifier.weight(1f), fontWeight = FontWeight.Bold)
        TextButton({ p.set = all().toSet() }) { Text(t("selectAll"), color = Color.White) }
        Button({ if (ids.isNotEmpty()) sheet = true }, enabled = ids.isNotEmpty(), colors = ButtonDefaults.buttonColors(Red)) { Text(t("actions")) }
    }
    if (sheet) ModalBottomSheet({ sheet = false }, containerColor = CardC) {
        Text(t("selectedN", ids.size), Modifier.padding(horizontal = 24.dp, vertical = 8.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp)
        acts(ids).forEach { (v, label) ->
            Text(label, Modifier.fillMaxWidth().clickable { sheet = false; p.clear(); run(v, ids) }.padding(horizontal = 24.dp, vertical = 16.dp), fontSize = 16.sp)
        }
        Spacer(Modifier.navigationBarsPadding().height(16.dp))
    }
}

/** a picked item's look: a red frame and a check */
fun Modifier.picked(on: Boolean) = if (on) border(2.dp, Red, RoundedCornerShape(6.dp)) else this
@Composable
fun BoxScope.PickMark(on: Boolean) {
    if (on) Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(22.dp).background(Red, CircleShape), Alignment.Center) { Icon(Ic.check, null, Modifier.size(14.dp)) }
}

// ---------- cards: (un)list them, hide them or show them again (app.js cardMenu, for several) ----------
fun cardActs(cards: List<Card>) = listOfNotNull(
    if (cards.any { !Store.inList(it.showPath) }) "list" to t("listAdd") else null,
    if (cards.any { Store.inList(it.showPath) }) "unlist" to t("listRemove") else null,
    if (cards.any { !isHidden(it) }) "hide" to t("hideAnime").let { if (cards.all { c -> c.type == "manga" }) t("hideManga") else it } else null,
    if (cards.any { isHidden(it) }) "unhide" to t("unhide") else null,
)
fun cardRun(v: String, cards: List<Card>) {
    for (c in cards) when (v) {
        "list" -> if (!Store.inList(c.showPath)) Store.toggleList(c.showPath, c.title, c.poster, c.type)
        "unlist" -> if (Store.inList(c.showPath)) Store.toggleList(c.showPath, c.title, c.poster, c.type)
        "hide" -> if (!isHidden(c)) setHidden(c, true, quiet = true)
        "unhide" -> if (isHidden(c)) setHidden(c, false, quiet = true)
    }
    toast(t("selectedN", cards.size))
}
