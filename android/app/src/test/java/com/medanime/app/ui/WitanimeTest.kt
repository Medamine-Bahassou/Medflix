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
    fun episodeNames() = kotlinx.coroutines.runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val d = Witanime.details(doc("/anime/one-piece/"), "/anime/one-piece/")
        val info = Witanime.episodeInfo(listOf(d.title) + d.alt.split(Regex("\\s*[,،]\\s*")))
        println("${d.title} | ${info.size} named | 1: ${info[1]}")
        assertTrue("kitsu names", info.size > 1000 && info[1]?.name?.contains("Luffy") == true && info[1]!!.thumb.startsWith("https://"))
    }

    @Test
    fun fillerNames() {
        val list = """<div id="ShowList"><a href="/shows/hxh-1999">Hunter × Hunter </a><a href="/shows/hxh">Hunter × Hunter (2011)</a><a href="/shows/one-pace">One Pace (One Piece)</a><a href="/shows/one-piece">One Piece</a><a href="/shows/tybw">Bleach: Thousand-Year Blood War (Bleach: Sennen Kessen-hen)</a></div>"""
        val s = Witanime.fillerShows(list)
        assertTrue("exact beats an alias", s[Witanime.aflName("One Piece")] == "one-piece")
        assertTrue("year kept", s[Witanime.aflName("Hunter x Hunter")] == "hxh-1999" && s[Witanime.aflName("Hunter x Hunter (2011)")] == "hxh")
        assertTrue("either name", s[Witanime.aflName("Bleach: Sennen Kessen-hen")] == "tybw" && s[Witanime.aflName("Bleach: Thousand-Year Blood War")] == "tybw")
        val rows = """<table><tr class="manga_canon odd" id="eps-1"><td class="Number">1</td></tr><tr class="filler even" id="eps-2"><td class="Number">2</td></tr><tr class="mixed_canon/filler odd" id="eps-3"><td class="Number">3</td></tr></table>"""
        assertTrue("kinds", Witanime.fillerEps(rows) == mapOf(2 to "filler", 3 to "mixed"))
    }

    @Test
    fun episodeGraphRows() {
        val e = EpisodeRatings
        assertTrue("spellings", e.spelled("Naruto: Shippuuden") == e.spelled("Naruto: Shippūden") && e.spelled("Naruto: Shippuden") == e.spelled("Naruto: Shippūden"))
        assertTrue("season words and arabic", e.spelled("مسلسل Breaking Bad الموسم الاول") == "breaking bad" && e.spelled("المؤسس عثمان") == "")
        val tv = org.json.JSONArray("""[{"season":2,"number":1,"rating":{"average":8}},{"season":1,"number":2,"rating":{"average":7.5}},{"season":1,"number":1,"rating":{"average":9}},{"season":1,"number":null,"rating":{"average":9}},{"season":1,"number":3,"rating":{"average":null}}]""")
        assertTrue("tvmaze: specials out, no score yet kept", e.tvmazeRows(tv) == listOf(EpRate(1, 1, 9.0), EpRate(1, 2, 7.5), EpRate(1, 3, null), EpRate(2, 1, 8.0)))
        val edge = { s: String, n: String, r: String -> org.json.JSONObject("""{"node":{"series":{"displayableEpisodeNumber":{"displayableSeason":{"season":"$s"},"episodeNumber":{"episodeNumber":"$n"}}},"ratingsSummary":{"aggregateRating":$r}}}""") }
        assertTrue("imdb", e.imdbRows(listOf(edge("1", "2", "8.6"), edge("1", "1", "9.1"), edge("unknown", "3", "8"), edge("1", "4", "null"))) == listOf(EpRate(1, 1, 9.1), EpRate(1, 2, 8.6), EpRate(1, 4, null)))
        val show = { name: String, type: String -> org.json.JSONObject().put("name", name).put("type", type) }
        val live = show("One Piece", "Scripted"); val anime = show("One Piece", "Animation"); val want = setOf(e.spelled("One Piece"))
        assertTrue("an anime takes the animation", e.pickShow(listOf(live, anime), want, true) === anime)
        assertTrue("two of a name are none", e.pickShow(listOf(live, anime), want, false) == null)
        val rows = listOf(EpRate(1, 1, 9.0), EpRate(1, 2, null), EpRate(1, 3, 8.0), EpRate(2, 1, null))
        assertTrue("rated", e.rated(rows) == 2)
        assertTrue("a season averages only its scored episodes", e.seasonAvg(rows, 1) == "8.5" && e.seasonAvg(rows, 2) == "–")
        // the picture asked for: 9.7 the top tier, 9.5 and 9.0 the next, 8.9 the next
        assertTrue("tiers", listOf(9.7, 9.6, 9.5, 9.0, 8.9, 8.0, 7.9, 7.0, 6.0, 5.0, 4.9, 1.0).map(e::tier) == listOf(0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 6))
    }

    @Test
    fun animeGraphRows() {
        val e = EpisodeRatings
        val poll = { n: Int, raw: String -> """<tr class="episode-list-data"><td class="episode-number nowrap" data-raw="$n">$n</td><td class="episode-poll ac nowrap scored" data-raw="$raw"></td></tr>""" }
        val eps = e.malEpisodes("<table><thead><tr><td class=\"episode-poll\"></td></tr></thead>${poll(1, "4.25")}${poll(2, "0")}<tr class=\"episode-list-data\"><td class=\"episode-number nowrap\" data-raw=\"3\">3</td></tr></table>")
        assertTrue("polls out of 5 read out of 10, unvoted null", eps == listOf(1 to 8.5, 2 to null, 3 to null))
        val stat = { s: Int, n: Int -> """<tr><td class="score-label score-$s">$s</td><td><small>($n votes)</small></td></tr>""" }
        assertTrue("votes, 10 first", e.malVotes("<table class=\"score-stats\">${stat(10, 276544)}${stat(9, 77856)}${stat(1, 3)}</table>") == listOf(276544, 77856, 0, 0, 0, 0, 0, 0, 0, 3))
        val ani = org.json.JSONObject("""{"stats":{"scoreDistribution":[{"score":10,"amount":7},{"score":100,"amount":5}]}}""")
        assertTrue("anilist's are by tens", e.aniVotes(ani) == listOf(5, 0, 0, 0, 0, 0, 0, 0, 0, 7))
        val media = { name: String, format: String -> org.json.JSONObject().put("format", format).put("title", org.json.JSONObject().put("romaji", name)).put("synonyms", org.json.JSONArray()) }
        val manga = media("Solo Leveling", "MANGA"); val novel = media("Solo Leveling", "NOVEL")
        assertTrue("a manga isn't its novel", e.aniPick(listOf(novel, manga), listOf("Solo Leveling"), false) === manga)
        assertTrue("two of a name are none", e.aniPick(listOf(manga, media("Solo Leveling", "MANGA")), listOf("Solo Leveling"), false) == null)
        assertTrue("nor its pilot", e.aniPick(listOf(media("Solo Leveling", "ONE_SHOT"), manga), listOf("Solo Leveling"), false) === manga)
        val other = media("Wan Piece", "MANGA").put("synonyms", org.json.JSONArray().put("One Piece")); val onePiece = media("ONE PIECE", "MANGA")
        assertTrue("its own name before another's synonym", e.aniPick(listOf(other, onePiece), listOf("One Piece"), false) === onePiece)
        assertTrue("a synonym, when it's all there is", e.aniPick(listOf(other), listOf("One Piece"), false) === other)
        val show = media("Frieren", "TV")
        assertTrue("an anime's the show, and the exact name", e.aniPick(listOf(media("Frieren", "MOVIE"), show, media("Frieren 2nd Season", "TV")), listOf("Frieren"), true) === show)
        val node = { id: Int, format: String, type: String -> org.json.JSONObject().put("relationType", "SEQUEL").put("node", org.json.JSONObject().put("id", id).put("format", format).put("type", type)) }
        val linked = org.json.JSONObject().put("relations", org.json.JSONObject().put("edges", org.json.JSONArray().put(node(1, "MANGA", "MANGA")).put(node(2, "MOVIE", "ANIME")).put(node(3, "TV", "ANIME"))))
        assertTrue("the next season's the show, not the film or the manga", e.aniNext(linked, "SEQUEL")?.optInt("id") == 3)
        assertTrue("a film's still walked through", e.aniNext(org.json.JSONObject().put("relations", org.json.JSONObject().put("edges", org.json.JSONArray().put(node(2, "MOVIE", "ANIME")))), "SEQUEL")?.optInt("id") == 2)
    }

    @Test
    fun episodeGraphLive() = kotlinx.coroutines.runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val anime = EpisodeRatings.get(listOf("One Piece"), "", true)
        println("One Piece: imdb ${anime?.imdb?.size} tvmaze ${anime?.tvmaze?.size} mal ${anime?.mal?.size}")
        assertTrue("myanimelist's polls and anilist's votes", (anime?.mal?.size ?: 0) > 1000 && anime?.votes?.firstOrNull()?.first == "AniList")
        val seasons = EpisodeRatings.get(listOf("Sousou no Frieren"), "", true)?.mal?.map { it.season }?.distinct()
        assertTrue("its seasons by anilist's links: $seasons", seasons == listOf(1, 2))
        val berserk = EpisodeRatings.manga(listOf("Berserk"))
        assertTrue("a manga's votes from both", berserk?.votes?.map { it.first } == listOf("AniList", "MyAnimeList"))
        assertTrue("the anime, not the 8-episode live action", (anime?.imdb?.size ?: 0) > 1000 && (anime?.tvmaze?.size ?: 0) > 100 && anime!!.url.contains("tvmaze.com"))
        val series = EpisodeRatings.get(listOf("مسلسل Breaking Bad الموسم الاول"), "", false)
        println("Breaking Bad: imdb ${series?.imdb?.size} tvmaze ${series?.tvmaze?.size}")
        assertTrue("a series, by the English in its name", series?.imdb?.size == 62 && series.tvmaze.size == 62)
    }

    @Test
    fun hideFiller() {
        val row = { n: String, kind: String, last: Boolean -> Numbered(n, false, last, Screen.Play(n), filler = kind) }
        val list = listOf(row("1", "", false), row("2", "filler", false), row("3", "mixed", false), row("4", "filler", true))
        val labels = { rev: Boolean, typed: String, hide: Boolean -> shownRows(list, rev, typed, hide).map { it.label } }
        assertTrue("off: all", labels(false, "", false) == listOf("1", "2", "3", "4"))
        assertTrue("on: filler goes, mixed and the one left off at stay", labels(false, "", true) == listOf("1", "3", "4"))
        assertTrue("reversed too", labels(true, "", true) == listOf("4", "3", "1"))
        assertTrue("a number typed shows even if hidden", labels(false, "2", true) == listOf("2"))
    }

    @Test
    fun fillerLive() = kotlinx.coroutines.runBlocking {
        Pages.dir = kotlin.io.path.createTempDirectory().toFile()
        val f = Witanime.filler(listOf("Naruto: Shippuuden")) // the site's "Naruto Shippuden"
        println("${f.size} marked")
        assertTrue("filler", f.values.count { it == "filler" } > 100 && f.size < 400) // of 500: canon left out
        assertTrue("kitsu's name", Witanime.filler(listOf("Boku no Hero Academia")).isNotEmpty()) // the site's "My Hero Academia"
    }

    @Test
    fun cinema() {
        val doc = Jsoup.parse(http.newCall(Request.Builder().url(Cinema.ED + "/category/foreign-movies/").header("User-Agent", UA).build()).execute().body!!.string(), Cinema.ED)
        val cards = Cinema.cards(doc)
        println(cards.take(3).map { "${it.title} | ${it.year} | ${it.path}" })
        assertTrue("cinema cards", cards.size >= 10 && cards.all { it.poster.isNotEmpty() && it.title.isNotEmpty() })
    }
}
