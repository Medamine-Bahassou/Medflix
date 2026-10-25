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

    /** a newer APK than this build, or null */
    suspend fun check(): Release? = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("https://api.github.com/repos/Medamine-Bahassou/Medflix/releases/latest")
            .header("User-Agent", UA).header("Accept", "application/vnd.github+json").build()
        val r = Net.client.newCall(req).execute().use { if (it.code != 200) return@withContext null; JSONObject(it.body!!.string()) }
        val assets = r.optJSONArray("assets")
        val url = (0 until (assets?.length() ?: 0)).map { assets!!.getJSONObject(it) }.find { it.optString("name").endsWith(".apk") }?.optString("browser_download_url")
        val tag = r.optString("tag_name")
        // both 12 digits (yyyymmddhhmm): compared as strings
        if (url != null && tag.filter(Char::isDigit) > BuildConfig.BUILD) Release(tag, url) else null
    }

    /** that APK, downloaded by the app (onPct: 0-100, or -1 when the size is unknown), then Android's installer on it */
    suspend fun install(url: String, onPct: (Int) -> Unit) {
        val act = Net.activity
        if (!url.startsWith("https://github.com/Medamine-Bahassou/Medflix/releases/download/")) throw IOException("bad url") // only ever our own releases
        // Android asks once to allow installs from this app: its settings page opens, then the update is tapped again
        if (Build.VERSION.SDK_INT >= 26 && !act.packageManager.canRequestPackageInstalls()) {
            act.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.packageName)))
            throw IOException("allow installs")
        }
        val apk = File(act.cacheDir, "update.apk")
        withContext(Dispatchers.IO) {
            try {
                Net.client.newCall(Request.Builder().url(url).header("User-Agent", UA).build()).execute().use { r -> // follows GitHub's redirect to its file host
                    if (r.code != 200) throw IOException("HTTP ${r.code}")
                    val body = r.body!!
                    val size = body.contentLength()
                    var got = 0L; var pct = -2
                    body.byteStream().use { inp -> apk.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = inp.read(buf); if (n < 0) break
                            out.write(buf, 0, n); got += n
                            val p = if (size > 0) (got * 100 / size).toInt() else -1
                            if (p != pct) { pct = p; withContext(Dispatchers.Main) { onPct(p) } }
                        }
                    } }
                    if (size > 0 && got != size) throw IOException("cut off")
                }
            } catch (e: Exception) { apk.delete(); throw e }
        }
        val uri = FileProvider.getUriForFile(act, act.packageName + ".fileprovider", apk)
        act.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
