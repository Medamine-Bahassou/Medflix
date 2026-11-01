package com.medanime.app.ui

import org.jsoup.Jsoup
import org.junit.Assert.*
import org.junit.Test

class SlayerTest {
    @Test fun liveRecoveredEndpoints() = kotlinx.coroutines.runBlocking {
        org.junit.Assume.assumeTrue(System.getenv("MEDFLIX_LIVE_SLAYER") == "1")
        val origin = Slayer.sources.getValue("spark")
        val home = Net.fetch("$origin/")
        assertEquals(200, home.status)
        val cards = Slayer.parseList(Jsoup.parse(home.body), "spark").items
        assertTrue("live catalogue", cards.isNotEmpty())
        val chapters = Net.fetch("$origin/wp-admin/admin-ajax.php", form = mapOf("action" to "manga_get_chapters", "manga" to "187967"))
        assertEquals(200, chapters.status)
        val chs = Slayer.parseChapters(Jsoup.parse(chapters.body), "spark")
        assertTrue("live chapter list", chs.isNotEmpty())
        val pages = Net.fetch("$origin/wp-admin/admin-ajax.php?postID=187967&manga-paged=1&chapter=19&style=list", form = mapOf("action" to "chapter_navigate_page"))
        assertEquals(200, pages.status)
        val images = Slayer.parsePageResponse(pages.body)
        assertTrue("live page extraction", images.isNotEmpty())
        println("Spark live: ${cards.size} series, ${chs.size} chapters, ${images.size} images")
    }
    @Test fun blockedEmbedHeadingsDoNotContaminateTheSeriesOrHideLazyCovers() {
        val sid = Slayer.id("spark", "/manga/fall-for-me/")
        val doc = Jsoup.parse("""<head><meta property="og:image" content="/cover.webp"></head><body class="postid-187967"><h1>Access Denied</h1><div class="post-title"><h1>Fall for Me</h1></div><h1>Unrelated ad heading</h1><div class="summary_image"><img src="data:image/gif;base64,AAAA" data-srcset="/poster.webp 400w, /large.webp 800w"></div></body>""")
        val s = Slayer.parseSeries(doc, sid).s
        assertEquals("Fall for Me", s.title)
        assertEquals(listOf("Fall for Me"), s.names.filter { it.isNotEmpty() })
        assertEquals("https://sparkmanga.net/poster.webp", s.poster)
        doc.select(".summary_image").remove()
        assertEquals("https://sparkmanga.net/cover.webp", Slayer.parseSeries(doc, sid).s.poster)
        assertThrows(Exception::class.java) {
            Slayer.parseSeries(Jsoup.parse("""<body class="postid-187967"><div class="post-title"><h1>Access Denied</h1></div></body>"""), sid)
        }
    }
    @Test fun routeAndNumbers() {
        for ((key, origin) in Slayer.sources) {
            val id = Slayer.id(key, "/manga/مانجا/12.5/")
            assertTrue(id.matches(Regex("s:[a-z]+:[a-zA-Z0-9_-]+")))
            assertEquals("$origin/manga/%D9%85%D8%A7%D9%86%D8%AC%D8%A7/12.5/", Slayer.url(id))
        }
        assertEquals("12.5", Slayer.number("الفصل ١٢.٥"))
        assertEquals("https://tempdarko.link-manga.net/manga/a.jpg", Slayer.transformImage("https://temp.lekmanga.site/manga/a.jpg", "spark"))
        assertFalse(Slayer.supports(mapOf("status" to "79")))
    }
    @Test fun catalogueDetailsChaptersAndNestedPages() {
        val html = """<body class="postid-42"><div class="page-item-detail"><div class="post-title"><a href="/manga/example/">Example</a></div><img data-src="https://sparkio.sparkmanga.net/cover.jpg"></div><a href="/page/4/">4</a><div class="post-title"><h1>Example</h1></div><div class="summary__content">Story</div><ul class="main version-chap"><li class="wp-manga-chapter"><a href="/manga/example/12.5/">الفصل ١٢.٥</a></li></ul></body>"""
        val d = Jsoup.parse(html)
        val listing = Slayer.parseList(d, "spark")
        assertEquals(4, listing.pages)
        assertEquals(1, listing.items.size)
        val sid = listing.items.single().path.substringAfterLast('/')
        val detail = Slayer.parseSeries(d, sid)
        assertEquals("42", detail.postId)
        assertEquals("Story", detail.s.story)
        assertEquals("12.5", detail.s.chapters.single().n)
        val content = """<img class="wp-manga-chapter-img" src=" https://s4.link-manga.net/1.jpg "><img class="wp-manga-chapter-img" data-src="https://s4.link-manga.net/2.jpg"><img class="wp-manga-chapter-img" src="https://s4.link-manga.net/1.jpg">"""
        val response = org.json.JSONObject().put("data", org.json.JSONObject().put("data", org.json.JSONObject().put("content", content)))
        assertEquals(listOf("https://s4.link-manga.net/1.jpg", "https://s4.link-manga.net/2.jpg"), Slayer.parsePageResponse(response.toString()))
        assertThrows(Exception::class.java) { Slayer.parsePageResponse("{\"success\":false}") }
        assertThrows(Exception::class.java) { Slayer.parseSeries(Jsoup.parse("<title>Just a moment...</title>"), sid) }
    }
}
