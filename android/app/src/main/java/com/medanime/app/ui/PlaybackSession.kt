package com.medanime.app.ui

import android.content.Context
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject

internal fun autoPipEnabled(prefs: JSONObject): Boolean = prefs.optBoolean("autoPip", true)

/** One active player, shared by native PiP actions and the video's real playback events. */
internal class PlaybackControls {
    var paused = true
        private set
    private var command: ((Boolean) -> Unit)? = null
    private val observers = mutableSetOf<() -> Unit>()
    val available get() = command != null
    fun observe(observer: () -> Unit): () -> Unit {
        observers.add(observer); observer()
        return { observers.remove(observer) }
    }
    private fun changed() { observers.toList().forEach { it() } }
    fun report(paused: Boolean) {
        if (this.paused != paused) { this.paused = paused; changed() }
    }
    fun bind(initiallyPaused: Boolean, command: (Boolean) -> Unit): () -> Unit {
        this.command = command; paused = initiallyPaused; changed()
        return { if (this.command === command) { this.command = null; changed() } }
    }
    fun play(playing: Boolean) { command?.invoke(playing) } // events confirm the new state, including play() failures
}

/** Private checkpoints survive Android finishing a dismissed PiP activity. */
internal object PlaybackSession {
    val controls = PlaybackControls()
    private lateinit var prefs: android.content.SharedPreferences
    private val listeners = mutableSetOf<(Boolean) -> Unit>()
    var suspended = false
        private set

    fun init(context: Context) { prefs = context.getSharedPreferences("playback-session", Context.MODE_PRIVATE) }
    var fullscreen: Boolean
        get() = prefs.getBoolean("fullscreen", false)
        set(value) { prefs.edit().putBoolean("fullscreen", value).apply() }
    fun navigation(stack: List<Screen>?) {
        prefs.edit().apply { if (stack == null) remove("navigation") else putString("navigation", encodeScreens(stack)) }.apply()
    }
    fun navigation(): List<Screen> = runCatching { decodeScreens(prefs.getString("navigation", null).orEmpty()) }.getOrDefault(emptyList())
    fun server(key: String): String? = prefs.getString("server:$key", null)
    fun server(key: String, label: String, quality: String) {
        prefs.edit().putString("server:$key", "$label|$quality").apply()
    }
    fun position(key: String): JSONObject = runCatching { JSONObject(prefs.getString("video:$key", "{}")!!) }.getOrDefault(JSONObject())
    fun position(key: String, state: JSONObject) {
        val at = state.optDouble("time", -1.0)
        if (at.isFinite() && at >= 0) {
            prefs.edit().putString("video:$key", state.toString()).apply()
            if (!suspended && state.opt("paused") is Boolean) controls.report(state.getBoolean("paused"))
        }
    }
    fun observe(listener: (Boolean) -> Unit): () -> Unit {
        listeners.add(listener)
        listener(suspended)
        return { listeners.remove(listener) }
    }
    fun suspendPlayback(on: Boolean) {
        suspended = on
        listeners.toList().forEach { it(on) }
    }

    fun attach(view: WebView, key: String): () -> Unit {
        var unbind: (() -> Unit)? = null
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            unbind = controls.bind(position(key).optBoolean("paused", true)) { playing ->
                if (!suspended) view.evaluateJavascript("window.postMessage({medflixPlay:$playing}, '*');", null)
            }
            // The bridge accepts playback numbers only; it exposes no files, navigation or arbitrary native calls.
            WebViewCompat.addWebMessageListener(view, "medflixPosition", setOf("*")) { _, message, _, _, _ ->
                runCatching { JSONObject(message.data.orEmpty()) }.getOrNull()?.let { state ->
                    if (state.optDouble("duration", 0.0) > 0) position(key, state)
                }
            }
            WebViewCompat.addDocumentStartJavaScript(view, playbackScript(position(key), suspended), setOf("*"))
        }
        val unobserve = observe { on ->
            view.keepScreenOn = !on
            view.evaluateJavascript("window.postMessage({medflixSuspend:$on}, '*');", null)
        }
        return { unobserve(); unbind?.invoke() }
    }
}

internal fun encodeScreens(stack: List<Screen>): String = JSONArray().apply {
    stack.forEach { s -> put(JSONObject().apply {
        put("type", s.javaClass.simpleName)
        when (s) {
            is Screen.Grid -> { put("title", s.title); put("base", s.base) }
            is Screen.Search -> { put("q", s.q); put("kind", s.kind) }
            is Screen.Settings -> put("part", s.part)
            is Screen.Characters -> { put("names", JSONArray(s.names)); put("kind", s.kind); put("year", s.year); put("slug", s.slug) }
            is Screen.Title -> put("path", s.path)
            is Screen.Play -> put("epPath", s.epPath)
            is Screen.MangaBrowse -> put("query", JSONObject(s.query))
            is Screen.MangaSeries -> put("id", s.id)
            is Screen.MangaRead -> { put("cid", s.cid); put("title", s.title); put("chapter", s.chapter) }
            is Screen.CinemaBrowse -> put("cat", s.cat)
            is Screen.CinemaTitle -> { put("slug", s.slug); put("show", s.show) }
            is Screen.CinemaPlay -> put("slug", s.slug)
            is Screen.Downloads -> put("show", s.show)
            is Screen.Offline -> put("epPath", s.epPath)
            is Screen.Section -> put("name", s.name)
            is Screen.Trailer -> { put("url", s.url); put("title", s.title) }
            else -> Unit
        }
    }) }
}.toString()

internal fun decodeScreens(text: String): List<Screen> = JSONArray(text).let { a ->
    (0 until a.length()).map { i ->
        val j = a.getJSONObject(i)
        when (j.getString("type")) {
            "Home" -> Screen.Home
            "Anime" -> Screen.Anime
            "Grid" -> Screen.Grid(j.getString("title"), j.getString("base"))
            "Search" -> Screen.Search(j.getString("q"), j.getString("kind"))
            "MyList" -> Screen.MyList
            "Settings" -> Screen.Settings(j.getString("part"))
            "Characters" -> Screen.Characters(j.getJSONArray("names").let { n -> (0 until n.length()).map { n.getString(it) } }, j.getString("kind"), j.optString("year"), j.optString("slug"))
            "Title" -> Screen.Title(j.getString("path"))
            "Play" -> Screen.Play(j.getString("epPath"))
            "Manga" -> Screen.Manga
            "MangaBrowse" -> Screen.MangaBrowse(j.getJSONObject("query").let { q -> q.keys().asSequence().associateWith { q.getString(it) } })
            "MangaSeries" -> Screen.MangaSeries(j.getString("id"))
            "MangaRead" -> Screen.MangaRead(j.getString("cid"), j.optString("title"), j.optString("chapter"))
            "Cinema" -> Screen.Cinema
            "CinemaBrowse" -> Screen.CinemaBrowse(j.getString("cat"))
            "CinemaTitle" -> Screen.CinemaTitle(j.getString("slug"), j.getBoolean("show"))
            "CinemaPlay" -> Screen.CinemaPlay(j.getString("slug"))
            "Downloads" -> Screen.Downloads(j.getString("show"))
            "Offline" -> Screen.Offline(j.getString("epPath"))
            "Section" -> Screen.Section(j.getString("name"))
            "Hidden" -> Screen.Hidden
            "Schedule" -> Screen.Schedule
            "Trailer" -> Screen.Trailer(j.getString("url"), j.getString("title"))
            else -> error("Unknown screen")
        }
    }
}

/** Runs in every frame, including cross-origin hosts; no attempt to read their DOM from the wrapper. */
internal fun playbackScript(saved: JSONObject, suspended: Boolean): String = """
(() => {
  const saved = $saved;
  let suspended = $suspended;
  const videos = new WeakMap();
  let last = 0;
  function report(v, force) {
    if (!Number.isFinite(v.duration) || v.duration <= 0 || suspended) return;
    if (!force && Date.now() - last < 500) return;
    last = Date.now();
    window.medflixPosition?.postMessage(JSON.stringify({time:v.currentTime, duration:v.duration,
      paused:v.paused, rate:v.playbackRate, volume:v.volume, muted:v.muted}));
  }
  function prepare(v) {
    if (!videos.has(v)) videos.set(v, {restored:false, playing:false});
    const state = videos.get(v);
    if (state.restored || !Number.isFinite(v.duration) || v.duration <= 0) return;
    state.restored = true;
    if (saved.duration > 0 && Math.abs(saved.duration - v.duration) < Math.max(2, v.duration * .02)) {
      v.currentTime = Math.min(saved.time || 0, Math.max(0, v.duration - .1));
      if (saved.rate > 0 && saved.rate <= 16) v.playbackRate = saved.rate;
      if (saved.volume >= 0 && saved.volume <= 1) v.volume = saved.volume;
      v.muted = !!saved.muted;
      state.playing = !saved.paused;
      if (saved.paused || suspended) v.pause();
      else v.play().catch(() => {});
    } else if (suspended) { state.playing = !v.paused; v.pause(); }
  }
  ['loadedmetadata','durationchange','timeupdate','playing','pause','ratechange','volumechange','ended'].forEach(name =>
    addEventListener(name, e => {
      const v = e.target;
      if (v.tagName !== 'VIDEO') return;
      prepare(v);
      if (suspended) { if (!v.paused) v.pause(); return; }
      report(v, name !== 'timeupdate');
    }, true));
  addEventListener('message', e => {
    if (e.source !== window && e.source !== parent) return;
    const playing = e.data?.medflixPlay;
    if (typeof playing === 'boolean') {
      if (suspended) return;
      document.querySelectorAll('video').forEach(v => {
        prepare(v);
        if (playing) v.play().then(() => report(v, true)).catch(() => report(v, true));
        else { v.pause(); report(v, true); }
      });
      for (let i = 0; i < frames.length; i++) frames[i].postMessage(e.data, '*');
      return;
    }
    const on = e.data?.medflixSuspend;
    if (typeof on !== 'boolean') return;
    document.querySelectorAll('video').forEach(v => {
      prepare(v);
      const state = videos.get(v);
      if (on && !suspended) { report(v, true); state.playing = !v.paused; }
    });
    const changed = suspended !== on;
    suspended = on;
    document.querySelectorAll('video').forEach(v => {
      if (on) v.pause(); else if (changed && videos.get(v)?.playing) v.play().catch(() => {});
    });
    for (let i = 0; i < frames.length; i++) frames[i].postMessage(e.data, '*');
  });
})();
""".trimIndent()
