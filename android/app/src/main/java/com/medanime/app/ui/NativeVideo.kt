package com.medanime.app.ui

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONObject

/** The same video controls, resume checkpoints, audio focus and PiP for files and network streams. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun NativeVideo(mediaUri: android.net.Uri, epPath: String, full: MutableState<Boolean>,
                onError: (androidx.media3.common.PlaybackException) -> Unit,
                onEnded: () -> Unit = {}, onFinished: () -> Unit = {}) {
    val failure by rememberUpdatedState(onError)
    val ended by rememberUpdatedState(onEnded)
    val finished by rememberUpdatedState(onFinished)
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val exo = remember(mediaUri, epPath) {
        val at = PlaybackSession.position(epPath)
        ExoPlayer.Builder(ctx)
            .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(
                androidx.media3.datasource.DefaultDataSource.Factory(ctx, androidx.media3.datasource.DefaultHttpDataSource.Factory().setUserAgent(UA))))
            .setSeekBackIncrementMs(10_000).setSeekForwardIncrementMs(10_000)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true) // pauses for a call
            .setHandleAudioBecomingNoisy(true).build().apply { // headphones pulled out: pause, not the speaker
                setMediaItem(MediaItem.fromUri(mediaUri))
                // watched to the end: from the start again (the end would count as ended, and go on to the next one)
                val time = at.optDouble("time", 0.0).takeIf { it < at.optDouble("duration", 0.0) * 0.95 } ?: 0.0
                seekTo((time * 1000).toLong())
                playWhenReady = !at.optBoolean("paused", false)
                prepare()
            }
    }
    fun save() {
        if (exo.duration > 0 && !PlaybackSession.suspended) PlaybackSession.position(epPath,
            JSONObject().put("time", exo.currentPosition / 1000.0).put("duration", exo.duration / 1000.0).put("paused", !exo.playWhenReady))
    }
    LaunchedEffect(exo) { while (true) { save(); kotlinx.coroutines.delay(500) } }
    DisposableEffect(exo) {
        val unbind = PlaybackSession.controls.bind(!exo.playWhenReady) { play -> if (!PlaybackSession.suspended) { exo.playWhenReady = play; save() } } // the PiP window's button
        var playing = exo.playWhenReady
        var wasStopped: Boolean? = null
        val detach = PlaybackSession.observe { stopped ->
            if (stopped) {
                // Save before pausing; dismissal must not overwrite the desired playback state.
                if (wasStopped == false) playing = exo.playWhenReady
                PlaybackSession.position(epPath, JSONObject().put("time", exo.currentPosition / 1000.0)
                    .put("duration", exo.duration.coerceAtLeast(0) / 1000.0).put("paused", !playing))
                exo.pause()
            } else if (wasStopped != false && playing) exo.play()
            wasStopped = stopped
        }
        onDispose {
            val ended = exo.duration > 0 && exo.currentPosition >= exo.duration * 0.9 // the end credits skipped still counts as watched
            save(); detach(); unbind()
            exo.release()
            if (ended && !pipStopped.value) finished()
        }
    }
    key(exo) { AndroidView({ c ->
            (android.view.LayoutInflater.from(c).inflate(com.medanime.app.R.layout.offline_player, null) as PlayerView).apply {
                this.player = exo
                setShutterBackgroundColor(android.graphics.Color.BLACK)
                setShowPreviousButton(false); setShowNextButton(false) // one file each: the bar above has the other episodes
                setShowSubtitleButton(true)
                setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                setFullscreenButtonClickListener { full.value = it }
                // pinch out: the video fills the screen (cropped), pinch in: whole again
                var zoom = 1f
                val pinch = android.view.ScaleGestureDetector(c, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    override fun onScaleBegin(g: android.view.ScaleGestureDetector) = true.also { zoom = 1f }
                    override fun onScale(g: android.view.ScaleGestureDetector) = true.also { zoom *= g.scaleFactor }
                    override fun onScaleEnd(g: android.view.ScaleGestureDetector) {
                        if (zoom > 1.1f) resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM else if (zoom < 0.9f) resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    }
                })
                setOnTouchListener { _, e -> pinch.onTouchEvent(e); false } // false: a tap still shows / hides the controls
                exo.addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(on: Boolean) { keepScreenOn = on; PlaybackSession.controls.report(!exo.playWhenReady) } // the screen sleeps only while paused
                    override fun onPlayerError(e: androidx.media3.common.PlaybackException) { android.util.Log.w("medflix", "video", e); failure(e) }
                    override fun onPlaybackStateChanged(state: Int) {
                        if (state == Player.STATE_ENDED && !PlaybackSession.suspended) ended()
                    }
                })
            }
        }, Modifier.fillMaxSize(), update = {
            it.useController = !inPip.value // the PiP window: the video only
            it.setFullscreenButtonState(full.value)
        }, onRelease = { it.player = null }) }
}
