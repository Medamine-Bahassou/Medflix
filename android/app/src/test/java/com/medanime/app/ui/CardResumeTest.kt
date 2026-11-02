package com.medanime.app.ui

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CardResumeTest {
    private fun card(show: String, type: String = "anime", path: String = show, badge: String = "", open: Screen? = null) = Card(path, type, "T", "", "", "", badge, null, show, open = open)

    @Test fun nothingStartedHasNothingToAsk() {
        assertNull(resumeOf(card("/anime/none")))
        assertNull(resumeOf(card("/manga/series/none", "manga")))
        assertNull(resumeOf(card("/novel/none", "novel")))
        assertNull(resumeOf(card("/cinema/none", "cinema")))
        assertNull(resumeOf(card("/airing/x")))
    }

    @Test fun eachKindResumesWhereItWasLeft() {
        Store["history"].put("/anime/a", JSONObject().put("epPath", "/ep/a-5").put("ep", "5"))
        Store["history"].put("/cinema/film", JSONObject().put("slug", "film"))
        Store["history"].put("/cinema/season/s", JSONObject().put("slug", "episode/s-3").put("ep", "3"))
        Store["manga"].put("m1", JSONObject().put("chapterId", "c9").put("n", "9.0").put("title", "M"))
        Store["novels"].put("n1", JSONObject().put("ch", "chapter-7").put("n", "7").put("title", "N"))
        try {
            assertEquals(Screen.Play("/ep/a-5"), resumeOf(card("/anime/a"))?.first)
            assertEquals(Screen.CinemaPlay("film"), resumeOf(card("/cinema/film", "cinema"))?.first)
            assertEquals(Screen.CinemaPlay("episode/s-3"), resumeOf(card("/cinema/season/s", "cinema"))?.first)
            assertEquals(Screen.MangaRead("c9", "M", "9"), resumeOf(card("/manga/series/m1", "manga"))?.first)
            assertEquals(Screen.NovelRead("n1", "chapter-7", "N", "7"), resumeOf(card("/novel/n1", "novel"))?.first)
        } finally {
            Store["history"].remove("/anime/a"); Store["history"].remove("/cinema/film"); Store["history"].remove("/cinema/season/s"); Store["manga"].remove("m1"); Store["novels"].remove("n1")
        }
    }

    @Test fun aCardThatJumpsIntoAnEpisodeOrChapterAlwaysAsks() {
        // the latest ones, never started
        assertTrue(asksFirst(card("/anime/new", "episode", "/ep/new-12", "EP 12")))
        assertTrue(asksFirst(card("/manga/series/new", "manga", badge = "Ch 12", open = Screen.MangaRead("c12"))))
        assertEquals(Screen.Play("/ep/new-12"), ownOf(card("/anime/new", "episode", "/ep/new-12", "EP 12"), null)?.first)
        // a title's own card opens its page: nothing to spoil, nothing to ask
        assertFalse(asksFirst(card("/anime/new")))
        assertFalse(asksFirst(card("/manga/series/new", "manga")))
        assertFalse(asksFirst(card("/novel/new", "novel", badge = "Ch 50")))
        assertFalse(asksFirst(card("/airing/x")))
        // a film or series' latest episode opens its season page: no asking, and never played by the page button
        val ep = card("/cinema/episode/x", "cinema", badge = "الحلقة 3", open = Screen.CinemaTitle("episode/x", show = true))
        assertFalse(asksFirst(ep))
        assertNull(ownOf(ep, null))
    }

    @Test fun aCardsOwnEpisodeIsOfferedOnlyIfItsAnotherOne() {
        val left = Screen.Play("/ep/a-5")
        // the latest episode's card: a third choice
        assertEquals(Screen.Play("/ep/a-12"), ownOf(card("/anime/a", "episode", "/ep/a-12", "EP 12"), left)?.first)
        // that same episode, or a plain card: just the two
        assertNull(ownOf(card("/anime/a", "episode", "/ep/a-5", "EP 5"), left))
        assertNull(ownOf(card("/anime/a", badge = "9.1"), left))
        // a manga's: the same chapter, even without the title the saved one has
        val ch = Screen.MangaRead("c9", "M", "9")
        assertNull(ownOf(card("/manga/series/m1", "manga", badge = "Ch 9", open = Screen.MangaRead("c9")), ch))
        assertEquals("c10", (ownOf(card("/manga/series/m1", "manga", badge = "Ch 10", open = Screen.MangaRead("c10")), ch)?.first as Screen.MangaRead).cid)
    }
}
