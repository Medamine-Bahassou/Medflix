package com.medanime.app.ui

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.view.View
import android.widget.RemoteViews
import coil3.request.allowHardware
import coil3.toBitmap
import com.medanime.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * the continue-watching home-screen widget: the last 3 shows watched (the home page's row, films and series too), a tap
 * opening the episode each was left on (NativeActivity's "resume"). Redrawn as the history changes (Store.persist)
 */
class Widget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        // added to the home screen, or the phone restarted: the app may not be running, so the store is set up here
        Net.app = c.applicationContext
        Store.init(c)
        setImageLoader(c.applicationContext)
        val done = goAsync() // the posters load after this returns: Android keeps the process for them
        draw(c) { done.finish() }
    }

    companion object {
        private val KINDS = setOf("anime", "cinema")
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val SLOTS = listOf(Triple(R.id.slot0, R.id.poster0, R.id.title0), Triple(R.id.slot1, R.id.poster1, R.id.title1), Triple(R.id.slot2, R.id.poster2, R.id.title2))
        private val EPS = listOf(R.id.ep0, R.id.ep1, R.id.ep2)

        /** where a widget's tap leads: the card the home page shows for that show (null: since forgotten, the app just opens) */
        fun screen(path: String) = continued(KINDS).find { it.path == path }?.let(::screenFor)

        fun refresh() = draw(Net.app) {}

        // the store read here, on the main thread; the posters fetched (Coil's cache, mostly) on IO, then the widgets redrawn
        private fun draw(c: Context, done: () -> Unit) {
            val m = AppWidgetManager.getInstance(c)
            val ids = m.getAppWidgetIds(ComponentName(c, Widget::class.java))
            if (ids.isEmpty()) return done()
            val items = continued(KINDS).take(3)
            val head = t("continueWatching"); val empty = t("widgetEmpty")
            scope.launch {
                try {
                    val posters = items.map { poster(c, it.poster) }
                    val v = RemoteViews(c.packageName, R.layout.widget)
                    v.setTextViewText(R.id.head, head)
                    v.setOnClickPendingIntent(R.id.head, PendingIntent.getActivity(c, 0, Intent(c, NativeActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
                    v.setViewVisibility(R.id.empty, if (items.isEmpty()) View.VISIBLE else View.GONE)
                    v.setViewVisibility(R.id.row, if (items.isEmpty()) View.GONE else View.VISIBLE)
                    v.setTextViewText(R.id.empty, empty)
                    SLOTS.forEachIndexed { i, (slot, img, title) ->
                        val card = items.getOrNull(i)
                        v.setViewVisibility(slot, if (card == null) View.INVISIBLE else View.VISIBLE) // kept in place: the others stay a third wide
                        if (card == null) return@forEachIndexed
                        posters[i]?.let { v.setImageViewBitmap(img, it) } ?: v.setImageViewResource(img, android.R.color.transparent)
                        v.setTextViewText(title, card.title)
                        v.setTextViewText(EPS[i], card.badge)
                        // each slot its own request code: one shared would carry the last slot's show for all three
                        v.setOnClickPendingIntent(slot, PendingIntent.getActivity(c, i + 1, Intent(c, NativeActivity::class.java).putExtra("resume", card.path),
                            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
                    }
                    m.updateAppWidget(ids, v)
                } finally { done() }
            }
        }

        // software and small: the launcher gets the bitmap over IPC, with a cap on the size of everything sent
        private suspend fun poster(c: Context, url: String): Bitmap? = if (url.isEmpty()) null else runCatching {
            val r = coil3.SingletonImageLoader.get(c).execute(coil3.request.ImageRequest.Builder(c).data(url).size(240, 360).allowHardware(false).build())
            (r as? coil3.request.SuccessResult)?.image?.toBitmap()
        }.getOrNull()
    }
}
