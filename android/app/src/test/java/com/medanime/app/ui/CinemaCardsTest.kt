package com.medanime.app.ui

import org.jsoup.Jsoup
import org.junit.Assert.*
import org.junit.Test

class CinemaCardsTest {
    private fun card(slug: String, title: String, category: String = "") = """<a class="movie__block" href="https://m.myseed.tv/$slug/" title="$title"><div class="post__category hide__md">$category</div><h3>$title</h3></a>"""
    private fun cards(vararg html: String) = Cinema.cards(Jsoup.parse(html.joinToString("")))

    @Test fun softwareGamesMusicAndUnclassifiedPostsAreNotMovies() {
        assertTrue(cards(
            card("برنامج-المحادثات-whatsapp", "برنامج المحادثات WhatsApp", "برامج كمبيوتر"),
            card("whatsapp-for-windows", "WhatsApp for Windows اخر اصدار", "برامج كمبيوتر"),
            card("تحميل-واتس-اب", "تحميل برنامج واتس اب", "موبايلات"),
            card("game-download", "Some Game", "ألعاب"),
            card("best-of-inception", "تحميل VA Best Of Inception", "البومات اجنبية"),
            card("inception-trailer", "Inception Trailer", "كليبات"),
            card("unclassified", "Some Download"),
            card("برنامج-unlabelled-app", "برنامج Some App")
        ).isEmpty())
    }

    @Test fun filmsSeriesEpisodesAndTvProgramsRemain() {
        val found = cards(
            card("فيلم-inception", "فيلم Inception 2010 مترجم", "أفلام أجنبية"),
            card("by-any-means", "By Any Means", "أفلام أجنبية"),
            card("serie/breaking-bad", "Breaking Bad"),
            card("selary/dexter", "Dexter"),
            card("episode/lost-s01e01", "Lost الحلقة 1"),
            card("برنامج-tv-show", "برنامج TV Show", "برامج تلفزيونية")
        )
        assertEquals(6, found.size)
        assertTrue(found.any { it.title == "Inception" })
    }

    @Test fun aRealMovieMayHaveAnAppName() {
        assertEquals(1, cards(card("فيلم-whatsapp-2026", "فيلم WhatsApp 2026 مترجم", "أفلام أجنبية")).size)
        assertTrue(cards(card("فيلم-download", "فيلم Download", "برامج كمبيوتر")).isEmpty())
    }

    @Test fun animeIsStillExcluded() {
        assertTrue(cards(card("فيلم-naruto", "فيلم Naruto", "أفلام انمي")).isEmpty())
    }
}
