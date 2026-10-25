package com.medanime.app.ui

import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import org.junit.Assert.assertTrue
import org.junit.Test

// the native scraper against the live site (selftest.js for ui/): ./gradlew testDebugUnitTest --tests '*WitanimeTest*'
class WitanimeTest {
    private val http = OkHttpClient()
    private fun doc(path: String) = Jsoup.parse(http.newCall(Request.Builder().url(SITE + path).header("User-Agent", UA).build()).execute().body!!.string(), SITE)

    @Test
    fun pages() {
        val home = Witanime.home(doc("/"))
        assertTrue("hero", home.hero.isNotEmpty())
        assertTrue("rows", home.rows.size >= 2 && home.rows.all { it.items.isNotEmpty() })
        val list = Witanime.list(doc("/browse"), "/browse")
        assertTrue("browse", list.items.size >= 10 && list.pages > 1)
        val show = list.items.first { it.type == "anime" }.path
        val d = Witanime.details(doc(show), show)
        println("${d.title} | ${d.alt} | ${d.genres} | ${d.tags} | ${d.episodes.size} eps | ${d.info.size} info | ${d.related.size} related")
        assertTrue("details", d.title.isNotEmpty() && d.desc.isNotEmpty() && d.poster.isNotEmpty() && d.episodes.isNotEmpty())
    }

    @Test
    fun cinema() {
        val doc = Jsoup.parse(http.newCall(Request.Builder().url(Cinema.ED + "/category/foreign-movies/").header("User-Agent", UA).build()).execute().body!!.string(), Cinema.ED)
        val cards = Cinema.cards(doc)
        println(cards.take(3).map { "${it.title} | ${it.year} | ${it.path}" })
        assertTrue("cinema cards", cards.size >= 10 && cards.all { it.poster.isNotEmpty() && it.title.isNotEmpty() })
    }
}
