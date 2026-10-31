package com.medanime.app.ui

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import org.jsoup.Jsoup
import java.net.URLEncoder

internal object SourceRatings {
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Pair<String, String>>()
    suspend fun get(names: List<String>, kind: String, year: String): Pair<String, String>? {
        val key = "$names|$kind|$year"
        cache[key]?.let { return it }
        for (name in names.filter { it.isNotBlank() }) {
            val clean = Credits.clean(name)
            val result = if (kind == "anime" || kind == "manga") {
                val query = "{Page(perPage:10){media(search:${JSONObject.quote(clean)},type:${if (kind == "manga") "MANGA" else "ANIME"}){title{romaji english native} synonyms averageScore}}}"
                val r = Net.fetch("https://graphql.anilist.co", post = true, form = mapOf("query" to query))
                val rows = JSONObject(r.body).optJSONObject("data")?.optJSONObject("Page")?.optJSONArray("media")
                val matches = (0 until (rows?.length() ?: 0)).map { rows!!.getJSONObject(it) }.filter { m ->
                    val t = m.getJSONObject("title")
                    val synonyms = m.optJSONArray("synonyms")
                    (listOf(t.optString("romaji"), t.optString("english"), t.optString("native")) + (0 until (synonyms?.length() ?: 0)).map { synonyms!!.getString(it) }).any { Credits.norm(it) == Credits.norm(clean) }
                }
                val score = matches.singleOrNull()?.optDouble("averageScore") ?: 0.0
                if (score > 0 && score <= 100) "AniList" to String.format(java.util.Locale.US, "%.1f", score / 10) else null
            } else {
                val rows = JSONObject(Pages.load("https://v3.sg.media-imdb.com/suggestion/x/${URLEncoder.encode(clean, "UTF-8")}.json")).optJSONArray("d")
                val hit = (0 until (rows?.length() ?: 0)).map { rows!!.getJSONObject(it) }.filter { Credits.norm(it.optString("l")) == Credits.norm(clean) && (year.isBlank() || it.optString("y") == year) && it.optString("id").matches(Regex("tt\\d+")) }.singleOrNull()
                val doc = hit?.let { Jsoup.parse(Pages.load("https://www.imdb.com/title/${it.getString("id")}/")) }
                val score = doc?.select("script[type=application/ld+json]")?.mapNotNull { runCatching { JSONObject(it.data()).optJSONObject("aggregateRating")?.optDouble("ratingValue") }.getOrNull() }?.firstOrNull { it > 0 && it <= 10 }
                score?.let { "IMDb" to String.format(java.util.Locale.US, "%.1f", it) }
            }
            if (result != null) { cache[key] = result; return result }
        }
        return null
    }
}

/** the AniList / IMDb score, as one of the actions row's items: the logo over the stars */
@Composable
internal fun FlowRowScope.SourceRating(names: List<String>, kind: String, year: String = "") {
    var rating by remember(names, kind, year) { mutableStateOf<Pair<String, String>?>(null) }
    LaunchedEffect(names, kind, year) {
        rating = try { withContext(Dispatchers.IO) { SourceRatings.get(names, kind, year) } } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
    }
    rating?.let { (source, value) ->
        val gold = Color(0xFFF5C518)
        Column(Modifier.weight(1f).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.height(24.dp), contentAlignment = Alignment.Center) { // the same height as the other items' icons
                if (source == "IMDb") Text("IMDb", Modifier.background(gold, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp), color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.Black)
                else AsyncImage("https://anilist.co/img/icons/android-chrome-192x192.png", source, Modifier.size(24.dp).clip(RoundedCornerShape(5.dp)))
            }
            Text("★ $value", Modifier.padding(top = 4.dp), color = gold, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}
