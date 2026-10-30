package com.medanime.app.ui

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import coil3.request.allowHardware
import coil3.toBitmap
import com.medanime.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

/**
 * New episodes and chapters of the titles the user follows (store.notify: path -> { title, poster, last }), and new films
 * (its "movies" entry: the latest films' paths), checked in the background by Android's JobScheduler and shown as notifications
 */
class Alerts : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartJob(p: JobParameters): Boolean {
        // started cold, without the app: what NativeActivity.onCreate sets up for the requests and the store
        Net.app = applicationContext
        Store.init(this)
        Pages.dir = File(filesDir, "pages")
        Net.wvUa // read here, on the main thread
        setImageLoader(this) // the posters, from the app's image cache when they're there
        scope.launch { runCatching { check(this@Alerts) }; jobFinished(p, false) }
        return true
    }

    override fun onStopJob(p: JobParameters) = true.also { scope.cancel() } // asked again at the next run

    companion object {
        private const val JOB = 7101
        private const val CHANNEL = "new_episodes"

        /** every hour or so, with a network; kept across reboots (on launch: a job already set isn't reset) */
        fun schedule(c: Context) {
            val js = c.getSystemService(JobScheduler::class.java)
            if (js.getPendingJob(JOB) != null) return
            js.schedule(JobInfo.Builder(JOB, ComponentName(c, Alerts::class.java)).setPeriodic(3600_000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build())
        }

        fun on(path: String) = Store["notify"].has(path)
        /** follow a title or stop: last is its newest episode or chapter now, so only later ones notify */
        fun toggle(path: String, title: String, poster: String, last: String, quiet: Boolean = false) {
            val n = Store["notify"]
            if (n.has(path)) n.remove(path) else n.put(path, JSONObject().put("path", path).put("title", title).put("poster", poster).put("last", last).put("at", System.currentTimeMillis()))
            Store.persist("notify")
            if (n.has(path)) com.medanime.app.Downloads.askNotifications("notifyAsk")
            if (!quiet) toast(if (n.has(path)) t("notifyAdded", title) else t("notifyRemoved"))
        }
        private val ui = kotlinx.coroutines.MainScope() // outlives the card menu, which closes on tap
        fun can(path: String) = path.startsWith("/anime/") || path.startsWith("/manga/series/") || Regex("^/cinema/(serie|season|episode)/").containsMatchIn(path)
        /** the card menu's bell */
        fun toggleCard(c: Card) { if (on(c.showPath)) toggle(c.showPath, c.title, c.poster, "") else follow(c.showPath, c.title, c.poster) }
        /**
         * follow with no episode list at hand (a card, My List), so the first check notes the newest. A series' show or episode
         * card follows a season, as its page does. quiet: added to My List, which says so itself
         */
        fun follow(path: String, title: String, poster: String, quiet: Boolean = false) = ui.launch {
            if (!Regex("^/cinema/(serie|episode)/").containsMatchIn(path)) return@launch if (!on(path)) toggle(path, title, poster, "", quiet) else Unit
            runCatching {
                var slug = path.removePrefix("/cinema/")
                var m = Cinema.movie(slug)
                if (slug.startsWith("episode/") && m.up.isNotEmpty()) { slug = m.up; m = Cinema.movie(slug) }
                // ponytail: the last season listed is taken as the newest; pick by number if a site lists them otherwise
                if (m.seasons.isNotEmpty() && m.seasons.none { it.path == "/cinema/$slug" }) { slug = m.seasons.last().path.removePrefix("/cinema/"); m = Cinema.movie(slug) }
                if (on("/cinema/$slug")) { if (!quiet) toast(t("notifyAdded", m.title)) } // its season already followed
                else toggle("/cinema/$slug", m.title, m.poster, m.episodes.lastOrNull()?.slug ?: "", quiet)
            }.onFailure { if (!quiet) toast(noNames(it.message)) }
        }
        fun moviesOn() = on("movies")
        fun toggleMovies() {
            val n = Store["notify"]
            if (n.has("movies")) n.remove("movies") else n.put("movies", JSONObject())
            Store.persist("notify")
            if (n.has("movies")) com.medanime.app.Downloads.askNotifications("notifyAsk")
        }

        // a title's newest episode or chapter: its id, and how the notification names it
        private suspend fun newest(path: String): Pair<String, String>? = when {
            path.startsWith("/manga/series/") -> Manga.full(path.substringAfterLast('/'), true).chs.firstOrNull()?.let { it.id to t("newCh", Manga.chNum(it.n)) } // newest first
            path.startsWith("/cinema/") -> Cinema.movie(path.removePrefix("/cinema/"), true).episodes.lastOrNull()?.let { it.slug to t("newEp", it.n) }
            else -> Witanime.details(path, true).first().episodes.lastOrNull()?.let { it.path to t("newEp", it.ep) }
        }

        suspend fun check(c: Context) {
            val n = Store["notify"]
            for (path in n.keys().asSequence().toList()) {
                val o = n.optJSONObject(path) ?: continue
                if (path == "movies") { runCatching { films(c, o) }; continue }
                val (id, label) = runCatching { newest(path) }.getOrNull() ?: continue // offline, or the site down: next time
                if (id == o.optString("last")) continue
                if (o.optString("last").isNotEmpty()) post(c, path, o.optString("title"), label, o.optString("poster"))
                o.put("last", id)
            }
            Store.persist("notify")
        }

        private suspend fun films(c: Context, o: JSONObject) {
            val items = Cinema.list("all", 1, true).items
            val old = o.optString("last").split('\n').toSet()
            val new = items.filter { it.path !in old }
            if (o.has("last") && new.isNotEmpty()) // the first check only notes what's there
                post(c, if (new.size == 1) new[0].path else "movies", if (new.size == 1) t("newMovie") else t("newMovies", new.size), new.joinToString(" · ") { it.title }, new[0].poster)
            o.put("last", items.joinToString("\n") { it.path })
        }

        // the poster as the notification's picture: a square from its top (a 2:3 poster's faces sit high), software (a hardware
        // bitmap can't be handed to the system). none if it can't be had: the notification goes without
        private suspend fun picture(c: Context, url: String): android.graphics.Bitmap? = if (url.isEmpty()) null else runCatching {
            val r = coil3.SingletonImageLoader.get(c).execute(coil3.request.ImageRequest.Builder(c).data(url).size(256).allowHardware(false).build())
            (r as? coil3.request.SuccessResult)?.image?.toBitmap()?.let { b -> val w = minOf(b.width, b.height); android.graphics.Bitmap.createBitmap(b, (b.width - w) / 2, (b.height - w) / 4, w, w) }
        }.getOrNull()

        private suspend fun post(c: Context, path: String, title: String, text: String, poster: String) {
            val nm = c.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, t("notifyTitle"), NotificationManager.IMPORTANCE_DEFAULT))
            val open = PendingIntent.getActivity(c, path.hashCode(), Intent(c, NativeActivity::class.java).putExtra("open", path),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            nm.notify(path, 1, NotificationCompat.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_stat_bell).setContentTitle(title).setContentText(text)
                .setLargeIcon(picture(c, poster)).setStyle(NotificationCompat.BigTextStyle().bigText(text)).setContentIntent(open).setAutoCancel(true).build())
        }

        /** where a notification's tap leads */
        fun screen(path: String) = if (path == "movies") Screen.CinemaBrowse("all") else screenFor(Card(path, "", "", "", "", "", "", null, path))
    }
}

/** the bell on a title's page: notify me of its new episodes or chapters */
@androidx.compose.runtime.Composable
fun androidx.compose.foundation.layout.FlowRowScope.NotifyButton(path: String, title: String, poster: String, last: String) {
    Store.version.intValue
    val on = Alerts.on(path)
    Action(if (on) t("notifying") else t("notify"), if (on) Ic.bellFill else Ic.bell, on) { Alerts.toggle(path, title, poster, last) }
}
