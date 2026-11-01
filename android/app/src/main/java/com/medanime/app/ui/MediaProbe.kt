package com.medanime.app.ui

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.job
import okhttp3.OkHttpClient
import okhttp3.Request
import kotlin.coroutines.coroutineContext

/** A resolved URL is not proof of a video: hosts can return JSON, HTML, or a ZIP. */
internal fun isVideoResponse(status: Int, type: String, first: ByteArray): Boolean {
    if (status !in 200..299 || first.isEmpty()) return false
    if (type.contains("json", true) || type.startsWith("text/", true) || type.contains("zip", true)) return false
    val prefix = first.toString(Charsets.US_ASCII).trimStart()
    if (prefix.startsWith("{") || prefix.startsWith("[") || prefix.startsWith("<")) return false
    if (first.size >= 4 && first.take(4) == listOf<Byte>(80, 75, 3, 4)) return false
    return true
}

object MediaProbe {
    private val client = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
    @OptIn(kotlinx.coroutines.InternalCoroutinesApi::class)
    suspend fun video(url: String): String = withContext(Dispatchers.IO) {
        val call = client.newCall(Request.Builder().url(url).header("User-Agent", UA).header("Range", "bytes=0-3").build())
        val cancel = coroutineContext.job.invokeOnCompletion(onCancelling = true, invokeImmediately = true) { if (it != null) call.cancel() }
        try {
            call.execute().use { r ->
                coroutineContext.ensureActive()
                val body = r.body ?: throw IOException("empty media response")
                val source = body.source()
                source.request(4)
                val first = source.buffer.readByteArray(minOf(4L, source.buffer.size))
                if (!isVideoResponse(r.code, body.contentType()?.toString().orEmpty(), first))
                    throw IOException("video host refused playback (HTTP ${r.code})")
                url
            }
        } finally { cancel.dispose() }
    }
}
