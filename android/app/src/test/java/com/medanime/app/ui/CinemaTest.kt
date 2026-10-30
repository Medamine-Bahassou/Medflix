package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test

// the movie sites live, with every backup site's servers (cinema.js edWatch): ./gradlew testDebugUnitTest --tests '*CinemaTest*'
class CinemaTest {
    @Test
    fun verity() = runBlocking { // a recent film: on every backup site, in 480p, 720p and 1080p
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val hit = Cinema.search("verity").first { it.path.startsWith("/cinema/فيلم-verity") }
        val slug = hit.path.removePrefix("/cinema/")
        val m = Cinema.movie(slug)
        val w = Cinema.watch(m, slug)
        println("${m.title} (${m.year}) dub=${m.dub}")
        w.servers.forEach { println("  ${if (it.backup) "backup" else "own   "} ${it.label} ${it.quality} ${it.url.take(70)}") }
        println("  downloads: ${w.downloads.size}")
        assertTrue("backup servers", w.servers.any { it.backup })
        assertTrue("every quality", w.servers.filter { !it.backup }.map { it.quality }.toSet().containsAll(listOf("480", "720", "1080")))
    }
}
