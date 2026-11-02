package com.medanime.app.ui

import org.junit.Assert.*
import kotlinx.coroutines.launch
import org.junit.Test

class RateFilterTest {
    private fun film(title: String, year: String = "2010") = Card("/cinema/$title", "cinema", title, "", "", year, "", null, "/cinema/$title")
    private val series = Card("/cinema/serie/bb", "cinema", "Breaking Bad الموسم الخامس", "", "", "2012", "", null, "/cinema/serie/bb")

    @Test fun allNeedsEveryScoreAnyNeedsOne() {
        val f = RateFilter(mapOf("imdb" to 7.0, "rt" to 70.0))
        val mixed = mapOf("imdb" to 8.0, "rt" to 50.0)
        assertFalse(f.passes("cinema", mixed))
        assertTrue(f.copy(any = true).passes("cinema", mixed))
    }

    @Test fun notKnownYetStaysOutAndNoScoreFollowsKeep() {
        val f = RateFilter(mapOf("imdb" to 7.0))
        assertFalse(f.passes("cinema", emptyMap()))
        assertFalse(f.passes("cinema", mapOf("imdb" to null)))
        assertTrue(f.copy(keep = true).passes("cinema", mapOf("imdb" to null)))
        assertFalse("keep isn't for what's still being looked up", f.copy(keep = true).passes("cinema", emptyMap()))
    }

    @Test fun aScoreLeavesOtherSectionsAlone() {
        assertTrue(RateFilter(mapOf("imdb" to 9.0)).passes("anime", emptyMap()))
        assertFalse(RateFilter(mapOf("anilist" to 9.0)).passes("anime", emptyMap()))
    }

    @Test fun sortsBestFirstAndShowsTheScoreJudgedBy() {
        val a = film("A"); val b = film("B"); val none = film("C")
        val l = RateFilter(sort = "imdb").apply(listOf(a, none, b), mapOf(a.path to mapOf("imdb" to 7.0), b.path to mapOf("imdb" to 9.0), none.path to mapOf("imdb" to null)))
        assertEquals(listOf("B", "A", "C"), l.map { it.title })
        assertEquals("IMDb 9.0", l[0].score)
        assertEquals("the site's own rating is left as it was, for what's saved", "", l[0].rating)
        assertEquals("", l[2].score)
    }

    @Test fun picksByNameKindAndYear() {
        val rows = listOf(Hit(listOf("Dune"), "1984", false, 6.3), Hit(listOf("Dune"), "2021", false, 8.0), Hit(listOf("Dune"), "2000", true, 7.0))
        assertEquals(8.0, Scores.pick(rows, film("Dune", "2021"))!!.a!!, 0.0)
        assertEquals("a year off still finds it", 8.0, Scores.pick(rows, film("Dune", "2022"))!!.a!!, 0.0)
        assertNull("two of that name and no year: neither", Scores.pick(rows, film("Dune", "")))
        assertNull(Scores.pick(rows, film("Dune 2", "2021")))
        assertEquals("a series' card has its season's year", 9.5, Scores.pick(listOf(Hit(listOf("Breaking Bad"), "2008", true, 9.5)), series)!!.a!!, 0.0)
    }

    @Test fun readsBothOfRottenTomatoesRowSpellings() {
        val hits = Scores.rtHits("""<search-page-result type="movie"><ul><search-page-media-row release-year="2010" tomatometer-score="86"><a slot="thumbnail"><img></a><a slot="title"> Inception </a></search-page-media-row></ul></search-page-result>
            <search-page-result type="tvSeries"><search-page-media-row startyear="2008" tomatometerscore="96"><a slot="title">Breaking Bad</a></search-page-media-row><search-page-media-row startyear="2020" tomatometerscore=""><a slot="title">No Score</a></search-page-media-row></search-page-result>
            <search-page-result type="franchise"><search-page-media-row tomatometer-score="1"><a slot="title">Skip</a></search-page-media-row></search-page-result>""")
        assertEquals(listOf("Inception", "Breaking Bad", "No Score"), hits.map { it.names[0] })
        assertEquals(86.0, hits[0].a!!, 0.0); assertEquals("2010", hits[0].year); assertFalse(hits[0].series)
        assertEquals(96.0, hits[1].a!!, 0.0); assertEquals("2008", hits[1].year); assertTrue(hits[1].series)
        assertNull(hits[2].a)
    }

    @Test fun aniListScoreIsTheOneRowOfThatName() {
        val rows = org.json.JSONArray("""[{"title":{"romaji":"NARUTO","english":"Naruto","native":"x"},"synonyms":[],"averageScore":80},
            {"title":{"romaji":"NARUTO Spin-off","english":null,"native":"y"},"synonyms":["Other Name"],"averageScore":69},
            {"title":{"romaji":"Twin"},"synonyms":[],"averageScore":70},{"title":{"romaji":"Twin"},"synonyms":[],"averageScore":50},
            {"title":{"romaji":"Unscored"},"synonyms":[],"averageScore":null}]""")
        assertEquals(8.0, SourceRatings.aniScore(rows, listOf("Naruto"))!!, 0.0)
        assertEquals("a card's other name counts", 6.9, SourceRatings.aniScore(rows, listOf("nope", "Other Name"))!!, 0.001)
        assertNull("two of that name: neither", SourceRatings.aniScore(rows, listOf("Twin")))
        assertNull(SourceRatings.aniScore(rows, listOf("Unscored")))
    }

    @Test fun startsFromTheRatingListsOnlyWhereTheyCanHaveTheAnswer() {
        assertEquals(listOf("imdb"), RateFilter(mapOf("rt" to 70.0, "imdb" to 7.0)).leads())
        assertEquals("any of them: each one's list", listOf("imdb", "rt"), RateFilter(mapOf("rt" to 70.0, "imdb" to 7.0), any = true).leads())
        assertEquals("sorted by a score, with no minimum", listOf("rt"), RateFilter(sort = "rt").leads())
        assertNull("no score means not on any list", RateFilter(mapOf("imdb" to 7.0), keep = true).leads())
        assertNull(RateFilter(mapOf("anilist" to 7.0)).leads())
    }

    @Test fun sectionsAreThoseItsScoresRate() {
        val films = RateFilter(mapOf("imdb" to 7.0))
        assertEquals(listOf("cinema"), films.sections(""))
        assertEquals(emptyList<String>(), films.sections("anime"))
        assertEquals(listOf("anime", "manga"), RateFilter(sort = "anilist").sections(""))
        assertEquals("no score rates novels", emptyList<String>(), RateFilter(mapOf("anilist" to 7.0, "imdb" to 7.0)).sections("novels"))
        assertEquals(emptyList<String>(), RateFilter().sections(""))
    }

    @Test fun typingLooksThroughWhatWasFound() {
        val c = film("Fullmetal Alchemist: Brotherhood").copy(names = listOf("Hagane no Renkinjutsushi"))
        assertTrue(narrows("", c))
        assertTrue("its middle", narrows("alchem", c))
        assertTrue("a near spelling", narrows("fullmetal alchemst", c))
        assertTrue("another of its names", narrows("renkinjutsushi", c))
        assertFalse(narrows("naruto", c))
    }

    @Test fun answersArrivingTogetherAreHandedOverTogether() = kotlinx.coroutines.runBlocking {
        val calls = ArrayList<List<Int>>()
        batched<Int>({ calls += it }) { add ->
            (1..50).forEach { n -> launch { add(n) } }
            launch { kotlinx.coroutines.delay(350); add(51) }
        }
        assertEquals("a burst, then the late one, not 51 redraws", listOf((1..50).toList(), listOf(51)), calls)
    }

    @Test fun whatsInHandIsntLostWhenStopped() = kotlinx.coroutines.runBlocking {
        val got = ArrayList<Int>()
        val job = launch { batched<Int>({ got += it }) { add -> launch { add(1); kotlinx.coroutines.delay(10_000); add(2) } } }
        kotlinx.coroutines.delay(50); job.cancel(); job.join()
        assertEquals(listOf(1), got)
    }

    @Test fun rankedListsParse() {
        val i = Scores.imdbRanked("""{"data":{"advancedTitleSearch":{"pageInfo":{"endCursor":"abc","hasNextPage":true},"edges":[{"node":{"title":{"titleType":{"id":"tvSeries"},"titleText":{"text":"MobLand"},"releaseYear":{"year":2025},"ratingsSummary":{"aggregateRating":8.3},"metacritic":null}}}]}}}""")
        assertEquals("abc", i.next); assertEquals(8.3, i.hits[0].a!!, 0.0); assertTrue(i.hits[0].series)
        val rt = Scores.rtRanked("""{"grid":{"list":[{"title":"The Cycle ","releaseDateText":"Streaming Oct 23, 2026","mediaUrl":"/m/the_cycle_2026","criticsScore":{"score":"95"}},
            {"title":"Low","releaseDateText":"Streaming Oct 23, 2026","mediaUrl":"/m/low","criticsScore":{"score":"50"}},{"title":"None","mediaUrl":"/m/none","criticsScore":{"score":""}},
            {"title":"Nocturne","releaseDateText":"Latest Episode: Oct 30","mediaUrl":"/tv/nocturne","criticsScore":{"score":"86"}}]},"pageInfo":{"endCursor":"Mjk=","hasNextPage":false}}""", 70.0)
        assertEquals(listOf("The Cycle", "Nocturne"), rt.hits.map { it.names[0] }); assertEquals("2026", rt.hits[0].year); assertEquals("", rt.hits[1].year); assertTrue(rt.hits[1].series); assertNull(rt.next)
        val mc = { min: Double -> Scores.mcRanked("""{"data":{"items":[{"title":"Dekalog (1988)","type":"movie","premiereYear":1996,"criticScoreSummary":{"score":100}},{"title":"Fine","type":"show","premiereYear":2020,"criticScoreSummary":{"score":80}}]}}""", min, 30) }
        assertEquals("Dekalog", mc(70.0).hits[0].names[0]); assertEquals("1988", mc(70.0).hits[0].year); assertTrue(mc(70.0).hits[1].series); assertEquals("32", mc(70.0).next)
        assertEquals("under the minimum: the rest are too", listOf("Dekalog"), mc(90.0).hits.map { it.names[0] }); assertNull(mc(90.0).next)
    }

    @Test fun aKeptCardIsTheSameCard() {
        val c = Card("/cinema/episode/x", "cinema", "Show", "p.jpg", "7.5", "2020", "الحلقة 3", null, "/cinema/episode/x", open = Screen.CinemaTitle("episode/x", show = true), desc = "d", dub = true)
        assertEquals(c, Scores.cardOf(Scores.cardJson(c)))
        val film = Card("/cinema/x", "cinema", "Film", "", "", "", "", null, "/cinema/x")
        assertEquals(film, Scores.cardOf(Scores.cardJson(film)))
    }

    @Test fun readsImdbTypesAndScores() {
        val hits = Scores.imdbHits("""{"data":{"mainSearch":{"edges":[
            {"node":{"entity":{"titleType":{"id":"movie"},"titleText":{"text":"Inception"},"releaseYear":{"year":2010},"ratingsSummary":{"aggregateRating":8.8},"metacritic":{"metascore":{"score":74}}}}},
            {"node":{"entity":{"titleType":{"id":"video"},"titleText":{"text":"Inception: X"},"releaseYear":{"year":2010},"ratingsSummary":{"aggregateRating":7.5},"metacritic":null}}},
            {"node":{"entity":{"titleType":{"id":"tvMiniSeries"},"titleText":{"text":"Mini"},"releaseYear":{"year":2019},"ratingsSummary":{"aggregateRating":null},"metacritic":null}}},
            {"node":{"entity":{"titleType":{"id":"tvMovie"},"titleText":{"text":"TV Film"},"releaseYear":null,"ratingsSummary":null,"metacritic":null}}}]}}}""")
        assertEquals(listOf("Inception", "Mini", "TV Film"), hits.map { it.names[0] })
        assertEquals(8.8, hits[0].a!!, 0.0); assertEquals(74.0, hits[0].b!!, 0.0); assertFalse(hits[0].series)
        assertTrue(hits[1].series); assertNull(hits[1].a)
        assertFalse(hits[2].series)
    }
}
