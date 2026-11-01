package com.medanime.app.ui

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test

class MangaLoadingTest {
    @Test fun fastSourceAppearsBeforeSlowSourceAndBothAreRetained() = runBlocking {
        withTimeout(2000) {
            val slow = CompletableDeferred<Unit>()
            val results = Channel<List<String?>>(Channel.UNLIMITED)
            val job = launch { mangaProgressive(listOf<suspend () -> String>(
                { "primary" }, { slow.await(); "extra" }
            )).collect { results.send(it) } }
            assertEquals(listOf("primary", null), results.receive())
            slow.complete(Unit)
            assertEquals(listOf("primary", "extra"), results.receive())
            job.join()
        }
    }
    @Test fun failedOptionalSourcePreservesPrimaryAndCancellationStopsPendingWork() = runBlocking {
        val rows = mangaProgressive(listOf<suspend () -> String>({ "primary" }, { throw java.io.IOException("down") })).toList()
        assertEquals("primary", rows.last()[0])
        val cancelled = CompletableDeferred<Unit>()
        val started = CompletableDeferred<Unit>()
        val first = mangaProgressive(listOf<suspend () -> String>(
            { started.await(); "primary" },
            { try { started.complete(Unit); CompletableDeferred<Unit>().await(); "never" } finally { cancelled.complete(Unit) } }
        )).first()
        assertEquals("primary", first[0])
        assertTrue(cancelled.isCompleted)
    }
    @Test fun cachedSeriesAndChaptersOpenWithoutAnyCrossSourceNetworkRequest() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        fun cache(url: String, body: String) {
            val hash = java.security.MessageDigest.getInstance("SHA-1").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
            java.io.File(Pages.dir, hash).writeText(body)
        }
        cache(Manga.mUrl("series/42/"), """{"id":42,"title":"Example","story":"Story"}""")
        cache(Manga.mUrl("series/42/chapters/", mapOf("page" to 1, "page_size" to 200)), """{"count":1,"results":[{"id":73,"chapter":"12"}]}""")
        val first = Manga.fullFlow("42").first()
        assertEquals("Example", first.s.title)
        assertEquals(listOf("73"), first.chs.map { it.id })
        assertEquals(listOf("42"), first.ids)
    }
}
