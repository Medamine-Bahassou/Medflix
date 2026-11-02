package com.medanime.app.ui

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NovelsTest {
    // the site live, as a reader goes through it: ./gradlew testDebugUnitTest --tests '*NovelsTest*'
    @Test fun browseOpenAndReadOnTheSite() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val first = Novels.browseFlow(mapOf("sort" to "trending")).first()
        assertTrue(first.items.size > 10); assertTrue(first.pages > 1); assertNotNull(first.cursor)
        val second = Novels.browse(mapOf("sort" to "trending"), first.cursor!!)
        assertTrue("the next page is other novels", second.items.map { it.path }.intersect(first.items.map { it.path }.toSet()).isEmpty())
        assertTrue(Novels.list(mapOf("genre" to "action")).items.isNotEmpty())
        assertTrue(Novels.search("عبد الظل").any { it.title.contains("عبد الظل") })
        assertTrue(Novels.updates().isNotEmpty())
        // a long novel: the whole list, over several requests
        val id = Novels.search("القس المجنون").first { it.title == "القس المجنون" }.path.substringAfterLast('/')
        var t0 = System.currentTimeMillis()
        val steps = Novels.fullFlow(id).toList()
        println("first open: ${steps.map { it.chs.size }} in ${System.currentTimeMillis() - t0}ms")
        val full = steps.last()
        assertEquals("the newest come first, the rest after", 2, steps.size); assertEquals(1000, steps[0].chs.size)
        assertEquals("its first chapter's known before the list is all here", full.chs.last().id, steps[0].first?.id)
        assertEquals(full.chs.first().id, Novels.newest(id)?.id)
        // open again: the saved list, nothing asked for (within the minute)
        t0 = System.currentTimeMillis()
        val again = Novels.fullFlow(id).toList()
        println("open again: ${again.map { it.chs.size }} in ${System.currentTimeMillis() - t0}ms")
        assertEquals(1, again.size); assertEquals(full.chs, again[0].chs)
        // pulled, or a minute on: one request, the saved list under it
        t0 = System.currentTimeMillis()
        assertEquals(full.chs, Novels.fullFlow(id, true).toList().last().chs)
        println("refresh: ${System.currentTimeMillis() - t0}ms")
        println("${full.n.title}: ${full.chs.size} of ${full.n.count}, by ${full.n.author}")
        assertTrue(full.chs.size > 1000); assertEquals(full.chs.size, full.chs.distinctBy { it.id }.size)
        assertTrue("newest first", full.chs.first().n.toDouble() > full.chs.last().n.toDouble())
        assertTrue(full.n.story.isNotEmpty()); assertTrue(full.n.poster.startsWith("https://"))
        // a late chapter: its text and the ones around it
        val at = full.chs[full.chs.size / 2]
        t0 = System.currentTimeMillis()
        val c = Novels.chapter(id, at.slug)
        println("a chapter, its id known: ${System.currentTimeMillis() - t0}ms")
        println("chapter ${c.n}: ${c.paras.size} paragraphs, prev ${c.prev}, next ${c.next}")
        assertTrue(c.paras.size > 5); assertNotNull(c.prev); assertNotNull(c.next)
        assertTrue(Novels.chapter(id, c.next!!).prev == c.slug)
        assertTrue(JSONObject(Novels.chapterFile(id, at.slug)).getJSONObject("c").getString("slug") == at.slug)
    }

    private suspend fun readOn(site: NovelSite, name: String, slug: String) {
        val c = site.chapter(slug, name)
        println("${site.tag} chapter ${c.n} '${c.title}': ${c.paras.size} paragraphs, ${c.words} words, prev ${c.prev}, next ${c.next}; starts '${c.paras.first().take(50)}', ends '${c.paras.last().take(50)}'")
        assertTrue(c.paras.size > 3); assertFalse("the site's hidden marks stay out", c.paras.any { it.contains(Regex("[0-9a-f]{16}")) })
        assertNotNull(c.next)
        assertEquals(c.slug, site.chapter(slug, c.next!!).prev)
    }

    @Test fun theOtherSitesOnTheSite() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        // seanovel: its pages only
        var t0 = System.currentTimeMillis()
        val sea = Sea.page(1, false)
        println("sea page: ${sea.items.size} of ${sea.pages} pages, ${System.currentTimeMillis() - t0}ms; ${sea.items.first().title}")
        assertTrue(sea.items.size >= 20); assertTrue(sea.items.all { it.title.isNotEmpty() && it.poster.startsWith("https://seanovel.org/api/novel/") })
        val seaFull = Sea.full("the-greatest-sinner", false, true).toList().last()
        println("sea novel: ${seaFull.n.title} / ${seaFull.n.alt}, ${seaFull.chs.size}, genres ${seaFull.n.genres}, story '${seaFull.n.story.take(50)}'")
        assertTrue(seaFull.chs.size > 300); assertEquals("1", seaFull.first?.slug); assertEquals("الفخر", seaFull.first?.title)
        assertNull("the last one has none after it", Sea.chapter("the-greatest-sinner", seaFull.chs.first().slug).next)
        readOn(Sea, "2", "the-greatest-sinner")
        assertTrue("past the end", runCatching { Sea.chapter("the-greatest-sinner", "999999") }.isFailure)
        // sunovels: open chapters only
        t0 = System.currentTimeMillis()
        val sun = Sun.page(1, false)
        println("sun page: ${sun.items.size} of ${sun.pages} pages, ${System.currentTimeMillis() - t0}ms; ${sun.items.first().poster}")
        assertEquals(24, sun.items.size); assertTrue(sun.pages > 10)
        assertTrue(Sun.search("القس").any { it.title == "القس المجنون" })
        val sunFull = Sun.full("reverend-insanity", false, true).toList().last()
        println("sun novel: ${sunFull.n.title}, ${sunFull.chs.size} open, ${sunFull.n.locked} locked, genres ${sunFull.n.genres}, cover ${sunFull.n.cover}, story '${sunFull.n.story.take(50)}'")
        assertEquals("", sunFull.chs.first().title)
        assertTrue(sunFull.chs.size in 10..500); assertTrue(sunFull.n.locked > 1000); assertEquals("1", sunFull.first?.slug)
        readOn(Sun, "2", "reverend-insanity")
        assertNull("the reader stops at the last open one", Sun.chapter("reverend-insanity", sunFull.chs.first().slug).next)
        assertTrue("a locked one isn't asked for", runCatching { Sun.chapter("reverend-insanity", "2000") }.isFailure)
        // kolnovel: its listing, its search, a chapter; its novel page may time out on its side, said so if it does
        t0 = System.currentTimeMillis()
        val kol = Kol.page(1, false)
        println("kol page: ${kol.items.size} of ${kol.pages} pages, ${System.currentTimeMillis() - t0}ms; ${kol.items.first().title} ${kol.items.first().rating}")
        assertTrue(kol.items.size >= 15); assertTrue(kol.pages > 5)
        assertTrue(Kol.search("المتعاقد").any { it.title.contains("المتعاقد") })
        readOn(Kol, "shaag24the-tutorial-is-too-hardz435ggye-27755", "x")
        t0 = System.currentTimeMillis()
        val steps = runCatching { Kol.full(kol.items[3].path.substringAfter('~'), false, false).toList() }
        println("kol novel: ${steps.map { l -> l.map { "${it.chs.size} ${it.first?.n}" } }} in ${System.currentTimeMillis() - t0}ms; ${steps.getOrNull()?.last()?.n}")
        steps.getOrNull()?.last()?.let { f -> assertTrue(f.chs.isNotEmpty()); assertEquals("the page shows at once from its card", "", steps.getOrThrow().first().n.alt) ; assertTrue(f.n.title.isNotEmpty()) }
        Unit
    }

    @Test fun theOtherSitesThroughNovels() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        // a download's file reads back as the chapter, as if from the site
        for ((novel, ch) in listOf("sea~the-greatest-sinner" to "2", "sun~reverend-insanity" to "2", "kol~x" to "shaag24the-tutorial-is-too-hardz435ggye-27755")) {
            val c = Novels.chapter(novel, ch)
            val j = JSONObject(Novels.chapterFile(novel, ch))
            val back = Novels.tidy(Novels.parseChapter(novel, j.getJSONObject("c"), j.getJSONObject("x")), "")
            assertEquals(c.paras, back.paras); assertEquals(c.id, back.id); assertEquals(c.next, back.next); assertEquals(c.prev, back.prev); assertEquals(c.n, back.n)
        }
        val found = Novels.search("القس المجنون")
        println("search: ${found.map { it.path.take(14) + " " + it.title }}")
        assertEquals("each novel once, novltime's copy first", 1, found.count { it.title == "القس المجنون" })
        assertFalse(found.first { it.title == "القس المجنون" }.path.contains('~'))
        println("kol from the title page: " + Novels.fullFlow("kol~%d8%a7%d9%86%d8%a8%d8%b9%d8%a7%d8%ab-%d8%a7%d9%84%d8%ae%d9%88%d8%a7%d8%b1%d9%82", whole = false).toList().last().n.let { "${it.title} done=${it.done} genres=${it.genres}" })
        assertEquals("the newest of the open ones", Sun.full("reverend-insanity", false, true).toList().last().chs.first().id, Novels.newest("sun~reverend-insanity")?.id)
        val list = Novels.others(emptyMap(), 1)
        println("others: ${list.items.size} of ${list.pages} pages, tags ${list.items.groupingBy { it.path.substringAfter("/novel/").substringBefore('~') }.eachCount()}")
        assertEquals("filtered, novltime alone", 0, Novels.others(mapOf("genre" to "action"), 1).items.size)
    }

    @Test fun aChaptersNameDoesntRepeatWhatItsShownWith() {
        assertEquals("", Novels.chName("الفصل 50: الفصل 50", "50"))
        assertEquals("", Novels.chName("الفصل 2.0", "2"))
        assertEquals("", Novels.chName("Chapter 7", "7"))
        assertEquals("", Novels.chName("موشوكو تينساي 325", "325", "موشوكو تينساي"))
        assertEquals("", Novels.chName("الفصل 50: \u200bوريث الفوضى 50", "50", "\u200bوريث الفوضى"))
        assertEquals("الأقلام", Novels.chName("الفصل 50 - الأقلام", "50"))
        assertEquals("تشي السيف", Novels.chName("2304 تشي السيف", "2304"))
        // not its number, or not a number at all: kept
        assertEquals("840.5", Novels.chName("القس المجنون 840.5", "2335", "القس المجنون"))
        assertEquals("الخاتمة 2", Novels.chName("الخاتمة 2", "2255"))
        assertEquals("في العصر الحديث (28)", Novels.chName("في العصر الحديث (28)", "1430"))
        assertEquals("فصل جانبي", Novels.chName("فصل جانبي", "1431"))
        assertEquals("50 طريقة", Novels.chName("50 طريقة", "12"))
    }

    @Test fun aChaptersOpeningHeadingBecomesItsName() {
        fun c(title: String, vararg p: String) = NovelChapter("n", "i", "s", "50", title, p.toList(), 9, null, null)
        Novels.tidy(c("الفصل 50: الفصل 50", "الفصل 50 - الأقلام", "نص"), "").let { assertEquals("الأقلام", it.title); assertEquals(listOf("نص"), it.paras) }
        Novels.tidy(c("الأقلام", "الفصل 50 - الأقلام", "نص"), "").let { assertEquals("الأقلام", it.title); assertEquals(listOf("نص"), it.paras) }
        Novels.tidy(c("الأقلام", "الأقلام", "نص"), "").let { assertEquals(listOf("نص"), it.paras) }
        Novels.tidy(c("", "الفصل 50", "نص"), "").let { assertEquals("", it.title); assertEquals(listOf("نص"), it.paras) }
        // the story's own opening stays: a number with no "chapter", another chapter's number, or the only paragraph there is
        assertEquals(2, Novels.tidy(c("", "50 رجلًا دخلوا الغرفة", "نص"), "").paras.size)
        assertEquals(2, Novels.tidy(c("", "الفصل 12 كان أصعب", "نص"), "").paras.size)
        assertEquals(1, Novels.tidy(c("", "الفصل 50"), "").paras.size)
    }

    @Test fun aNovelsCopiesOnTheOtherSites() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val id = Novels.list(mapOf("search" to "القس المجنون")).items.first { it.title == "القس المجنون" }.path.substringAfterLast('/')
        val t0 = System.currentTimeMillis()
        val steps = Novels.copies(id, listOf("القس المجنون")).toList()
        println("copies: ${steps.map { it.size }} -> ${steps.last().map { it.take(24) }} in ${System.currentTimeMillis() - t0}ms")
        assertEquals("novltime's own first", id, steps.last().first()); assertEquals(1, steps.first().size)
        assertEquals("the sites' order however they answer", steps.last().sortedBy { c -> listOf("sea~", "kol~", "sun~").indexOfFirst { c.startsWith(it) } }, steps.last())
        assertTrue(steps.last().contains("sun~reverend-insanity"))
        // from the other side: the same copies, the same numbers
        assertEquals(steps.last(), Novels.copies("sun~reverend-insanity", listOf("القس المجنون")).toList().last())
        // the same chapter there; locked, or not there at all: none
        assertEquals("50", Novels.sameChapter("sun~reverend-insanity", "50")?.slug)
        assertNull(Novels.sameChapter("sun~reverend-insanity", "2000"))
        assertEquals("chapter-50", Novels.sameChapter(id, "50")?.slug)
        assertEquals("2", Novels.sameChapter("sea~the-greatest-sinner", "2")?.slug)
        assertNull(Novels.sameChapter("sea~the-greatest-sinner", "99999"))
        val kol = Kol.page(1, false).items[3].path.substringAfter("/novel/")
        val k = runCatching { Novels.sameChapter(kol, "30") }
        println("kol chapter 30: $k")
        k.getOrNull()?.let { assertEquals("30", it.n); assertEquals("30", Novels.chapter(kol, it.slug).n) }
        Unit
    }

    @Test fun aRowWithNoNameGetsItFromItsChapter() = runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val full = Novels.fullFlow("sea~terra-nova-online-rise-of-the-strongest-player").toList().last()
        assertEquals("the list only says its number", "", full.chs.first { it.slug == "10" }.title)
        assertEquals("اختيار الاسم", Novels.chapterName("sea~terra-nova-online-rise-of-the-strongest-player", "10"))
        assertEquals("الأقلام", Novels.chapterName("6ae3fb8cd77ac7c8dd54032f", "chapter-50"))
        val sun = Novels.chapterName("sun~reverend-insanity", "2")
        println("sun 2: $sun"); assertTrue(sun.startsWith("العودة في الزمن"))
        // the second time from memory: no wait, no request
        val t0 = System.currentTimeMillis()
        assertEquals("اختيار الاسم", Novels.chapterName("sea~terra-nova-online-rise-of-the-strongest-player", "10"))
        assertTrue(System.currentTimeMillis() - t0 < 100)
        assertEquals("one that can't be had: no name, no failure", "", Novels.chapterName("sea~terra-nova-online-rise-of-the-strongest-player", "999999"))
    }

    @Test fun movingToAnotherCopyMovesTheContinuedOne() {
        fun ch(novel: String) = NovelChapter(novel, "$novel-i", "s", "5", "", listOf("x"), 1, null, null)
        Novels.opened("a", "T", "", ch("a")); Novels.opened("sun~b", "T", "", ch("sun~b"))
        assertEquals("a", Novels.resumeOf("a")?.first)
        Novels.switched("a", "sun~b")
        assertEquals("sun~b", Novels.resumeOf("a")?.first); assertEquals("sun~b", Novels.resumeOf("sun~b")?.first)
        assertTrue(Store["novels"].getJSONObject("a").has("use")); assertFalse(Store["novels"].getJSONObject("sun~b").has("use"))
        Novels.opened("a", "T", "", ch("a")) // read there again, from its own list
        assertEquals("a", Novels.resumeOf("a")?.first); assertEquals("a", Novels.resumeOf("sun~b")?.first)
        Store["novels"].remove("a"); Store["novels"].remove("sun~b")
    }

    @Test fun oneNovelOnSeveralSitesIsShownOnce() {
        fun c(path: String, title: String, vararg names: String) = Card(path, "novel", title, "", "", "", "", null, path, names = names.toList())
        val m = Novels.merge(listOf(listOf(c("/a", "إمبراطور السحر"), c("/b", "ظهور الكوارث")), listOf(c("/x", "امبراطور  السِحر"), c("/y", "Other", "ظهور الكوارث"), c("/z", "جديدة"))))
        assertEquals(listOf("/a", "/z", "/b"), m.map { it.path })
        val seen = HashSet<String>()
        Novels.merge(listOf(listOf(c("/a", "رواية"))), seen)
        assertTrue("on a later page too", Novels.merge(listOf(listOf(c("/b", "روايه"))), seen).isEmpty())
    }

    @Test fun aNovelsSiteIsInItsId() {
        assertEquals("the-slug", NovelSites.of("sea~the-slug")?.second); assertSame(Sea, NovelSites.of("sea~the-slug")?.first)
        assertSame(Kol, NovelSites.of("kol~%d8%a7")?.first); assertSame(Sun, NovelSites.of("sun~x")?.first)
        assertNull("novltime's own", NovelSites.of("6ac757e2c24455d171b81fa8"))
    }

    @Test fun aNextPagesDataIsReadFromItsScripts() {
        val html = """<script>self.__next_f.push([1,"a:{\"initialParagraphs\":[\"one \\\"q\\\"\",\"two\"],"])</script><script>self.__next_f.push([1,"\"next\":null}"])</script>"""
        val f = NovelSites.flight(html)
        assertEquals("one \"q\"", (NovelSites.after(f, "initialParagraphs") as org.json.JSONArray).getString(0))
        assertNull(NovelSites.after(f, "missing"))
    }

    @Test fun aNewPageGoesOnTopOfTheSavedListOnlyIfTheyMeet() {
        fun chs(vararg n: Int) = n.map { NovelCh("$it", "s$it", "$it", "", 0) }
        val old = chs(5, 4, 3, 2, 1)
        assertEquals(chs(7, 6, 5, 4, 3, 2, 1), Novels.splice(chs(7, 6, 5), old, 7))
        assertEquals(old, Novels.splice(chs(5, 4), old, 5)) // nothing new
        assertNull("more new than a page: a gap between them", Novels.splice(chs(9, 8), old, 7))
        assertNull("one added further back", Novels.splice(chs(5, 4), old, 6))
        assertNull(Novels.splice(emptyList(), old, 5))
    }

    @Test fun aChapterIsItsBlocksOrItsPlainTextWithItsNeighbours() {
        val c = JSONObject("""{"id":"a","slug":"chapter-2","order":2,"title":"t","wordCount":9,"contentJson":[{"type":"paragraph","text":" one "},{"type":"paragraph","text":""},{"type":"image"},{"type":"paragraph","text":"two"}]}""")
        val x = JSONObject("""{"prev":{"slug":"chapter-1"},"next":null}""")
        val p = Novels.parseChapter("n", c, x)
        assertEquals(listOf("one", "two"), p.paras)
        assertEquals("2", p.n); assertEquals("chapter-1", p.prev); assertNull(p.next)
        val plain = Novels.parseChapter("n", JSONObject("""{"id":"a","slug":"s","order":1,"content":"one\n\n two\n"}"""), null)
        assertEquals(listOf("one", "two"), plain.paras)
    }

    @Test fun aListingKnowsItsCoverItsTitleAndItsNextPage() {
        val l = Novels.parseList("""{"data":[{"id":"x","title":"T","alternativeTitles":["A"],"coverURL":"/uploads/covers/c.webp","stats":{"avgRating":0}}],"meta":{"totalPages":4,"hasMore":true,"nextCursor":"cur"}}""")
        assertEquals("/novel/x", l.items[0].path); assertEquals("novel", l.items[0].type); assertEquals("", l.items[0].rating)
        assertTrue(l.items[0].poster, l.items[0].poster.startsWith("https://novltime.com/_next/image?url=%2Fuploads%2Fcovers%2Fc.webp"))
        assertEquals("https://novltime.com/uploads/covers/c.webp", l.slides[0].banner)
        assertEquals(4, l.pages); assertEquals("cur", l.cursor)
        assertNull(Novels.parseList("""{"data":[],"meta":{"hasMore":false,"nextCursor":null}}""").cursor)
    }

    @Test fun searchingTheTextIgnoresItsTashkeel() {
        val re = Novels.findRe("ملك")!!
        assertTrue(re.containsMatchIn("هذا مَلِكٌ عظيم"))
        assertTrue(Novels.findRe("مَلِك")!!.containsMatchIn("هذا ملك"))
        assertFalse(re.containsMatchIn("هذا كتاب"))
        assertTrue(Novels.findRe("a.b")!!.containsMatchIn("x A.B y")) // what's typed is plain text
        assertFalse(Novels.findRe("a.b")!!.containsMatchIn("acb"))
        assertNull(Novels.findRe("  "))
    }

    @Test fun longParagraphsAreCutForTheSpeechEngineLosingNothing() {
        val text = "جملة قصيرة. ".repeat(1000)
        val parts = Novels.speechParts(text, 3800)
        assertTrue(parts.size > 1); assertTrue(parts.all { it.length <= 3800 })
        assertEquals(text.trimEnd(), parts.joinToString("").trimEnd())
        assertEquals(listOf("short"), Novels.speechParts("short"))
        assertEquals(3, Novels.speechParts("x".repeat(7000), 3000).size) // no space to cut at
    }

    @Test fun everyLineLandsOnOnePageAndEachPageFits() {
        val blocks = listOf(FloatArray(2) { 30f }, FloatArray(40) { 20f }, FloatArray(1) { 20f }, FloatArray(25) { 20f })
        val pages = Novels.fitPages(blocks, 300f, 10f)
        blocks.forEachIndexed { b, lines ->
            val runs = pages.flatten().filter { it.block == b }.sortedBy { it.from }
            assertEquals(0, runs.first().from); assertEquals(lines.size, runs.last().to)
            runs.zipWithNext().forEach { (x, y) -> assertEquals(x.to, y.from) } // none lost, none twice
        }
        pages.forEach { page ->
            val h = page.sumOf { s -> (s.from until s.to).sumOf { blocks[s.block][it].toDouble() } } + 10.0 * (page.size - 1)
            assertTrue("$h", h <= 300.0)
        }
        assertEquals(1, Novels.fitPages(listOf(FloatArray(1) { 900f }), 300f, 10f).size) // taller than the page: still shown
    }

    @Test fun aSpotFindsItsPage() {
        val blocks = listOf(FloatArray(1) { 50f }, FloatArray(20) { 20f }, FloatArray(20) { 20f })
        val pages = Novels.fitPages(blocks, 200f, 0f)
        val lines = { b: Int -> blocks.getOrNull(b)?.size ?: 1 }
        assertEquals(0, Novels.pageOf(pages, lines, 0.0))
        val p = Novels.pageOf(pages, lines, 1.5) // halfway down the second paragraph: its line 10
        assertTrue(pages[p].any { it.block == 2 && 10 in it.from until it.to })
        assertEquals(pages.size - 1, Novels.pageOf(pages, lines, 1e6)) // past the end: the last
    }
}
