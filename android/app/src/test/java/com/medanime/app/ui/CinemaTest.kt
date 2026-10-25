package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test

// the movie sites live, with every backup site's servers (cinema.js edWatch): ./gradlew testDebugUnitTest --tests '*CinemaTest*'
class CinemaTest {
    @Test
    fun boyka() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val hit = Cinema.search("boyka").first { it.path.startsWith("/cinema/فيلم-") }
        val slug = hit.path.removePrefix("/cinema/")
        val m = Cinema.movie(slug)
        val w = Cinema.watch(m, slug)
        println("${m.title} (${m.year}) dub=${m.dub}")
        w.servers.forEach { println("  ${if (it.backup) "backup" else "own   "} ${it.label} ${it.quality} ${it.url.take(70)}") }
        println("  downloads: ${w.downloads.size}")
        assertTrue("backup servers", w.servers.any { it.backup })
    }
}
