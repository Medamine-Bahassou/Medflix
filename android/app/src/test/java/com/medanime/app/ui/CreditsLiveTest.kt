package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

// opt in: MEDFLIX_LIVE_CREDITS=1 ./gradlew testDebugUnitTest --tests '*CreditsLiveTest'
class CreditsLiveTest {
    @Test fun charactersAcrossMedia() = runBlocking {
        assumeTrue(System.getenv("MEDFLIX_LIVE_CREDITS") == "1")
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        for ((title, kind, year) in listOf(Triple("Naruto", "anime", ""), Triple("Solo Leveling", "manga", ""), Triple("Death Note", "manga", ""), Triple("Inception", "cinema", "2010"), Triple("Breaking Bad", "series", ""))) {
            val rows = Credits.load(listOf(title), kind == "anime", year, kind)
            println("$title: ${rows.size} characters; ${rows.firstOrNull()}")
            assertTrue("$title characters and pictures", rows.isNotEmpty() && rows.any { it.name.isNotEmpty() && it.photo.startsWith("https://") })
            if (kind == "anime") assertTrue("Japanese voice", rows.any { it.actor == "Junko Takeuchi" })
            if (kind == "manga") assertTrue("manga has no voice cast", rows.all { it.actor.isEmpty() })
            if (title == "Solo Leveling") assertTrue("pagination", rows.size > 50)
        }
    }
}
