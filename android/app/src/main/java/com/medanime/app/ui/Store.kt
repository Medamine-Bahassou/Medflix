package com.medanime.app.ui

import android.content.Context
import android.os.Build
import android.os.Environment
import androidx.compose.runtime.mutableIntStateOf
import org.json.JSONObject
import java.io.File

/**
 * The user's state (app.js `store`), same keys and JSON as the web app. With all-files access it's the same
 * MEDFLIX/Data/<key>.json the WebView app keeps (DownloaderPlugin.writeData), so both see one history and list.
 */
object Store {
    private lateinit var own: File
    private val data = java.util.concurrent.ConcurrentHashMap<String, JSONObject>()
    private val io = java.util.concurrent.Executors.newSingleThreadExecutor() // one write at a time: two never share the .tmp
    val version = mutableIntStateOf(0) // bumped on every change: screens reading the store redraw

    fun init(c: Context) { own = File(c.filesDir, "data") }

    fun granted() = if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager() else false
    val shared get() = File(Environment.getExternalStorageDirectory(), "MEDFLIX")
    private fun file(key: String) = File(if (granted()) File(shared, "Data") else own, "$key.json")

    private var was: Boolean? = null
    /**
     * on launch and back from Android's settings (DownloaderPlugin's storage check): the moment access is granted, the
     * folder's data (an earlier install's, or the WebView app's) is loaded, or, the folder empty, ours is copied there
     */
    fun check() {
        val g = granted()
        val before = was
        was = g
        if (!g || before != false) return
        val data = File(shared, "Data")
        if (data.list().isNullOrEmpty()) { data.mkdirs(); own.listFiles()?.forEach { it.copyTo(File(data, it.name), true) } }
        this.data.clear() // read again, from the folder now
        version.intValue++
    }

    /** the phone's dock: up to 4 sections (settings) */
    fun dock(): List<String> {
        val a = get("prefs").optJSONArray("dock")
        val l = (0 until (a?.length() ?: 0)).map { a!!.getString(it) }.ifEmpty { listOf("home", "anime", "manga", "myList") }
        return l.map { if (it == "series" || it == "movies") "anime" else it }.distinct().filter { it in NAV }  // series and movies were one section each before Anime held both
    }
    fun setDock(l: List<String>) { get("prefs").put("dock", org.json.JSONArray(l)); persist("prefs") }

    operator fun get(key: String): JSONObject = data.getOrPut(key) {
        runCatching { JSONObject(file(key).readText()) }.getOrDefault(JSONObject())
    }

    /**
     * saves key whole (app.js persist), written aside then swapped in: a crash mid-write never leaves a half file. quiet:
     * no redraw (the reader's place, saved twice a second while scrolling, redrew the whole app each time)
     */
    fun persist(key: String, quiet: Boolean = false) {
        if (!quiet) version.intValue++
        val text = get(key).toString()
        io.execute {
            val f = file(key)
            f.parentFile?.mkdirs()
            val tmp = File(f.path + ".tmp")
            tmp.writeText(text)
            tmp.renameTo(f)
        }
    }

    fun inList(path: String) = get("list").has(path)
    fun toggleList(path: String, title: String, poster: String, type: String): Boolean {
        val l = get("list")
        if (l.has(path)) l.remove(path)
        else l.put(path, JSONObject().put("path", path).put("title", title).put("poster", poster).put("type", type).put("at", System.currentTimeMillis()))
        persist("list")
        if (l.has(path) && Alerts.can(path)) Alerts.follow(path, title, poster, quiet = true) // listed: its new episodes or chapters notify too
        return l.has(path)
    }

    fun watched(show: String, epPath: String, ep: String, title: String, poster: String) {
        get("history").put(show, JSONObject().put("show", show).put("epPath", epPath).put("ep", ep).put("title", title).put("poster", poster).put("at", System.currentTimeMillis()))
        get("seen").put(epPath, 1)
        persist("history"); persist("seen")
    }

    val lang get() = get("prefs").optString("lang", "ar")
}
