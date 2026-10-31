package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test

// manga live: ./gradlew testDebugUnitTest --tests '*MangaTest*'
class MangaTest {
    @Test
    fun demonicEmperor() = runBlocking { // MangaSwat has only its last ~200 chapters: its Olympus twin fills the rest
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val f = Manga.full("1702433")
        println("${f.s.title} ids=${f.ids} chapters=${f.chs.size} ${f.chs.firstOrNull()?.n}..${f.chs.lastOrNull()?.n}")
        assertTrue("twin found", f.ids.size == 2 && f.ids[1].startsWith("o:"))
        assertTrue("every chapter", f.chs.size > 900)
        // both sites' chapters come whole (their pages download as they are), or refused as paid, never a parse error
        assertTrue("swat pages", Manga.chapter(f.chs.first().id).images.isNotEmpty())
        val oly = runCatching { Manga.chapter(f.chs.last().id) }
        println("oly ${f.chs.last().id}: ${oly.exceptionOrNull()?.javaClass?.simpleName ?: "${oly.getOrNull()?.images?.size} pages"}")
        assertTrue("oly whole or locked", oly.isSuccess || oly.exceptionOrNull() is Manga.Locked)
    }

    @Test
    fun olympus() = runBlocking { // its own series: listed, searched, opened, read
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val latest = Manga.latest()
        println("latest ${latest.size}: ${latest.filter { it.path.contains("/o:") }.take(3).map { "${it.title} ${it.badge}" }}")
        assertTrue("olympus in latest", latest.any { it.path.contains("/o:") })
        val browse = Manga.browse(emptyMap(), 2, HashSet())
        println("browse p2 ${browse.items.size} pages=${browse.pages}")
        assertTrue("olympus in browse", browse.items.any { it.path.contains("/o:") })
        val found = Manga.browse(mapOf("search" to "monster paradise"), 1, HashSet()).items
        println("search: ${found.map { it.path }}")
        val f = Manga.full("o:monster-paradise")
        println("${f.s.title} type=${f.s.type} status=${f.s.status} genres=${f.s.genres} chapters=${f.chs.size} ids=${f.ids} poster=${f.s.poster}")
        assertTrue("chapters", f.chs.isNotEmpty())
        val c = Manga.chapter(f.chs.last().id)
        println("${c.id}: ${c.images.size} pages ${c.images.firstOrNull()}")
        assertTrue("pages", c.images.isNotEmpty())
    }
}
