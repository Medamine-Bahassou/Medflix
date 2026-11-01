package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

// Read-only live contract check, matching the repository's other live provider tests.
class AnimeWitcherTest {
    @Test fun existingEpisodeHasDownloadHostsAtEachQuality() = runBlocking {
        val links = AnimeWitcher.sources("Black Clover 2nd Season", "", "4")
        assertTrue("public episode summary should supply actual links", links.isNotEmpty())
        for (host in listOf("mediafire", "pixeldrain", "streamtape", "firestream")) {
            assertEquals(setOf("FHD", "HD", "SD"), links.filter { it.label.startsWith(host) }.map { it.quality }.toSet())
        }
        assertTrue(links.all { it.token.startsWith("aw:https://") && MediaHosts.supports(it.label) })
        for (host in listOf("mediafire", "streamtape", "firestream")) {
            val page = links.first { it.label.startsWith(host) }.url!!
            val media = MediaHosts.resolve(page)
            assertTrue(media.startsWith("https://"))
            assertTrue("page must resolve to video URL", media != page)
            assertEquals(media, MediaProbe.video(media))
        }
    }
    @Test fun unknownSeasonDoesNotUseSimilarTitle() = runBlocking {
        assertTrue(AnimeWitcher.sources("Black Clover 999th Season", "", "4").isEmpty())
    }
}
