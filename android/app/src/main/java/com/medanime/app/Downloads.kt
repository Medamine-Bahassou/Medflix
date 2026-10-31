package com.medanime.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
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
    fun busy() = all().keys().asSequence().any { of(it)?.optString("state") == "active" } // a show's next starts as one ends: no gap
    private fun dir() = if (Store.granted()) File(Store.shared, "Downloads") else File(app.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "MedAnime")

    /** on launch: what was cut off when the app last closed goes back in the queue */
    fun init(c: Context) {
        if (::app.isInitialized) return // the same process (a background check got here first, or the activity was recreated): those are still running
        app = c.applicationContext
        all().keys().asSequence().mapNotNull { of(it) }.filter { it.optString("state") == "active" }.forEach { it.put("state", "queued") }
        // the storage view's sizes, for downloads finished before they were kept: counted once, off the main thread (on the
        // phone's shared storage each file is a slow look, and a manga's chapters are thousands of pages: the page hung)
        val todo = all().keys().asSequence().mapNotNull { of(it) }.filter { it.optString("state") == "done" && !it.has("size") }.map { it.optString("id") to it.optString("file") }.toList()
        if (todo.isNotEmpty()) scope.launch {
            val sizes = todo.map { (id, f) -> id to disk(f) }
            withContext(Dispatchers.Main) { sizes.forEach { (id, n) -> of(id)?.put("size", n) }; save() }
        }
        // onto Wi-Fi or off it: the queue starts or holds (this fires on every signal change: only a change of metered counts)
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        app.getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(n: Network, c: NetworkCapabilities) {
                val m = !c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                if (m != metered) { metered = m; main.post { if (Store["prefs"].optBoolean("dlWifi")) pump() } }
            }
        })
        pump()
    }

    @Volatile private var metered: Boolean? = null // the network callback's word (asking Android can lag a switch), else asked
    /** Wi-Fi only (settings) and on mobile data: nothing downloads, so Download all can't use up a data plan (a phone's hotspot counts as data) */
    fun onData() = Store["prefs"].optBoolean("dlWifi") && (metered ?: app.getSystemService(ConnectivityManager::class.java).isActiveNetworkMetered)
    fun wifiOnly(on: Boolean) { Store["prefs"].put("dlWifi", on); Store.persist("prefs"); pump() }

    /** a finished download's room on disk: the .mp4 (the record's total is the zip's), or a chapter's pages; counted as it finishes (disk) */
    fun size(d: JSONObject) = d.optLong("size")
    private fun disk(path: String) = if (path.isEmpty()) 0L else File(path).let { f -> if (f.isDirectory) f.listFiles()?.sumOf { it.length() } ?: 0L else f.length() }
    fun free() = dir().apply { mkdirs() }.usableSpace

    private fun save() { Store.persist("downloads"); tick.intValue++ }
    private suspend fun ui(id: String, run: Int, f: (JSONObject) -> Unit): Boolean = withContext(Dispatchers.Main) {
        val d = of(id)?.takeIf { runs[id] == run && it.optString("state") == "active" } ?: return@withContext false
        f(d)
        tick.intValue++
        true
    }

    // paused: that show's own choice, else Pause all (app.js held)
    fun held(show: String) = Store["prefs"].optJSONObject("dlHeld")?.let { if (it.has(show)) it.optBoolean(show) else null }
        ?: Store["prefs"].optBoolean("dlPaused")

    private fun queue(id: String, rec: JSONObject, quiet: Boolean = false) {
        val cur = of(id)?.optString("state")
        if (cur == "active" || cur == "done") return if (quiet) Unit else toast(t(if (cur == "done") "dlDone" else "dlActive"))
        unhold(rec.optString("show"))
        all().put(id, rec.put("id", id).put("state", "queued").put("received", 0).put("total", 0))
        save()
        askNotifications()
        pump()
    }
    /** an episode: MediaFire's zip, unpacked into its .mp4 as it downloads; quality: the one picked (else the best there is) */
    fun episode(epPath: String, show: String, title: String, ep: String, poster: String, quality: String, quiet: Boolean = false) {
        queue(epPath, JSONObject().put("show", show).put("epPath", epPath).put("title", title).put("ep", ep).put("poster", poster).put("quality", quality).put("at", System.currentTimeMillis()), quiet)
        if (!quiet) toast(t(if (onData()) "dlWifiWait" else "dlPreparing"))
    }
    /** a series' chapters, oldest first: their page images */
    fun chapters(serieId: String, title: String, poster: String, chs: List<Ch>, quiet: Boolean = false) {
        var added = 0
        unhold("/manga/series/$serieId")
        for (c in chs) {
            val id = "manga:${c.id}"
            if (of(id)?.optString("state").let { it != null && it != "error" && it != "cancelled" }) continue
            all().put(id, JSONObject().put("id", id).put("kind", "manga").put("show", "/manga/series/$serieId").put("chapterId", c.id).put("title", title)
                .put("ep", c.n).put("poster", poster).put("state", "queued").put("received", 0).put("total", 0).put("at", System.currentTimeMillis() + added++))
        }
        save()
        if (!quiet) toast(if (added == 0) t("dlDone") else if (onData()) t("dlWifiWait") else t("dlQueuedN", added))
        askNotifications()
        pump()
    }

    /** starts the next waiting item of every show that has nothing downloading */
    @Synchronized fun pump() {
        val items = all().keys().asSequence().mapNotNull { of(it) }.toList()
        val wait = onData()
        if (wait) items.filter { it.optString("state") == "active" }.takeIf { it.isNotEmpty() }?.let { l -> // moved onto data mid-download: back in the queue
            l.forEach { val id = it.getString("id"); supersede(id); DownloadService.active.remove(id); it.put("state", "queued").put("received", 0) }
            save()
        }
        for ((show, l) in items.groupBy { it.optString("show") }) {
            if (wait || held(show) || l.any { it.optString("state") == "active" }) continue
            val d = l.filter { it.optString("state") == "queued" }.minByOrNull { it.optLong("at") } ?: continue
            start(d, show)
        }
        DownloadService.held = items.any { it.optString("state").let { s -> s == "queued" || s == "active" } }
        // the service's texts in the app's language
        DownloadService.labelActive = t("dlNotifActive"); DownloadService.labelMany = t("dlNotifMany"); DownloadService.labelPreparing = t(if (wait) "dlWifiWait" else "dlPreparing")
        DownloadService.labelPause = t("showPause"); DownloadService.labelCancel = t("cancel")
        if (DownloadService.held) DownloadService.start(app) else DownloadService.update(app)
    }

    private fun start(d: JSONObject, show: String) {
        val id = d.getString("id")
        val manga = d.optString("kind") == "manga"
        val epPath = d.optString("epPath")
        val chapterId = d.optString("chapterId")
        val rawTitle = d.optString("title")
        val ep = d.optString("ep")
        val quality = d.optString("quality")
        val title = "$rawTitle · ${t(if (manga) "chapter" else "episode")} $ep"
        d.put("state", "active").put("received", 0).put("total", 0)
        save()
        val run = (runs[id] ?: 0) + 1
        runs[id] = run
        val old = jobs[id]
        val job = scope.launch {
            withContext(kotlinx.coroutines.NonCancellable) { old?.join() } // the stopped transfer of the same file winds down first
            if (runs[id] != run) return@launch
            val item = DownloadService.Item(title)
            var why: String? = null // a reason worth telling (a locked chapter), not the generic failure
            val state = try { if (manga) pages(id, run, chapterId, rawTitle, ep, item) else episode(id, run, epPath, rawTitle, ep, quality, item); "done" }
                catch (e: Throwable) { android.util.Log.w("medflix", "download $id", e); if (e is Manga.Locked) why = e.message; if (e is CancellationException) "cancelled" else "error" }
                finally { DownloadService.active.remove(id, item) }
            if (runs[id] != run) return@launch // stopped: whoever stopped it set its state
            val file = withContext(Dispatchers.Main) { of(id)?.optString("file") ?: "" }
            val bytes = if (state == "done") disk(file) else 0L // here, on IO: the storage view only reads it
            withContext(Dispatchers.Main) {
                val cur = of(id) ?: return@withContext // deleted meanwhile
                if (runs[id] != run) return@withContext // stopped meanwhile
                cur.put("state", state)
                if (state == "done") cur.put("size", bytes)
                save()
                if (state == "done") toast(t("dlFinished", "$rawTitle ${t(if (manga) "chapter" else "ep")} $ep"))
                // a locked chapter: said once a minute, not once per chapter of a long series' Download all
                if (state == "error" && (why == null || System.currentTimeMillis() - lockedAt > 60_000)) { toast(why ?: t("dlFailed")); if (why != null) lockedAt = System.currentTimeMillis() }
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
    /** cancels all active and waiting downloads (from the notification) */
    fun cancelRunning() {
        all().keys().asSequence().mapNotNull { of(it) }.forEach { d ->
            val st = d.optString("state")
            if (st == "active" || st == "queued") {
                val id = d.optString("id")
                supersede(id); DownloadService.active.remove(id)
                d.put("state", "cancelled").put("received", 0)
            }
        }
        save()
        pump()
    }
    fun retry(id: String) { of(id)?.let { it.put("state", "paused") }; resume(id) } // the same: now, ahead of the show's others
    // a download asked for starts, Pause all or its show paused or not: only that show lets go (its paused items stay
    // paused, every other show stays held)
    private fun unhold(show: String) { if (held(show)) setHeld(show, false) }
    // one item or show resumed: its show (and Pause all) no longer hold it back; other paused shows stay held
    private fun setHeld(show: String?, on: Boolean) {
        val prefs = Store["prefs"]
        if (show == null) { prefs.put("dlPaused", on); prefs.remove("dlHeld") }
        else {
            val h = prefs.optJSONObject("dlHeld") ?: JSONObject().also { prefs.put("dlHeld", it) }
            if (!on && prefs.optBoolean("dlPaused")) {
                prefs.put("dlPaused", false)
                all().keys().asSequence().mapNotNull { of(it)?.optString("show") }.forEach { if (it != show && !h.has(it)) h.put(it, true) }
            }
            h.put(show, on)
        }
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
        if (held(show)) setHeld(show, false)
        if (onData()) { d.put("state", "queued"); save(); toast(t("dlWifiWait")); pump(); return } // starts once on Wi-Fi
        all().keys().asSequence().mapNotNull { of(it) }.filter { it.optString("show") == show && it.optString("state") == "active" }.forEach {
            supersede(it.getString("id")); DownloadService.active.remove(it.getString("id"))
            it.put("state", "queued").put("received", 0)
        }
        askNotifications()
        start(d, show)
        pump() // the service's hold and texts
    }
    /** a show's items, or everything (show null: Pause all / Resume all, which drops the shows' own choices) */
    fun hold(show: String?, on: Boolean) {
        setHeld(show, on)
        val items = all().keys().asSequence().mapNotNull { of(it) }.filter { show == null || it.optString("show") == show }.toList()
        for (d in items) {
            val id = d.optString("id")
            val st = d.optString("state")
            if (on && (st == "active" || st == "queued")) {
                if (st == "active") { supersede(id); DownloadService.active.remove(id) }
                d.put("state", "paused").put("received", 0)
            } else if (!on && st == "paused") d.put("state", "queued")
        }
        save()
        pump()
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
        pump()
    }

    private var lockedAt = 0L
    private var sentToSettings = false // once a run: not on every download
    fun askNotifications(why: String = "dlNotifAsk") { // the progress shows as a notification (Android 13+: hidden without this); also new episodes' (Alerts)
        if (!Net.hasWindow()) return // a background check (Alerts): no screen to ask on
        val act = Net.activity
        if (androidx.core.app.NotificationManagerCompat.from(act).areNotificationsEnabled()) return
        val prefs = Store["prefs"]
        // android shows its dialog until it's refused twice; after that (or when switched off in settings) only the settings page can turn them on
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && (!prefs.optBoolean("notifAsked") || ActivityCompat.shouldShowRequestPermissionRationale(act, Manifest.permission.POST_NOTIFICATIONS))) {
            prefs.put("notifAsked", true); Store.persist("prefs")
            ActivityCompat.requestPermissions(act, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        } else if (!sentToSettings) {
            sentToSettings = true
            toast(t(why))
            runCatching { act.startActivity(android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, act.packageName)) }
        }
    }

    /** counts the bytes read, for progress against Content-Length */
    private class Counting(i: InputStream) : FilterInputStream(i) {
        @Volatile var count = 0L
        override fun read(): Int = super.read().also { if (it >= 0) count++ }
        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) count += it }
    }

    private suspend fun <T> get(url: String, block: suspend (okhttp3.Response) -> T): T {
        val call = Net.client.newCall(Request.Builder().url(url).header("User-Agent", UA).build())
        val reg = coroutineContext[Job]?.invokeOnCompletion { if (it != null) call.cancel() } // abort socket on pause/cancel
        return try {
            call.execute().use { block(it) }
        } catch (e: IOException) {
            coroutineContext.ensureActive()
            throw e
        } finally {
            reg?.dispose()
        }
    }

    // the chosen quality first, then best to worst if one fails to start
    private suspend fun episode(id: String, run: Int, epPath: String, rawTitle: String, ep: String, quality: String, item: DownloadService.Item) {
        val links = Witanime.downloadLinks(epPath).filter { it.label == "mediafire" }
            .sortedBy { if (it.quality == quality) -1 else Witanime.QUALITY.indexOf(it.quality) }
        if (links.isEmpty()) { withContext(Dispatchers.Main) { toast(t("dlNoHost")) }; throw IOException("no mediafire link") }
        for (l in links) {
            coroutineContext.ensureActive()
            val url = try { Witanime.downloadUrl(l.token) } catch (e: CancellationException) { throw e } catch (e: Exception) { continue }
            val name = "$rawTitle EP $ep ${l.quality}".replace(Regex("[\\\\/:*?\"<>|]+"), " ").trim()
            val file = File(dir().apply { mkdirs() }, "$name.mp4")
            try {
                val started = get(url) { r ->
                    if (r.code >= 400) return@get false // didn't start: the next quality
                    val total = r.body!!.contentLength()
                    item.total = total
                    if (!ui(id, run) { it.put("quality", l.quality).put("file", file.absolutePath).put("total", total); DownloadService.active[id] = item })
                        throw CancellationException()
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
                                if (ui(id, run) { it.put("received", inp.count) }) DownloadService.update(app)
                            }
                        }
                    } }
                    ui(id, run) { it.put("received", total) }
                    true
                }
                if (!started) continue
            } catch (e: Throwable) { file.delete(); throw e }
            return
        }
        throw IOException("no link started")
    }

    /** a chapter: each page image into <downloads>/Manga/<series>/Chapter <n>/ */
    private suspend fun pages(id: String, run: Int, chapterId: String, rawTitle: String, ep: String, item: DownloadService.Item) {
        val cid = if (chapterId.matches(Regex("t\\d+"))) { // queued under a removed source's id: that chapter in the series now
            val sid = of(id)?.optString("show")?.substringAfterLast('/') ?: throw IOException("no chapter")
            Manga.full(sid).chs.find { it.n == Manga.chNum(ep) }?.id ?: throw IOException("no chapter")
        } else chapterId
        val c = Manga.chapter(cid)
        if (c.images.isEmpty()) throw IOException("no pages")
        val clean = { s: String -> s.replace(Regex("[\\\\/:*?\"<>|]+"), " ").trim() }
        val out = File(File(File(dir(), "Manga"), clean(rawTitle)), clean("Chapter $ep")).apply { mkdirs() }
        item.total = c.images.size.toLong()
        if (!ui(id, run) { it.put("total", c.images.size).put("file", out.absolutePath).put("meta", JSONObject().put("prev", c.prev).put("next", c.next)); DownloadService.active[id] = item })
            throw CancellationException()
        val files = mutableListOf<String>() // the download thread's own list: the record gets a copy on the main thread (saving it there meanwhile could crash)
        try {
            c.images.forEachIndexed { i, url ->
                coroutineContext.ensureActive()
                val ext = url.substringBefore('?').substringAfterLast('.', "jpg").let { if (it.length <= 4) it else "jpg" }
                val f = File(out, "%04d.%s".format(i + 1, ext))
                get(url) { r ->
                    if (r.code == 404) return@get // pages the site lists but doesn't have: skipped, like its reader
                    if (r.code >= 400) throw IOException("HTTP ${r.code}")
                    r.body!!.byteStream().use { inp -> f.outputStream().use { inp.copyTo(it) } }
                    files += f.absolutePath
                }
                item.received = i + 1L
                val copy = JSONArray(files.toList())
                if (ui(id, run) { it.put("received", i + 1).put("files", copy) }) DownloadService.update(app)
            }
        } catch (e: Throwable) { out.deleteRecursively(); throw e }
    }
}
