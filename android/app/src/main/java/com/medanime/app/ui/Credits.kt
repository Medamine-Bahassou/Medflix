package com.medanime.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

internal data class Credit(val name: String, val photo: String, val actor: String, val actorPhoto: String = "", val source: String = "")

internal object Credits {
    fun clean(s: String) = s.replace(Regex("(?:الموسم|الجزء)\\s+\\S+.*|\\bseason\\s+\\d+.*|مشاهدة|تحميل|مسلسل|فيلم|مترجم|مدبلج|كامل|اون لاين", RegexOption.IGNORE_CASE), " ").replace(Regex("\\b(?:19|20)\\d{2}\\b"), "").trim()
    fun norm(s: String) = clean(s).lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    private fun objects(a: JSONArray?) = (0 until (a?.length() ?: 0)).mapNotNull { a?.optJSONObject(it) }
    private fun value(s: JSONObject?) = s?.optJSONObject("datavalue")?.opt("value")
    private fun claim(e: JSONObject?, p: String) = value(e?.optJSONObject("claims")?.optJSONArray(p)?.optJSONObject(0)?.optJSONObject("mainsnak"))
    private fun label(e: JSONObject?) = e?.optJSONObject("labels")?.let { it.optJSONObject("en")?.optString("value") ?: it.optJSONObject("ar")?.optString("value") }.orEmpty()
    private suspend fun json(url: String) = JSONObject(Pages.load(url))
    private suspend fun wd(vararg p: Pair<String, String>) = json("https://www.wikidata.org/w/api.php?format=json&" + p.joinToString("&") { "${it.first}=${enc(it.second)}" })
    private suspend fun entities(ids: List<String>): JSONObject {
        val result = JSONObject()
        for (batch in ids.distinct().chunked(50)) {
            val data = wd("action" to "wbgetentities", "ids" to batch.joinToString("|"), "props" to "labels|claims", "languages" to "en|ar").optJSONObject("entities") ?: continue
            data.keys().forEach { result.put(it, data.get(it)) }
        }
        return result
    }
    private fun photo(e: JSONObject?): String = (claim(e, "P18") as? String)?.let { "https://commons.wikimedia.org/wiki/Special:FilePath/${enc(it)}?width=240" }.orEmpty()
    private val responses = java.util.concurrent.ConcurrentHashMap<String, JSONObject>()
    private suspend fun anilist(names: List<String>, kind: String, onUpdate: (List<Credit>) -> Unit): List<Credit> {
        suspend fun ask(args: String, page: Int): JSONObject? {
            val query = "{Media($args){id title{romaji english native} synonyms characters(page:$page,perPage:50,sort:[ROLE,RELEVANCE,ID]){pageInfo{hasNextPage} edges{node{id name{full} image{large}} voiceActors(language:JAPANESE){name{full} image{large}}}}}}"
            val result = responses[query] ?: run {
                val r = Net.fetch("https://graphql.anilist.co", post = true, form = mapOf("query" to query))
                if (r.status >= 400) throw java.io.IOException("HTTP ${r.status}")
                val j = JSONObject(r.body)
                if (j.has("errors")) throw java.io.IOException("Character lookup failed")
                responses[query] = j
                j
            }
            return result.optJSONObject("data")?.optJSONObject("Media")
        }
        for (name in names) {
            var media = ask("search:${JSONObject.quote(clean(name))},type:${if (kind == "manga") "MANGA" else "ANIME"}", 1) ?: continue
            val title = media.optJSONObject("title")
            val synonyms = media.optJSONArray("synonyms") ?: JSONArray()
            val labels = listOf("romaji", "english", "native").map { title?.optString(it).orEmpty() } + (0 until synonyms.length()).map { synonyms.optString(it) }
            if (labels.none { n -> names.any { norm(n) == norm(it) } }) continue
            val rows = linkedMapOf<Int, Credit>()
            var page = 1
            while (true) {
                val chars = media.getJSONObject("characters")
                objects(chars.optJSONArray("edges")).forEach { e ->
                    val c = e.getJSONObject("node")
                    val a = if (kind == "anime") e.optJSONArray("voiceActors")?.optJSONObject(0) else null
                    rows[c.getInt("id")] = Credit(c.getJSONObject("name").getString("full"), c.optJSONObject("image")?.optString("large").orEmpty(), a?.optJSONObject("name")?.optString("full").orEmpty(), a?.optJSONObject("image")?.optString("large").orEmpty())
                }
                onUpdate(rows.values.toList())
                if (!chars.getJSONObject("pageInfo").optBoolean("hasNextPage")) return rows.values.toList()
                media = ask("id:${media.getInt("id")}", ++page) ?: throw java.io.IOException("Missing character page")
            }
        }
        return emptyList()
    }
    private suspend fun series(names: List<String>, year: String): List<Credit> {
        for (name in names) {
            val hits = objects(JSONArray(Pages.load("https://api.tvmaze.com/search/shows?q=${enc(clean(name))}"))).map { it.getJSONObject("show") }
                .filter { s -> names.any { norm(it) == norm(s.optString("name")) } && (year.isEmpty() || s.optString("premiered").startsWith(year)) }
            if (hits.size != 1) continue
            return objects(JSONArray(Pages.load("https://api.tvmaze.com/shows/${hits[0].getInt("id")}/cast"))).map { e ->
                val c = e.getJSONObject("character"); val p = e.getJSONObject("person")
                Credit(c.optString("name"), c.optJSONObject("image")?.optString("medium") ?: p.optJSONObject("image")?.optString("medium").orEmpty(), p.optString("name"), source = hits[0].optString("url"))
            }
        }
        return emptyList()
    }
    suspend fun load(names: List<String>, anime: Boolean, year: String, kind: String = if (anime) "anime" else "cinema", onUpdate: (List<Credit>) -> Unit = {}): List<Credit> {
        val queries = names.filter { norm(it).isNotEmpty() }.distinct()
        var failure: Exception? = null
        if (kind in listOf("anime", "manga", "series")) {
            try {
                val rows = if (kind == "series") series(queries, year) else anilist(queries, kind, onUpdate)
                if (rows.isNotEmpty()) return rows
            } catch (e: CancellationException) { throw e } catch (e: Exception) { failure = e }
        }
        val rows = legacy(queries, kind == "anime" || kind == "manga", year, kind)
        if (rows.isEmpty() && failure != null) throw failure
        return rows
    }
    private suspend fun legacy(names: List<String>, anime: Boolean, year: String, kind: String): List<Credit> {
        val queries = names.filter { norm(it).isNotEmpty() }.distinct()
        for (name in queries) {
            if (anime) {
                val matches = objects(json("https://api.jikan.moe/v4/$kind?q=${enc(clean(name))}&limit=5").optJSONArray("data"))
                val hit = matches.find { a -> (listOf(a.optString("title"), a.optString("title_english")) + objects(a.optJSONArray("titles")).map { it.optString("title") }).any { n -> queries.any { norm(n) == norm(it) } } } ?: continue
                return objects(json("https://api.jikan.moe/v4/$kind/${hit.optInt("mal_id")}/characters").optJSONArray("data")).mapNotNull { c ->
                    val character = c.optJSONObject("character") ?: return@mapNotNull null
                    val actor = objects(c.optJSONArray("voice_actors")).find { it.optString("language") == "Japanese" }?.optJSONObject("person")
                    Credit(character.optString("name"), character.optJSONObject("images")?.optJSONObject("jpg")?.optString("image_url").orEmpty(), actor?.optString("name").orEmpty(), actor?.optJSONObject("images")?.optJSONObject("jpg")?.optString("image_url").orEmpty())
                }
            }
            val found = objects(wd("action" to "wbsearchentities", "search" to clean(name), "language" to if (Regex("[\\u0600-\\u06ff]").containsMatchIn(name)) "ar" else "en", "limit" to "8").optJSONArray("search"))
                .filter { e -> queries.any { norm(e.optJSONObject("match")?.optString("text") ?: e.optString("label")) == norm(it) } && Regex("film|movie|series|television|فيلم|مسلسل", RegexOption.IGNORE_CASE).containsMatchIn(e.optString("description")) && !Regex("season|episode|موسم|حلقة", RegexOption.IGNORE_CASE).containsMatchIn(e.optString("description")) }
            val titles = entities(found.map { it.optString("id") })
            val hits = found.mapNotNull { titles.optJSONObject(it.optString("id")) }.filter { e -> objects(e.optJSONObject("claims")?.optJSONArray("P161")).isNotEmpty() && (year.isEmpty() || ((claim(e, "P577") as? JSONObject)?.optString("time").orEmpty().contains(year))) }
            if (hits.size != 1) continue
            val cast = objects(hits[0].optJSONObject("claims")?.optJSONArray("P161")).filter { it.optString("rank") != "deprecated" }
            val people = entities(cast.flatMap { c -> listOfNotNull((value(c.optJSONObject("mainsnak")) as? JSONObject)?.optString("id")) + objects(c.optJSONObject("qualifiers")?.optJSONArray("P453")).mapNotNull { (value(it) as? JSONObject)?.optString("id") } })
            return cast.map { c ->
                val actor = people.optJSONObject((value(c.optJSONObject("mainsnak")) as? JSONObject)?.optString("id").orEmpty())
                val q = c.optJSONObject("qualifiers")
                val character = people.optJSONObject((value(q?.optJSONArray("P453")?.optJSONObject(0)) as? JSONObject)?.optString("id").orEmpty())
                Credit(label(character).ifEmpty { value(q?.optJSONArray("P4633")?.optJSONObject(0)) as? String ?: "" }, photo(character).ifEmpty { photo(actor) }, label(actor))
            }.filter { it.name.isNotEmpty() || it.actor.isNotEmpty() }
        }
        return emptyList()
    }
}

@Composable
fun CreditsSection(names: List<String>, anime: Boolean, year: String = "", kind: String = if (anime) "anime" else "cinema", nav: Nav) {
    var credits by remember(names, anime, year, kind) { mutableStateOf<List<Credit>?>(null) }
    LaunchedEffect(names, anime, year, kind) {
        try { credits = Credits.load(names, anime, year, kind) { credits = it } }
        catch (e: CancellationException) { throw e }
        catch (_: Exception) { if (credits == null) credits = emptyList() }
    }
    val rows = credits
    if (rows != null && rows.isEmpty()) return
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    Column(Modifier.padding(vertical = 12.dp)) {
        Row(Modifier.fillMaxWidth().clickable(enabled = rows != null) { nav.go(Screen.Characters(names, kind, year)) }.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(t("charactersCast") + (rows?.let { " (${it.size})" } ?: ""), Modifier.weight(1f), fontSize = 20.sp, fontWeight = FontWeight.Bold)
            if (rows != null) Text(t("viewAllCast"), color = Muted, fontSize = 13.sp)
        }
        LazyRow(contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (rows == null) items(6) {
                Column(Modifier.width(112.dp)) {
                    Spacer(Modifier.fillMaxWidth().aspectRatio(2 / 3f).clip(RoundedCornerShape(8.dp)).background(CardC))
                    Spacer(Modifier.padding(top = 12.dp).fillMaxWidth(.7f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(Muted.copy(alpha = .2f)))
                }
            } else items(rows.take(12)) { c ->
                CreditCard(c, anime, Modifier.width(112.dp))
            }
        }
        credits?.firstOrNull()?.source?.takeIf { it.isNotEmpty() }?.let { url ->
            androidx.compose.material3.TextButton({ uri.openUri(url) }) { Text("TVmaze · CC BY-SA") }
        }
    }
}

private val portraitRequests = Semaphore(1)

@Composable
private fun CreditPortrait(photo: String, name: String, modifier: Modifier) {
    var expanded by remember(photo) { mutableStateOf(false) }
    if (expanded) androidx.compose.ui.window.Dialog({ expanded = false }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        var viewerLoaded by remember(photo) { mutableStateOf(false) }
        Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black).clickable { expanded = false }) {
            if (!viewerLoaded) Icon(Ic.face, null, Modifier.align(androidx.compose.ui.Alignment.Center).size(56.dp), tint = Muted)
            AsyncImage(photo, name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit, onSuccess = { viewerLoaded = true })
            androidx.compose.material3.IconButton({ expanded = false }, Modifier.align(androidx.compose.ui.Alignment.TopEnd).statusBarsPadding().padding(16.dp)) {
                Icon(Ic.x, t("back"))
            }
        }
    }
    var loaded by remember(photo) { mutableStateOf(false) }
    var requested by remember(photo) { mutableStateOf(false) }
    val finished = remember(photo) { CompletableDeferred<Unit>() }
    LaunchedEffect(photo) {
        if (photo.isNotEmpty()) portraitRequests.withPermit {
            requested = true
            finished.await() // composing only visible cards keeps the queue tied to the viewport
        }
    }
    Box(modifier.background(CardC).clickable(enabled = photo.isNotEmpty(), onClickLabel = t("enlargeImage")) { expanded = true }, contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!loaded) Icon(Ic.face, null, Modifier.fillMaxWidth(.4f).aspectRatio(1f).sizeIn(maxWidth = 56.dp, maxHeight = 56.dp), tint = Muted)
        if (requested) AsyncImage(photo, name, Modifier.matchParentSize(), contentScale = ContentScale.Crop,
            onLoading = { loaded = false }, onSuccess = { loaded = true; finished.complete(Unit) }, onError = { loaded = false; finished.complete(Unit) })
    }
}

@Composable
private fun CreditCard(c: Credit, anime: Boolean, modifier: Modifier = Modifier, compact: Boolean = false) {
    Column(modifier) {
        CreditPortrait(c.photo, c.name.ifEmpty { c.actor }, Modifier.fillMaxWidth().aspectRatio(2 / 3f).clip(RoundedCornerShape(8.dp)))
        Text(c.name.ifEmpty { c.actor }, Modifier.padding(top = if (compact) 4.dp else 8.dp), fontSize = if (compact) 12.sp else 14.sp, fontWeight = FontWeight.SemiBold,
            maxLines = if (compact) 1 else Int.MAX_VALUE, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        if (c.actor.isNotEmpty()) Text("${t(if (anime) "japaneseVoice" else "actor")}: ${c.actor}", color = Muted, fontSize = if (compact) 11.sp else 12.sp,
            maxLines = if (compact) 2 else Int.MAX_VALUE, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        if (c.actorPhoto.isNotEmpty()) CreditPortrait(c.actorPhoto, c.actor, Modifier.padding(top = 6.dp).size(36.dp).clip(RoundedCornerShape(50)))
    }
}

@Composable
fun CreditsScreen(screen: Screen.Characters, nav: Nav) {
    var rows by remember(screen) { mutableStateOf<List<Credit>?>(null) }
    var failed by remember(screen) { mutableStateOf(false) }
    var query by androidx.compose.runtime.saveable.rememberSaveable(screen) { mutableStateOf("") }
    LaunchedEffect(screen) {
        try { rows = Credits.load(screen.names, screen.kind == "anime", screen.year, screen.kind) { rows = it } }
        catch (e: CancellationException) { throw e }
        catch (_: Exception) { failed = true }
    }
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    Column(Modifier.fillMaxSize()) {
        SearchTitle(t("charactersCast"), nav, query, { query = it }, t("castSearch"))
        Text(screen.names.firstOrNull().orEmpty(), Modifier.padding(horizontal = 16.dp), color = Muted, fontSize = 14.sp)
        val all = rows
        if (all == null) Text(t(if (failed) "castUnavailable" else "loadingCast"), Modifier.padding(16.dp), color = Muted)
        else {
            if (failed) Text(t("castUnavailable"), Modifier.padding(16.dp), color = Muted)
            val shown = remember(all, query) { all.filter { query.isBlank() || "${it.name} ${it.actor}".contains(query.trim(), ignoreCase = true) } }
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(if (all.isEmpty()) t("noCast") else "${shown.size} / ${all.size}", Modifier.weight(1f).padding(start = 8.dp), color = Muted)
                GridColsMenu()
            }
            all.firstOrNull()?.source?.takeIf { it.isNotEmpty() }?.let { url ->
                androidx.compose.material3.TextButton({ uri.openUri(url) }) { Text("TVmaze · CC BY-SA") }
            }
            LazyVerticalGrid(GridCells.Fixed(gridCols.intValue), Modifier.weight(1f).pinchColumns(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(shown.size) { i -> CreditCard(shown[i], screen.kind == "anime", Modifier.fillMaxWidth(), compact = true) }
            }
        }
    }
}
