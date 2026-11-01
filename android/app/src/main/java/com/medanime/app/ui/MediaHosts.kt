package com.medanime.app.ui

import java.net.URI
import java.io.IOException
import org.json.JSONObject

object MediaHosts {
    fun supports(label: String) = Regex("^(mediafire|pixeldrain|krakenfiles|streamtape|firestream|mf|pd|kf|st)(?:\\s|$)", RegexOption.IGNORE_CASE).containsMatchIn(label)
    fun host(url: String): String? = runCatching {
        val h = URI(url).host.lowercase()
        listOf("mediafire.com", "pixeldrain.com", "krakenfiles.com", "streamtape.com", "streamtape.cc", "arabseed.top", "firestream.to").firstOrNull { h == it || h.endsWith(".$it") }
    }.getOrNull()
    suspend fun resolve(url: String): String {
        val kind = host(url) ?: throw IOException("unsupported host")
        val u = URI(url)
        val origin = "${u.scheme}://${u.authority}"
        if (kind == "pixeldrain.com") {
            val id = Regex("^/(?:u|api/file)/([\\w-]+)/?$").find(u.path)?.groupValues?.get(1) ?: throw IOException("unsupported Pixeldrain link")
            return "$origin/api/file/$id"
        }
        // arabseed's file host (the movie section's downloads): its free-download form, posted from its page, answers with the file (hosts.js)
        if (kind == "arabseed.top") {
            val id = Regex("^/(\\w+)/?$").find(u.path)?.groupValues?.get(1) ?: throw IOException("unsupported arabseed link")
            val r = Net.fetch(url, mapOf("Referer" to url), post = true, form = mapOf("op" to "download2", "id" to id, "method_free" to "1"))
            if (r.status >= 400) throw IOException("host HTTP ${r.status}")
            val direct = Regex("""href=["'](https?://[^"']+\.(?:mp4|mkv))["']""", RegexOption.IGNORE_CASE).find(r.body)?.groupValues?.get(1) ?: throw IOException("host did not provide a download link")
            return u.resolve(direct.replace("&amp;", "&").replace("[", "%5B").replace("]", "%5D")).toString() // URI refuses raw brackets (its names are "[myseed].Show...")
        }
        val response = Net.fetch(url)
        if (response.status >= 400) throw IOException("host HTTP ${response.status}")
        val html = response.body
        val direct = when (kind) {
            "mediafire.com" -> Regex("""href=["'](https://download\d*\.mediafire\.com/[^"']+)["']""").find(html)?.groupValues?.get(1)
            "krakenfiles.com" -> {
                val token = Regex("""id=["']dl-token["'][^>]*value=["']([^"']+)""").find(html)?.groupValues?.get(1)
                val hash = Regex("""data-file-hash=["']([^"']+)""").find(html)?.groupValues?.get(1)
                if (token == null || hash == null) null else {
                    val r = Net.fetch("$origin/download/$hash", post = true, form = mapOf("token" to token))
                    if (r.status >= 400) throw IOException("host HTTP ${r.status}")
                    JSONObject(r.body).let { if (it.optString("status") == "ok") it.optString("url") else null }
                }
            }
            "firestream.to" -> Regex(""""downloadUrl":"((?:\\.|[^"\\])*)"""").find(html)?.groupValues?.get(1)?.let { org.json.JSONArray("[\"$it\"]").getString(0) }
            else -> {
                val expr = Regex("""getElementById\(['"](?:no)?robotlink['"]\)\.innerHTML\s*=\s*([^;]+);""").find(html)?.groupValues?.get(1)
                expr?.let { Regex("""['"]([^'"]*)['"]\)?((?:\.substring\(\d+\))*)""").findAll(it).joinToString("") { m ->
                    Regex("""substring\((\d+)\)""").findAll(m.groupValues[2]).fold(m.groupValues[1]) { text, n -> text.drop(n.groupValues[1].toInt()) }
                } }
            }
        }
        if (direct.isNullOrBlank()) throw IOException("host did not provide a download link")
        val result = u.resolve(direct.replace("&amp;", "&"))
        if (result.scheme !in listOf("http", "https")) throw IOException("invalid media URL")
        return result.toString()
    }
}
