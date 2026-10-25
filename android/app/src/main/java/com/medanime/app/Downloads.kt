package com.medanime.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import androidx.compose.runtime.mutableIntStateOf
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.medanime.app.ui.Ch
import com.medanime.app.ui.Manga
import com.medanime.app.ui.Net
import com.medanime.app.ui.Store
import com.medanime.app.ui.UA
import com.medanime.app.ui.Witanime
import com.medanime.app.ui.t
import com.medanime.app.ui.toast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipInputStream
import kotlin.coroutines.coroutineContext

/**
 * Episode and chapter downloads (DownloaderPlugin's queue and app.js's, in one): each show's items one at a time, oldest
 * first, shows side by side. Kept in the store's "downloads", the same records the WebView app kept; the files go in the
 * MEDFLIX folder once allowed (else the app's own), and DownloadService keeps them going with the screen off.
 */
object Downloads {
    // an unexpected error in a download is logged, never the app's end (an uncaught one in a coroutine closed it)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + kotlinx.coroutines.CoroutineExceptionHandler { _, e -> android.util.Log.e("medflix", "download", e) })
    private val jobs = ConcurrentHashMap<String, Job>() // id -> its transfer
    // each start of an item is a new run; a run stopped (paused, cancelled, deleted) is superseded at once, so the state
    // shows right away and its transfer, winding down, writes nothing (a resume could otherwise start beside it)
    private val runs = ConcurrentHashMap<String, Int>()
    private fun supersede(id: String) { runs[id] = (runs[id] ?: 0) + 1; jobs[id]?.cancel() }
    val tick = mutableIntStateOf(0) // progress: the downloads page redraws
    private lateinit var app: Context

    fun all(): JSONObject = Store["downloads"]
    fun of(id: String): JSONObject? = all().optJSONObject(id)
    fun done(id: String) = of(id)?.optString("state") == "done"
    private fun dir() = if (Store.granted()) File(Store.shared, "Downloads") else File(app.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "MedAnime")

    /** on launch: what was cut off when the app last closed goes back in the queue */
    fun init(c: Context) {
        app = c.applicationContext
        all().keys().asSequence().mapNotNull { of(it) }.filter { it.optString("state") == "active" }.forEach { it.put("state", "queued") }
        pump()
    }

    private fun save() { Store.persist("downloads"); tick.intValue++ }
    private suspend fun ui(f: () -> Unit) = withContext(Dispatchers.Main) { f(); tick.intValue++ }

    // paused: everything (Pause all), or that show (app.js held)
    fun held(show: String) = Store["prefs"].optBoolean("dlPaused") || Store["prefs"].optJSONObject("dlHeld")?.optBoolean(show) == true

    private fun queue(id: String, rec: JSONObject, quiet: Boolean = false) {
        val cur = of(id)?.optString("state")
        if (cur == "active" || cur == "done") return if (quiet) Unit else toast(t(if (cur == "done") "dlDone" else "dlActive"))
        all().put(id, rec.put("id", id).put("state", if (held(rec.optString("show"))) "paused" else "queued").put("received", 0).put("total", 0))
        save()
        askNotifications()
        pump()
    }
    /** an episode: MediaFire's zip, unpacked into its .mp4 as it downloads; quality: the one picked (else the best there is) */
    fun episode(epPath: String, show: String, title: String, ep: String, poster: String, quality: String, quiet: Boolean = false) {
        queue(epPath, JSONObject().put("show", show).put("epPath", epPath).put("title", title).put("ep", ep).put("poster", poster).put("quality", quality).put("at", System.currentTimeMillis()), quiet)
        if (!quiet) toast(t("dlPreparing"))
    }
    /** a series' chapters, oldest first: their page images */
    fun chapters(serieId: String, title: String, poster: String, chs: List<Ch>) {
        var added = 0
        for (c in chs) {
            val id = "manga:${c.id}"
            if (of(id)?.optString("state").let { it != null && it != "error" && it != "cancelled" }) continue
            all().put(id, JSONObject().put("id", id).put("kind", "manga").put("show", "/manga/series/$serieId").put("chapterId", c.id).put("title", title)
                .put("ep", c.n).put("poster", poster).put("state", if (held("/manga/series/$serieId")) "paused" else "queued").put("received", 0).put("total", 0).put("at", System.currentTimeMillis() + added++))
        }
        save()
        toast(if (added > 0) t("dlQueuedN", added) else t("dlDone"))
        askNotifications()
        pump()
    }

    /** starts the next waiting item of every show that has nothing downloading */
    @Synchronized fun pump() {
        val items = all().keys().asSequence().mapNotNull { of(it) }.toList()
        for ((show, l) in items.groupBy { it.optString("show") }) {
            if (held(show) || l.any { it.optString("state") == "active" }) continue
            val d = l.filter { it.optString("state") == "queued" }.minByOrNull { it.optLong("at") } ?: continue
            start(d, show)
        }
        DownloadService.held = items.any { it.optString("state").let { s -> s == "queued" || s == "active" } }
        // the service's texts in the app's language
        DownloadService.labelActive = t("dlNotifActive"); DownloadService.labelMany = t("dlNotifMany"); DownloadService.labelPreparing = t("dlPreparing")
        if (DownloadService.held) DownloadService.start(app) else DownloadService.update(app)
    }

    private fun start(d: JSONObject, show: String) {
        val id = d.getString("id")
        d.put("state", "active").put("received", 0).put("total", 0)
        save()
        val run = (runs[id] ?: 0) + 1
        runs[id] = run
        val old = jobs[id]
        val job = scope.launch {
            old?.join() // the stopped transfer of the same file winds down first
            val manga = d.optString("kind") == "manga"
            val title = "${d.optString("title")} · ${t(if (manga) "chapter" else "episode")} ${d.optString("ep")}"
            val state = try { if (manga) pages(d, title) else episode(d, title); "done" }
                catch (e: Throwable) { android.util.Log.w("medflix", "download $id", e); if (e is CancellationException) "cancelled" else "error" }
            if (runs[id] != run) return@launch // stopped: whoever stopped it set its state
            DownloadService.active.remove(id)
            withContext(Dispatchers.Main) {
                if (of(id) == null || runs[id] != run) return@withContext // deleted or stopped meanwhile
                d.put("state", state)
                save()
                if (state == "done") toast(t("dlFinished", "${d.optString("title")} ${t(if (manga) "chapter" else "ep")} ${d.optString("ep")}"))
                if (state == "error") toast(t("dlFailed"))
                if (state != "cancelled") DownloadService.finished(app, id, t(if (state == "done") "dlNotifDone" else "dlFailed"), title)
                pump() // that show's next one
            }
        }
        jobs[id] = job
        job.invokeOnCompletion { jobs.remove(id, job) }
    }

    /** stops a download, or drops a waiting one */
    fun cancel(id: String) {
        val d = of(id) ?: return
        val st = d.optString("state")
        if (st != "active" && st != "queued" && st != "paused") return
        supersede(id)
        d.put("state", "cancelled").put("received", 0)
        DownloadService.active.remove(id)
        save()
        pump()
    }
    fun retry(id: String) { of(id)?.let { it.put("state", "paused") }; resume(id) } // the same: now, ahead of the show's others
    // one item resumed or retried: its show (and Pause all) no longer hold it back; its other paused items stay paused
    private fun unhold(show: String) {
        val prefs = Store["prefs"]
        if (!held(show)) return
        prefs.put("dlPaused", false)
        prefs.optJSONObject("dlHeld")?.put(show, false)
        Store.persist("prefs")
    }

    /** pause: an active transfer stops, a waiting one holds; resume: back in the queue */
    fun pause(id: String) {
        val d = of(id) ?: return
        val st = d.optString("state")
        if (st != "active" && st != "queued") return
        if (st == "active") { supersede(id); DownloadService.active.remove(id) }
        // ponytail: a stopped episode restarts from 0 when resumed (it's unzipped as it streams: no byte-range resume)
        d.put("state", "paused").put("received", 0)
        save()
        pump() // the show's next one, unless the show is held
    }
    /**
     * resuming one item starts it now: pausing it had let the show's next item start, and the resumed one only waited
     * behind it (queued, not downloading). That other one goes back in the queue, after it
     */
    fun resume(id: String) {
        val d = of(id)?.takeIf { it.optString("state") == "paused" } ?: return
        val show = d.optString("show")
        unhold(show)
        all().keys().asSequence().mapNotNull { of(it) }.filter { it.optString("show") == show && it.optString("state") == "active" }.forEach {
            supersede(it.getString("id")); DownloadService.active.remove(it.getString("id"))
            it.put("state", "queued").put("received", 0)
        }
        start(d, show)
        pump() // the service's hold and texts
    }
    /** a show's items, or everything (show null: Pause all / Resume all, which drops the shows' own choices) */
    fun hold(show: String?, on: Boolean) {
        val prefs = Store["prefs"]
        if (show == null) { prefs.put("dlPaused", on); prefs.remove("dlHeld") }
        else prefs.put("dlHeld", (prefs.optJSONObject("dlHeld") ?: JSONObject()).put(show, on))
        Store.persist("prefs")
        val items = all().keys().asSequence().mapNotNull { of(it) }.filter { show == null || it.optString("show") == show }.toList()
        for (d in items) if (on) { if (d.optString("state") in setOf("active", "queued")) pause(d.getString("id")) } else if (d.optString("state") == "paused") d.put("state", "queued")
        save()
        if (!on) pump()
    }
    /** the record and its file (an episode's .mp4, a chapter's folder), only ever inside the downloads folders */
    fun delete(id: String) {
        val d = of(id) ?: return
        supersede(id)
        DownloadService.active.remove(id)
        d.optString("file").takeIf { it.isNotEmpty() }?.let { f ->
            val roots = listOf(File(Store.shared, "Downloads"), File(app.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "MedAnime")).map { it.canonicalPath + File.separator }
            if (roots.any { File(f).canonicalPath.startsWith(it) }) File(f).deleteRecursively()
        }
        all().remove(id)
        save()
    }

    private fun askNotifications() { // the progress shows as a notification (Android 13+: hidden without this)
        val act = Net.activity
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(act, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    /** counts the bytes read, for progress against Content-Length */
    private class Counting(i: InputStream) : FilterInputStream(i) {
        @Volatile var count = 0L
        override fun read(): Int = super.read().also { if (it >= 0) count++ }
        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) count += it }
    }

    private fun get(url: String) = Net.client.newCall(Request.Builder().url(url).header("User-Agent", UA).build()).execute()

    // the chosen quality first, then best to worst if one fails to start
    private suspend fun episode(d: JSONObject, title: String) {
        val q = d.optString("quality")
        val links = Witanime.downloadLinks(d.getString("epPath")).filter { it.label == "mediafire" }
            .sortedBy { if (it.quality == q) -1 else Witanime.QUALITY.indexOf(it.quality) }
        if (links.isEmpty()) { withContext(Dispatchers.Main) { toast(t("dlNoHost")) }; throw IOException("no mediafire link") }
        for (l in links) {
            val url = try { Witanime.downloadUrl(l.token) } catch (e: CancellationException) { throw e } catch (e: Exception) { continue }
            val r = get(url)
            if (r.code >= 400) { r.close(); continue } // didn't start: the next quality
            val name = "${d.optString("title")} EP ${d.optString("ep")} ${l.quality}".replace(Regex("[\\\\/:*?\"<>|]+"), " ").trim()
            val file = File(dir().apply { mkdirs() }, "$name.mp4")
            val total = r.body!!.contentLength()
            ui { d.put("quality", l.quality).put("file", file.absolutePath).put("total", total) }
            coroutineContext.ensureActive() // paused meanwhile: not back in the notification
        val item = DownloadService.Item(title).also { it.total = total; DownloadService.active[d.getString("id")] = it }
            try {
                r.use {
                    val inp = Counting(r.body!!.byteStream())
                    ZipInputStream(inp).use { zip -> file.outputStream().use { out ->
                        zip.nextEntry ?: throw IOException("empty zip")
                        val buf = ByteArray(1 shl 16)
                        var sent = 0L
                        while (true) {
                            coroutineContext.ensureActive() // cancelled: stops here
                            val n = zip.read(buf); if (n <= 0) break
                            out.write(buf, 0, n)
                            if (System.currentTimeMillis() - sent > 1000) { // Android drops notification updates faster than this
                                sent = System.currentTimeMillis()
                                item.received = inp.count
                                ui { d.put("received", inp.count) }
                                DownloadService.update(app)
                            }
                        }
                    } }
                    ui { d.put("received", total) }
                }
            } catch (e: Throwable) { file.delete(); throw e }
            return
        }
        throw IOException("no link started")
    }

    /** a chapter: each page image into <downloads>/Manga/<series>/Chapter <n>/ */
    private suspend fun pages(d: JSONObject, title: String) {
        val c = Manga.chapter(d.getString("chapterId"))
        if (c.images.isEmpty()) throw IOException("no pages")
        val clean = { s: String -> s.replace(Regex("[\\\\/:*?\"<>|]+"), " ").trim() }
        val out = File(File(File(dir(), "Manga"), clean(d.optString("title"))), clean("Chapter ${d.optString("ep")}")).apply { mkdirs() }
        ui { d.put("total", c.images.size).put("file", out.absolutePath).put("meta", JSONObject().put("prev", c.prev).put("next", c.next)) } // to keep reading offline
        coroutineContext.ensureActive() // paused meanwhile: not back in the notification
        val item = DownloadService.Item(title).also { it.total = c.images.size.toLong(); DownloadService.active[d.getString("id")] = it }
        val files = mutableListOf<String>() // the download thread's own list: the record gets a copy on the main thread (saving it there meanwhile could crash)
        try {
            c.images.forEachIndexed { i, url ->
                coroutineContext.ensureActive()
                val ext = url.substringBefore('?').substringAfterLast('.', "jpg").let { if (it.length <= 4) it else "jpg" }
                val f = File(out, "%04d.%s".format(i + 1, ext))
                get(url).use { r ->
                    if (r.code == 404) return@use // pages the site lists but doesn't have: skipped, like its reader
                    if (r.code >= 400) throw IOException("HTTP ${r.code}")
                    r.body!!.byteStream().use { inp -> f.outputStream().use { inp.copyTo(it) } }
                    files += f.absolutePath
                }
                item.received = i + 1L
                val copy = JSONArray(files.toList())
                ui { d.put("received", i + 1).put("files", copy) }
                DownloadService.update(app)
            }
        } catch (e: Throwable) { out.deleteRecursively(); throw e }
    }
}
