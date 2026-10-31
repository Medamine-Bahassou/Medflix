package com.medanime.app

import com.medanime.app.ui.Manga
import org.json.JSONArray
import org.json.JSONObject

/** source ids can change; a series and chapter number still identify the same offline chapter. */
internal object ChapterDownloads {
    fun ids(d: JSONObject): Set<String> {
        if (d.optString("kind") != "manga") return emptySet()
        val aliases = d.optJSONArray("chapterIds")
        return (listOf(d.optString("chapterId")) + (0 until (aliases?.length() ?: 0)).map { aliases!!.optString(it) })
            .filter { it.isNotEmpty() }.toSet()
    }

    fun alias(d: JSONObject, id: String) { d.put("chapterIds", JSONArray((ids(d) + id).toList())) }

    fun find(all: JSONObject, show: String, number: String): JSONObject? = all.keys().asSequence().mapNotNull { all.optJSONObject(it) }
        .find { it.optString("kind") == "manga" && it.optString("show") == show && Manga.chNum(it.opt("ep")) == Manga.chNum(number) }

    // remove only redundant records, never their files: old and new ids can point to the same folder.
    fun repair(all: JSONObject): Boolean {
        val groups = all.keys().asSequence().mapNotNull { key -> all.optJSONObject(key)?.let { key to it } }
            .filter { (_, d) -> d.optString("kind") == "manga" && d.optString("show").isNotEmpty() && d.optString("ep").isNotBlank() }
            .toList().groupBy { (_, d) -> d.optString("show") to Manga.chNum(d.opt("ep")) }
        var changed = false
        for (copies in groups.values.filter { it.size > 1 }) {
            val keep = copies.maxWith(compareBy<Pair<String, JSONObject>>(
                { when (it.second.optString("state")) { "done" -> 3; "active", "queued", "paused" -> 2; else -> 1 } },
                { it.second.optLong("at") }))
            copies.filter { it.first != keep.first }.forEach { (key, d) ->
                ids(d).forEach { alias(keep.second, it) }
                all.remove(key)
            }
            changed = true
        }
        return changed
    }
}
