package com.medanime.app.ui

import org.json.JSONObject
import org.json.JSONArray
import java.net.URLEncoder
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Public settings → title search → episode summary → servers. No catalogue entries are added. */
object AnimeWitcher {
    private const val BASE = "https://firestore.googleapis.com/v1/projects/animewitcher-1c66d/databases/(default)/documents/"
    private val mutex = Mutex()
    private val cache = LinkedHashMap<String, List<Server>>()
    private fun decode(v: JSONObject): Any? = when {
        v.has("mapValue") -> JSONObject().also { out ->
            val fields = v.getJSONObject("mapValue").optJSONObject("fields") ?: JSONObject()
            fields.keys().forEach { k -> out.put(k, decode(fields.getJSONObject(k)) ?: JSONObject.NULL) }
        }
        v.has("arrayValue") -> JSONArray().also { out ->
            val values = v.getJSONObject("arrayValue").optJSONArray("values") ?: JSONArray()
            for (i in 0 until values.length()) out.put(decode(values.getJSONObject(i)))
        }
        else -> listOf("stringValue", "integerValue", "doubleValue", "booleanValue").firstOrNull { v.has(it) }?.let { v.get(it) }
    }
    private suspend fun document(path: String): JSONObject {
        val r = Net.fetch(BASE + path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") })
        if (r.status >= 400) throw java.io.IOException("AW HTTP ${r.status}")
        return decode(JSONObject().put("mapValue", JSONObject().put("fields", JSONObject(r.body).getJSONObject("fields")))) as JSONObject
    }
    private fun normal(s: String) = java.text.Normalizer.normalize(s.lowercase(), java.text.Normalizer.Form.NFKC).replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    suspend fun sources(title: String, alt: String, ep: String): List<Server> = mutex.withLock {
        if (!Regex("^\\d+(?:\\.\\d+)?$").matches(ep)) return@withLock emptyList()
        val key = "$title|$alt|$ep"
        cache[key]?.let { return@withLock it }
        val cfg = document("Settings/constants").getJSONObject("search_settings")
        val r = Net.fetch("https://${cfg.getString("app_id").lowercase()}-dsn.algolia.net/1/indexes/series/query", post = true,
            headers0 = mapOf("X-Algolia-Application-Id" to cfg.getString("app_id"), "X-Algolia-API-Key" to cfg.getString("api_key")),
            json = JSONObject().put("query", title).put("hitsPerPage", 30).toString())
        if (r.status >= 400) throw java.io.IOException("AW search HTTP ${r.status}")
        val hits = JSONObject(r.body).getJSONArray("hits")
        val names = listOf(title, alt).filter { it.isNotBlank() }.map(::normal)
        val matches = (0 until hits.length()).map { hits.getJSONObject(it) }.filter {
            !it.optBoolean("dubbed") && listOf(it.optString("name"), it.optJSONObject("details")?.optString("english_title") ?: "").any { n -> normal(n) in names }
        }
        if (matches.size != 1) return@withLock emptyList()
        val anime = matches.single()
        val path = anime.optString("path").ifEmpty { anime.optString("doc_ref") }
        if (!Regex("^anime_list/[^/]+$").matches(path)) return@withLock emptyList()
        val episodes = document("$path/episodes_summery/summery").getJSONArray("episodes")
        val matching = (0 until episodes.length()).map { episodes.getJSONObject(it) }.filter {
            Regex("\\d+(?:\\.\\d+)?").find(it.optString("name"))?.value?.toDoubleOrNull() == ep.toDoubleOrNull()
        }
        if (matching.size != 1) return@withLock emptyList()
        val id = matching.single().getString("doc_id")
        if (!Regex("^[\\w-]+$").matches(id)) return@withLock emptyList()
        val servers = document("$path/episodes/$id/servers2/all_servers").getJSONArray("servers")
        val labels = mapOf("MF" to "mediafire", "MF2" to "mediafire", "PD" to "pixeldrain", "KF" to "krakenfiles", "ST" to "streamtape", "SF" to "firestream")
        val qualities = mapOf("1080p" to "FHD", "720p" to "HD", "480p" to "SD", "360p" to "SD", "2160p" to "4K")
        val result = (0 until servers.length()).mapNotNull { i ->
            val s = servers.getJSONObject(i); val link = s.optString("link")
            if (!s.optBoolean("visible", true) || !Regex("^https?://").containsMatchIn(link)) null
            else Server((labels[s.optString("name")] ?: s.optString("name")) + " · AW", qualities[s.optString("quality")] ?: s.optString("quality"), "aw:$link", link)
        }
        if (cache.size > 100) cache.clear()
        cache[key] = result
        result
    }
}
