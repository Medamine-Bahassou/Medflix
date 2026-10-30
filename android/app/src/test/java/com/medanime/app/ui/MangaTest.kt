package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test

// manga live: ./gradlew testDebugUnitTest --tests '*MangaTest*'
class MangaTest {
    @Test
    fun demonicEmperor() = runBlocking { // MangaSwat has only its last 203 chapters (727-928): its MangaTek twin ("Magic emperor") fills the rest
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val f = Manga.full("1702433")
        println("${f.s.title} ids=${f.ids} chapters=${f.chs.size} ${f.chs.firstOrNull()?.n}..${f.chs.lastOrNull()?.n}")
        assertTrue("twin found", f.ids.size == 2)
        assertTrue("every chapter", f.chs.size > 900)
    }
}
