package com.medanime.app.ui

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.medanime.app.R
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * a chapter read aloud by the phone's own speech engine, paragraph by paragraph, on into the next chapter. It runs here, not in
 * the reader: with the screen off Compose stops recomposing, so a screen couldn't carry it on to the next chapter
 */
object ReadAloud {
    data class Now(val novel: String, val title: String, val poster: String, val c: NovelChapter, val para: Int, val playing: Boolean)
    var now by mutableStateOf<Now?>(null)
        private set
    var speed by mutableFloatStateOf(1f)
        private set
    var sleepAt by mutableLongStateOf(0L) // stops at the end of the paragraph being read once it's past this time
    private var tts: TextToSpeech? = null
    private var ready = false
    private var gen = 0 // each speak's own: what a stopped one reports afterwards is ignored
    private var ducked = false // paused for a call or another app's sound: back when it's over
    private val main = Handler(Looper.getMainLooper())
    private val scope = MainScope()
    private val audio get() = Net.app.getSystemService(AudioManager::class.java)
    private val focus = AudioManager.OnAudioFocusChangeListener { c ->
        main.post {
            when (c) {
                AudioManager.AUDIOFOCUS_LOSS -> pause()
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> if (now?.playing == true) { ducked = true; pause() }
                AudioManager.AUDIOFOCUS_GAIN -> if (ducked) { ducked = false; resume() }
            }
        }
    }
    @Suppress("DEPRECATION") private fun takeFocus() = audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    @Suppress("DEPRECATION") private fun dropFocus() = audio.abandonAudioFocus(focus)

    fun start(novel: String, title: String, poster: String, c: NovelChapter, from: Int) {
        speed = Store["prefs"].optDouble("nvTtsSpeed", 1.0).toFloat()
        now = Now(novel, title, poster, c, from.coerceIn(0, (c.paras.size - 1).coerceAtLeast(0)), true)
        takeFocus()
        if (tts == null) {
            tts = TextToSpeech(Net.app) { status -> if (status == TextToSpeech.SUCCESS) setUp() else fail("ttsNone") }
            if (now == null) { tts?.shutdown(); tts = null } // no engine at all: that's said from inside the line above, before tts was set
        } else if (ready) speak()
    }
    private fun fail(why: String) { toast(t(why)); stop() }
    private fun setUp() {
        val e = tts ?: return
        // no Arabic voice on this phone: Android's own page to get one
        if (e.setLanguage(Locale("ar")) < TextToSpeech.LANG_AVAILABLE) {
            runCatching { Net.activity.startActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)) }
            return fail("ttsNoArabic")
        }
        Store["prefs"].optString("nvTtsVoice").takeIf { it.isNotEmpty() }?.let { n -> voices().find { it.name == n }?.let { e.voice = it } }
        e.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String) {}
            override fun onDone(id: String) { main.post { if (id == "$gen") advance() } }
            @Deprecated("") override fun onError(id: String) { main.post { if (id == "$gen") fail("ttsNone") } }
        })
        ready = true
        // only now: a service told to start and stopped at once (no voice to read with) crashes the app
        runCatching { ContextCompat.startForegroundService(Net.app, Intent(Net.app, ReadAloudService::class.java)) }
        speak()
    }
    private fun speak() {
        val n = now?.takeIf { it.playing } ?: return
        val e = tts?.takeIf { ready } ?: return
        gen++
        e.setSpeechRate(speed)
        val parts = Novels.speechParts(n.c.paras.getOrNull(n.para).orEmpty())
        if (parts.isEmpty()) return advance()
        parts.forEachIndexed { i, s -> e.speak(s, if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, if (i == parts.lastIndex) "$gen" else "part") }
    }
    private fun advance() {
        val n = now ?: return
        if (sleepAt in 1 until System.currentTimeMillis()) { sleepAt = 0; pause(); return }
        if (n.para + 1 < n.c.paras.size) return moveTo(n.para + 1)
        Novels.finished(n.c)
        val next = n.c.next ?: return fail("nvFinished")
        scope.launch {
            try {
                val c = Novels.chapter(n.novel, next)
                if (now?.c?.id != n.c.id) return@launch // stopped or moved meanwhile
                Novels.opened(n.novel, n.title, n.poster, c)
                now = n.copy(c = c, para = 0)
                ReadAloudService.refresh()
                speak()
            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { fail("unreachable") }
        }
    }
    private fun moveTo(para: Int) {
        val n = now ?: return
        now = n.copy(para = para)
        Novels.keep(n.novel, n.c.slug, para.toDouble())
        speak()
    }
    /** a paragraph on or back; to a paragraph of this chapter */
    fun skip(d: Int) { now?.let { moveTo((it.para + d).coerceIn(0, (it.c.paras.size - 1).coerceAtLeast(0))) } }
    fun seek(para: Int) { now?.let { moveTo(para.coerceIn(0, (it.c.paras.size - 1).coerceAtLeast(0))) } }
    fun pause() {
        val n = now?.takeIf { it.playing } ?: return
        gen++; tts?.stop()
        now = n.copy(playing = false)
        ReadAloudService.refresh()
    }
    fun resume() {
        val n = now?.takeIf { !it.playing } ?: return
        now = n.copy(playing = true)
        takeFocus(); ReadAloudService.refresh(); speak()
    }
    fun toggle() { if (now?.playing == true) pause() else resume() }
    fun stop() {
        now = null; gen++; sleepAt = 0; ducked = false
        dropFocus()
        tts?.stop(); tts?.shutdown(); tts = null; ready = false
        runCatching { Net.app.stopService(Intent(Net.app, ReadAloudService::class.java)) }
    }
    fun changeSpeed(v: Float) {
        speed = v
        Store["prefs"].put("nvTtsSpeed", v.toDouble()); Store.persist("prefs", true)
        speak() // heard at once: the paragraph starts over at the new speed
    }
    /** the Arabic voices the engine has */
    fun voices(): List<Voice> = runCatching { tts?.voices?.filter { it.locale.language == "ar" }?.sortedBy { it.name } }.getOrNull().orEmpty()
    fun voice() = runCatching { tts?.voice?.name }.getOrNull().orEmpty()
    fun setVoice(v: Voice) {
        tts?.voice = v
        Store["prefs"].put("nvTtsVoice", v.name); Store.persist("prefs", true)
        speak()
    }
}

/** keeps the reading going with the screen off: Android may kill a process with nothing in the foreground; its notification has the controls */
class ReadAloudService : Service() {
    private var wake: PowerManager.WakeLock? = null
    // headphones pulled out: not out loud in the room
    private val noisy = object : BroadcastReceiver() { override fun onReceive(c: Context, i: Intent) = ReadAloud.pause() }

    override fun onBind(i: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, t("ttsListen"), NotificationManager.IMPORTANCE_LOW))
        ServiceCompat.startForeground(this, ID, build(), if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0)
        wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "medflix:readaloud").apply { acquire(6 * 3600_000L) }
        ContextCompat.registerReceiver(this, noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        running = this
    }
    override fun onStartCommand(i: Intent?, flags: Int, id: Int): Int {
        when (i?.action) { PLAY -> ReadAloud.toggle(); STOP -> ReadAloud.stop() }
        return START_NOT_STICKY // killed anyway: its state went with it, nothing to read on with
    }
    override fun onDestroy() {
        running = null
        unregisterReceiver(noisy)
        wake?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
    private fun build(): Notification {
        val n = ReadAloud.now
        fun act(a: String) = PendingIntent.getService(this, a.hashCode(), Intent(this, ReadAloudService::class.java).setAction(a), PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this, 0, Intent(this, NativeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val playing = n?.playing == true
        return NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_bell).setContentTitle(n?.title.orEmpty())
            .setContentText(n?.let { "${t("chapter")} ${it.c.n}" }.orEmpty()).setContentIntent(open).setOngoing(playing).setSilent(true)
            .addAction(if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play, t(if (playing) "pause" else "play"), act(PLAY))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, t("close"), act(STOP)).build()
    }
    companion object {
        private const val CHANNEL = "read_aloud"
        private const val ID = 4207
        private const val PLAY = "play"
        private const val STOP = "stop"
        private var running: ReadAloudService? = null
        fun refresh() { running?.let { it.getSystemService(NotificationManager::class.java).notify(ID, it.build()) } }
    }
}
