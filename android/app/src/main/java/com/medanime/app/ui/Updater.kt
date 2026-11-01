package com.medanime.app.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.medanime.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** the app's own updates: GitHub's latest release (npm run release tags it b + the build's stamp), installed by Android */
object Updater {
    class Release(val tag: String, val url: String)
    // the download's own: the sheet closed mid-way, it carries on (and Android's installer still opens)
    val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + Dispatchers.Main)
    private const val NOTE = 7301 // not the downloads' notification id

    /** a release's APK in the cache: kept once complete, so a later tap installs it without downloading it again */
    fun apk(tag: String) = File(Net.app.cacheDir, "update-$tag.apk")
    private fun installer(apk: File) = Intent(Intent.ACTION_VIEW)
        .setDataAndType(FileProvider.getUriForFile(Net.app, Net.app.packageName + ".fileprovider", apk), "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)

    /** the download's progress as a notification too (pct -1: size unknown, its bar spinning; null: gone); done: tap to install */
    @android.annotation.SuppressLint("MissingPermission") // checked: areNotificationsEnabled
    private fun note(pct: Int?, done: File? = null) {
        val c = Net.app
        val nm = androidx.core.app.NotificationManagerCompat.from(c)
        if (pct == null) return nm.cancel(NOTE)
        if (!nm.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) c.getSystemService(android.app.NotificationManager::class.java)
            .createNotificationChannel(android.app.NotificationChannel("update", t("updateTitle"), android.app.NotificationManager.IMPORTANCE_LOW)) // low: no sound
        // downloaded: it stays, its tap opens Android's installer (the installer itself can't open while the app is in the background)
        if (done != null) return nm.notify(NOTE, androidx.core.app.NotificationCompat.Builder(c, "update").setSmallIcon(com.medanime.app.R.drawable.ic_stat_download)
            .setContentTitle(t("updateReady")).setContentText(t("updateTap")).setAutoCancel(true)
            .setContentIntent(android.app.PendingIntent.getActivity(c, 1, installer(done), android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT)).build())
        val open = android.app.PendingIntent.getActivity(c, 0, Intent(c, NativeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), android.app.PendingIntent.FLAG_IMMUTABLE)
        nm.notify(NOTE, androidx.core.app.NotificationCompat.Builder(c, "update").setSmallIcon(com.medanime.app.R.drawable.ic_stat_download)
            .setContentTitle(t("updateDownloading")).setSubText(if (pct >= 0) "$pct%" else null).setProgress(100, pct.coerceAtLeast(0), pct < 0)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_PROGRESS).build())
    }

    /** a newer APK than this build, or null */
    suspend fun check(): Release? = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("https://api.github.com/repos/Medamine-Bahassou/Medflix/releases/latest")
            .header("User-Agent", UA).header("Accept", "application/vnd.github+json").build()
        val r = Net.client.newCall(req).execute().use { if (it.code != 200) return@withContext null; JSONObject(it.body!!.string()) }
        val assets = r.optJSONArray("assets")
        val url = (0 until (assets?.length() ?: 0)).map { assets!!.getJSONObject(it) }.find { it.optString("name").endsWith(".apk") }?.optString("browser_download_url")
        val tag = r.optString("tag_name")
        // both 12 digits (yyyymmddhhmm): compared as strings
        val newer = url != null && tag.filter(Char::isDigit) > BuildConfig.BUILD
        // an older release's APK (installed, or skipped for this one): no use any more
        Net.app.cacheDir.listFiles { f -> f.name.startsWith("update") && f.name.endsWith(".apk") && !(newer && f == apk(tag)) }?.forEach { it.delete() }
        if (!newer) note(null) // installed: its "tap to install" is done with
        if (newer) Release(tag, url!!) else null
    }

    /** that APK, downloaded by the app unless it already was (onPct: 0-100, or -1 when the size is unknown), then Android's installer on it */
    suspend fun install(u: Release, onPct: (Int) -> Unit) {
        val url = u.url
        val act = Net.activity
        if (!url.startsWith("https://github.com/Medamine-Bahassou/Medflix/releases/download/")) throw IOException("bad url") // only ever our own releases
        // Android asks once to allow installs from this app: its settings page opens, then the update is tapped again
        if (Build.VERSION.SDK_INT >= 26 && !act.packageManager.canRequestPackageInstalls()) {
            act.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.packageName)))
            throw IOException("allow installs")
        }
        val apk = apk(u.tag)
        if (!apk.exists()) withContext(Dispatchers.IO) {
            val part = File(apk.path + ".part") // renamed once complete: a cut-off download is never taken for the APK
            try {
                Net.client.newCall(Request.Builder().url(url).header("User-Agent", UA).build()).execute().use { r -> // follows GitHub's redirect to its file host
                    if (r.code != 200) throw IOException("HTTP ${r.code}")
                    val body = r.body!!
                    val size = body.contentLength()
                    var got = 0L; var pct = -2
                    body.byteStream().use { inp -> part.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = inp.read(buf); if (n < 0) break
                            out.write(buf, 0, n); got += n
                            val p = if (size > 0) (got * 100 / size).toInt() else -1
                            if (p != pct) { pct = p; withContext(Dispatchers.Main) { onPct(p); note(p) } }
                        }
                    } }
                    if (size > 0 && got != size) throw IOException("cut off")
                }
                if (!part.renameTo(apk)) throw IOException("rename")
            } catch (e: Exception) { part.delete(); throw e }
            finally { withContext(kotlinx.coroutines.NonCancellable + Dispatchers.Main) { note(null, apk.takeIf { it.exists() }) } } // failed: gone (a toast takes over)
        }
        act.startActivity(installer(apk))
    }
}
