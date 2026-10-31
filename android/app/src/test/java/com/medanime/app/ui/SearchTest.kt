package com.medanime.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchTest {
    @Test fun normalizesArabicAndRequestPhrasing() {
        assertEquals("اكاديميه 2 3", fold("أَكـاديميّة ٢ ۳"))
        assertEquals("ناروتو", searchQuery("ابحث عن ناروتو مترجم"))
        assertEquals("naruto", searchQuery("please find Naruto"))
        assertEquals("a silent voice", searchQuery("A Silent Voice"))
        assertEquals("sword art online", searchQuery("Sword Art Online"))
    }
    @Test fun ranksExactTitlesBeforeSequelsAndTypos() {
        assertEquals(1.0, closeness("SpiderMan", "Spider-Man"), 0.0)
        assertTrue(closeness("Naruto", "Naruto") > closeness("Naruto", "Naruto Shippuden"))
        listOf("naurto" to "Naruto", "slayer demon" to "Demon Slayer", "nar" to "Naruto", "atack titan" to "Attack on Titan").forEach { (q, title) ->
            assertTrue(q, closeness(q, title) >= .62)
        }
    }
    @Test fun rejectsNoiseAndWrongNumbers() {
        listOf("it" to "Titan", "one piece" to "One Punch Man", "Naruto 2" to "Naruto 3", "Dune 2021" to "Dune 1984").forEach { (q, title) ->
            assertEquals(q, 0.0, closeness(q, title), 0.0)
        }
    }
    @Test fun matchesJoinedNamesAndEquivalentSeasonWording() {
        assertEquals(1.0, closeness("Ao Ashi 2nd Season", "Aoashi Season 2"), 0.0)
        assertEquals(1.0, closeness("Aoashi second season", "Ao Ashi Season2"), 0.0)
        assertTrue(closeness("Ao Ashi", "Aoashi Season 2") >= .62)
        assertEquals(0.0, closeness("Ao Ashi 2nd Season", "Aoashi"), 0.0)
        assertEquals(0.0, closeness("Ao Ashi 2nd Season", "Aoashi Season 3"), 0.0)
    }
    private fun card(title: String) = Card("/" + title, "anime", title, "", "", "", "", null, "")
    @Test fun retrievesScreenshotExampleWithoutSuggestions() = kotlinx.coroutines.runBlocking {
        val calls = mutableListOf<String>()
        val results = fuzzySearch("Ao Ashi 2nd Season", "anime", suggestions = { _, _ -> emptyList() }) { q ->
            calls.add(q)
            if (q == "aoashi") listOf(card("Aoashi"), card("Aoashi Season 2"), card("Aoashi Season 3")) else emptyList()
        }
        assertTrue("must query the source's joined base name", "aoashi" in calls)
        assertTrue("must not search only the generic season suffix", "season" !in calls)
        assertEquals(listOf("Aoashi Season 2"), results.map { it.title })
    }
    @Test fun aliasesCannotEraseRequestedSeason() = kotlinx.coroutines.runBlocking {
        val results = fuzzySearch("Ao Ashi 2nd Season", "anime", suggestions = { _, _ -> listOf("Aoashi Season 2", "Aoashi") }) {
            listOf(card("Aoashi"), card("Aoashi Season 2"))
        }
        assertEquals(listOf("Aoashi Season 2"), results.map { it.title })
    }
}
