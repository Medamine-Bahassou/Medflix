package com.medanime.app.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

const val SITE = "https://witanime.site"

class Resp(val status: Int, val url: String, val body: String, val headers: Map<String, String>) {
    fun header(name: String) = headers.entries.firstOrNull { it.key.equals(name, true) }?.value
}

/** the same requests mobile.js makes, natively: one OkHttp client sharing the WebView's cookies */
object Net {
    lateinit var activity: Activity
    lateinit var app: android.content.Context // also set by a background check (Alerts), which runs with no activity
    // a site's page needs the app's window: a background check's request fails instead
    fun hasWindow() = ::activity.isInitialized && !activity.isDestroyed
    // witanime sits behind Cloudflare: talk to it as the WebView, the browser its cookies were earned in
    val wvUa: String by lazy { WebSettings.getDefaultUserAgent(app) }
    // witanime's API 404s without a client-hint header
    val ch: String by lazy { "\"Chromium\";v=\"${Regex("Chrome/(\\d+)").find(wvUa)?.groupValues?.get(1) ?: "138"}\"" }
    // Cloudflare's cookies, earned in a WebView, go with every native request too, and the sites' own go back to the WebViews.
    // Also kept here: on a fresh install the WebView's store dropped witanime's session cookie between the episode page and
    // its servers request (no WebView had run yet), and the site answered with no servers
    private val jar = java.util.concurrent.ConcurrentHashMap<String, Cookie>() // domain|path|name -> cookie
    private fun webCookies() = runCatching { CookieManager.getInstance() }.getOrNull() // none in JVM tests (CinemaTest)
    private val cookies = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = cookies.forEach {
            jar["${it.domain}|${it.path}|${it.name}"] = it
            webCookies()?.setCookie(url.toString(), it.toString())
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val mine = jar.values.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() }
            val names = mine.map { it.name }.toSet()
            return mine + (webCookies()?.getCookie(url.toString())?.split("; ")?.mapNotNull { Cookie.parse(url, it) }?.filter { it.name !in names } ?: emptyList())
        }
    }
    // some networks' DNS doesn't know (or blocks) a site: then ask Cloudflare's DNS over HTTPS, at an IP so it needs no lookup itself
    private val dns = object : okhttp3.Dns {
        private val doh by lazy { OkHttpClient.Builder().callTimeout(8, TimeUnit.SECONDS).build() }
        override fun lookup(hostname: String): List<java.net.InetAddress> = try { okhttp3.Dns.SYSTEM.lookup(hostname) } catch (e: java.net.UnknownHostException) {
            runCatching {
                val a = doh.newCall(Request.Builder().url("https://1.1.1.1/dns-query?name=$hostname&type=A").header("Accept", "application/dns-json").build())
                    .execute().use { JSONObject(it.body!!.string()).optJSONArray("Answer") }
                (0 until (a?.length() ?: 0)).map { a!!.getJSONObject(it) }.filter { it.optInt("type") == 1 }.map { java.net.InetAddress.getByName(it.getString("data")) }
            }.getOrNull()?.ifEmpty { null } ?: throw e // offline: the system's error
        }
    }
    val client: OkHttpClient = OkHttpClient.Builder().cookieJar(cookies).dns(dns)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()

    private fun challenged(r: Resp) = r.status == 403 || r.status == 503
    // Cloudflare's own check: marked by a header, or its challenge page ("Just a moment…") (mobile.js cfCheck)
    private fun cfCheck(r: Resp) = r.header("cf-mitigated") == "challenge" || (challenged(r) && Regex("<title>\\s*Just a moment|_cf_chl_opt|cf-chl-|challenge-form", RegexOption.IGNORE_CASE).containsMatchIn(r.body))
    // the movie sites hop domains (egydead.space sends on to the current one)
    private val ED_RE = Regex("^https://([a-z0-9-]+\\.)*(egydead|myseed|arabseed)\\.[a-z]+/")
    // olympus staff's pages sit behind Cloudflare too
    private const val OLY = "https://olympustaff.com"
    private fun site(url: String) = if (url.startsWith(SITE)) "witanime" else if (url.startsWith("$OLY/")) "olympustaff" else ED_RE.find(url)?.groupValues?.get(2)
    // site -> the origin its requests go through a real page on, once Cloudflare refused our native client there
    private val via = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val pages = java.util.concurrent.ConcurrentHashMap<String, SitePage>()
    fun unblock() { via["witanime"] = SITE } // the "verify" button: witanime through its page from now on

    /**
     * GET or POST (an empty one), with witanime's 429 retry; through the site's page once Cloudflare refuses us (mobile.js http).
     * asPlayer: asked as the player's WebView asks, for links that only play in the browser that got them (myseed's)
     */
    suspend fun fetch(url: String, headers0: Map<String, String> = emptyMap(), post: Boolean = false, stopAt: String = "", redirects: Boolean = true, asPlayer: Boolean = false, form: Map<String, String>? = null, json: String? = null): Resp {
        // the latest-episodes pager 404s unless it looks like the home page's own call (mobile.js): Origin, or X-Requested-With
        val headers = if (url.startsWith("$SITE/new-episodes")) mapOf("Accept" to "application/json", "Referer" to "$SITE/", "Origin" to SITE, "X-Requested-With" to "XMLHttpRequest") + headers0 else headers0
        var i = 0
        while (true) {
            val key = site(url)
            val origin = key?.let { via[it] }
            // the sites at one fixed host: any refusal of our native client sends them through their page, not just Cloudflare's check
            // (a phone's connection may get a plain block, or be dropped, where a browser gets through)
            val home = if (key == "witanime") SITE else if (key == "olympustaff") OLY else null
            val r = if (origin != null && redirects) pages.getOrPut(origin) { SitePage(origin) }.fetch(origin + url.replace(Regex("^https://[^/]+"), ""), if (post) "POST" else "GET", headers, stopAt)
            else try { native(url, headers, post, redirects, stopAt, asPlayer, form, json) } catch (e: IOException) {
                if (home == null || origin != null) throw e
                via[key!!] = home; continue // a connection that stalls or drops for our native client: through the page
            }
            if (origin == null && redirects && home != null && challenged(r)) { via[key!!] = home; continue }
            if (origin == null && redirects && key != null && home == null && cfCheck(r)) { via[key] = java.net.URI(r.url).let { "${it.scheme}://${it.host}" }; continue }
            if (r.status != 429 || i == 3) return r
            delay((r.header("retry-after")?.toLongOrNull() ?: (1L shl i)) * 1000) // see main.js
            i++
        }
    }

    /** closes Cloudflare's check where it's up over the app (back) */
    fun dropChecks() = pages.values.forEach { it.dropIfChecking() }

    private suspend fun native(url: String, headers: Map<String, String>, post: Boolean, redirects: Boolean, stopAt: String, asPlayer: Boolean, form: Map<String, String>?, json: String? = null) = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url)
            .header("User-Agent", if (url.startsWith(SITE) || asPlayer) wvUa else UA).header("Accept-Language", "ar,en;q=0.8")
            .apply { headers.forEach { (k, v) -> header(k, v) } }
            .apply { if (json != null) post(json.toRequestBody("application/json".toMediaType())) else if (form != null) post(okhttp3.FormBody.Builder().apply { form.forEach { (k, v) -> add(k, v) } }.build()) else if (post) post(ByteArray(0).toRequestBody()) }.build() // form: MyCima's search
        val c = if (redirects) client else client.newBuilder().followRedirects(false).followSslRedirects(false).build()
        val call = c.newCall(req)
        val reg = coroutineContext[kotlinx.coroutines.Job]?.invokeOnCompletion { if (it != null) call.cancel() } // abort socket on pause/back
        try {
            call.execute().use { r ->
                val body = r.body ?: return@use Resp(r.code, r.request.url.toString(), "", r.headers.toMap())
                val text = if (stopAt.isEmpty()) body.string() else { // stop reading once it matches (an episode page is ~3MB; its csrf token is in <head>)
                    val re = Regex(stopAt); val src = body.source(); val sb = StringBuilder()
                    // ponytail: a chunk may end mid-character; only the ASCII token is read from it
                    while (!re.containsMatchIn(sb) && src.request(1)) sb.append(src.buffer.readUtf8())
                    sb.toString()
                }
                Resp(r.code, r.request.url.toString(), text, r.headers.toMap())
            }
        } catch (e: IOException) {
            if (coroutineContext[kotlinx.coroutines.Job]?.isActive == false) throw kotlinx.coroutines.CancellationException()
            throw e
        } finally {
            reg?.dispose()
        }
    }

    val checking = mutableStateOf(false) // Cloudflare's check is over the app (back closes it)
}

const val UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36"

/**
 * a site (witanime, the movie sites) through a hidden WebView sitting on it (DownloaderPlugin's Site, in Kotlin): its requests run as fetch()
 * there, with the site's cookies and Chrome's own network stack. Cloudflare's check, if any, comes up over the app.
 */
class SitePage(private val origin: String) {
    private val home = "$origin/robots.txt" // a few KB of text, no scripts or ads
    private var view: WebView? = null
    private var ready = false
    private var failed: String? = null // the page itself didn't load (no DNS, no connection)
    private val lock = Mutex()
    private var ids = 0

    private suspend fun eval(js: String) = kotlinx.coroutines.suspendCancellableCoroutine { c -> view?.evaluateJavascript(js) { if (c.isActive) c.resume(it) } ?: c.resume("null") }

    private fun full(on: Boolean) {
        view?.let { it.alpha = if (on) 1f else 0f; it.isFocusable = on; it.isFocusableInTouchMode = on }
        Net.checking.value = on
    }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun ensure() = lock.withLock {
        if (ready) return@withLock
        if (!Net.hasWindow()) throw IOException("no window")
        val v = view ?: object : WebView(Net.activity) {
            // always full screen so the check never loads at 1px and zooms when resized; hidden by alpha, touches pass through
            override fun dispatchTouchEvent(e: android.view.MotionEvent) = alpha > 0f && super.dispatchTouchEvent(e)
        }.also { v ->
            view = v
            v.settings.javaScriptEnabled = true
            v.settings.domStorageEnabled = true
            v.settings.textZoom = 100
            CookieManager.getInstance().setAcceptThirdPartyCookies(v, true) // Cloudflare's box is a challenges.cloudflare.com frame
            v.setBackgroundColor(Color.BLACK)
            v.webViewClient = object : WebViewClient() { // the page stays on its site: an ad can't take it away
                override fun shouldOverrideUrlLoading(w: WebView, r: WebResourceRequest) = r.isForMainFrame && !r.url.toString().startsWith("$origin/")
                override fun onRenderProcessGone(w: WebView, d: android.webkit.RenderProcessGoneDetail) = true.also { drop() }
                override fun onReceivedError(w: WebView, r: WebResourceRequest, e: android.webkit.WebResourceError) { if (r.isForMainFrame) failed = e.description.toString() }
            }
            full(false)
            val decor = Net.activity.window.decorView as ViewGroup
            decor.addView(v, FrameLayout.LayoutParams(-1, -1))
            v.layout(0, 0, decor.width, decor.height)
        }
        failed = null
        v.loadUrl(home)
        val start = System.currentTimeMillis()
        try {
            while (true) { // robots.txt itself showing (plain text): through. Cloudflare's check is an HTML page in its place
                delay(500)
                if (view == null) throw IOException("check closed")
                val at = eval("location.href === ${JSONObject.quote(home)} && document.contentType === 'text/plain' ? 'ok'" +
                    " : window._cf_chl_opt || document.querySelector('#challenge-form, script[src*=\"challenges.cloudflare.com\"]') ? 'check' : document.readyState")
                if (at == "\"ok\"") break
                failed?.let { drop(); throw IOException(it) } // e.g. net::ERR_NAME_NOT_RESOLVED: no check is coming, only Chromium's (unreadable) error page
                val waited = System.currentTimeMillis() - start
                if (waited > 90_000) { drop(); throw IOException("challenge not passed") }
                if (at == "\"check\"" && waited > 1500) full(true) // over the app, so a tap on its box can pass it
                if (at == "\"complete\"" && waited > 15_000) { drop(); throw IOException("site page not reached") } // loaded, but neither the file nor a check (a block page)
            }
            ready = true
        } finally {
            full(false) // never leave the full-screen WebView over the app when a request is cancelled
        }
    }

    fun dropIfChecking() { if (view != null && !ready) drop() }

    /** back while the check is up: close it (its requests fail, the next one asks again) */
    fun drop() {
        view?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
        view = null; ready = false; Net.checking.value = false
    }

    suspend fun fetch(url: String, method: String, headers: Map<String, String>, stopAt: String): Resp = withContext(Dispatchers.Main) {
        ensure()
        val id = (++ids).toString()
        val h = JSONObject(headers.filterKeys { !Regex("^(user-agent|referer|cookie|sec-|accept-language)", RegexOption.IGNORE_CASE).containsMatchIn(it) }) // the browser sets these
        val q = JSONObject.quote(id)
        eval("(async () => { const out = v => (window.__med = window.__med || {})[$q] = JSON.stringify(v); try {" +
            "const r = await fetch(${JSONObject.quote(url)}, { method: ${JSONObject.quote(method)}, headers: $h, credentials: 'include' });" +
            // stopAt: stop reading once it matches (an episode page is ~3MB; its csrf token is in <head>)
            "const re = ${JSONObject.quote(stopAt)} && new RegExp(${JSONObject.quote(stopAt)}), rd = r.body.getReader(), dec = new TextDecoder(); let t = '';" +
            "for (;;) { const { done, value } = await rd.read(); if (done) break; t += dec.decode(value, { stream: true }); if (re && re.test(t)) { rd.cancel(); break; } }" +
            "out({ status: r.status, url: r.url, data: t, headers: { 'retry-after': r.headers.get('retry-after') || '' } });" +
            "} catch (e) { out({ error: String(e) }); } })()")
        withTimeout(120_000) {
            while (true) { // the result is polled for rather than handed over by a JavascriptInterface, which a bot check could spot
                delay(150)
                val v = eval("(() => { const m = window.__med || {}, r = m[$q]; delete m[$q]; return r === undefined ? null : r; })()")
                val r = JSONArray("[$v]").get(0)
                if (r == JSONObject.NULL) { if (view == null) throw IOException("check closed"); continue }
                val o = JSONObject(r as String)
                if (o.has("error")) throw IOException(o.getString("error"))
                val hs = o.getJSONObject("headers")
                return@withTimeout Resp(o.getInt("status"), o.getString("url"), o.getString("data"), hs.keys().asSequence().associateWith { hs.getString(it) })
            }
            @Suppress("UNREACHABLE_CODE") error("")
        }
    }
}

/**
 * Every page and API answer the app reads, kept 90 days and shown from disk at once (scraper.js load()): the site is asked
 * again at most once a minute per page. Offline, the saved copy is all there is.
 */
object Pages {
    private const val KEEP = 90 * 24 * 3600_000L
    private const val RECHECK = 60_000L
    private val checked = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val bg = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + Dispatchers.IO)
    lateinit var dir: java.io.File

    const val DAY = 24 * 3600_000L
    private fun file(key: String) = java.io.File(dir, java.security.MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) })
    private fun saved(key: String) = file(key).takeIf { it.isFile && System.currentTimeMillis() - it.lastModified() < KEEP }?.readText()
    // the file's time too: a page fetched just before the app restarted isn't asked again at once
    private fun due(key: String, every: Long = RECHECK) = System.currentTimeMillis() - maxOf(checked[key] ?: 0, file(key).lastModified()) >= every

    // body: a POST (AniList's and IMDb's GraphQL), cached under its query as well as its address
    private suspend fun fresh(url: String, key: String = url, body: String? = null, headers: Map<String, String> = emptyMap()): String {
        checked[key] = System.currentTimeMillis()
        val r = if (body != null) Net.fetch(url, headers, json = body) else Net.fetch(url, headers)
        if (r.status >= 400) throw IOException("HTTP ${r.status} ${java.net.URI(url).path}")
        dir.mkdirs()
        file(key).writeText(r.body) // rewritten even when unchanged: its time is when the site last confirmed it
        return r.body
    }

    /** the saved copy, then the site's answer if it changed: a screen showing one page redraws with it */
    fun flow(url: String, force: Boolean = false) = flow {
        val hit = if (force) null else saved(url)
        if (hit != null) { emit(hit); if (!due(url)) return@flow }
        val new = try { fresh(url) } catch (e: Exception) { if (hit != null) return@flow else throw e } // offline: keep the saved copy
        if (new != hit) emit(new)
    }.flowOn(Dispatchers.IO)

    /** one answer for pages built from several: the saved copy at once (asked again behind it, for next time), else the site's */
    // every: how often it's asked again (ratings and cast lists hardly change: a day)
    suspend fun load(url: String, force: Boolean = false, body: String? = null, headers: Map<String, String> = emptyMap(), every: Long = RECHECK): String = withContext(Dispatchers.IO) {
        val key = if (body == null) url else "$url\n$body"
        val hit = if (force) null else saved(key)
        if (hit != null) { if (due(key, every)) bg.launch { runCatching { fresh(url, key, body, headers) } }; return@withContext hit }
        try { fresh(url, key, body, headers) } catch (e: Exception) { saved(key) ?: throw e }
    }

    // expired copies (saved() already passes over them), deleted once at launch, else the folder only grows
    fun prune() = bg.launch { dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() >= KEEP) it.delete() } }
    fun size() = dir.listFiles()?.sumOf { it.length() } ?: 0L
    fun clear() { dir.listFiles()?.forEach { it.delete() }; checked.clear() }

}
