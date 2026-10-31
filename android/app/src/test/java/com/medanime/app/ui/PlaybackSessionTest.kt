package com.medanime.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackSessionTest {
    @Test fun restoresNavigationAndBackHistory() {
        val stack = listOf(Screen.Home, Screen.Anime, Screen.Grid("New", "/new"), Screen.Search("a", "anime"),
            Screen.MyList, Screen.Settings("downloads"), Screen.Title("/anime/show"), Screen.Play("/watch/show/1"),
            Screen.Manga, Screen.MangaBrowse(mapOf("search" to "漫画", "type" to "1")), Screen.MangaSeries("o:test"),
            Screen.MangaRead("o:test:2", "عنوان", "2"), Screen.Cinema, Screen.CinemaBrowse("movies"),
            Screen.CinemaTitle("season/show", true), Screen.CinemaPlay("episode/show-2"), Screen.Downloads("/anime/show"),
            Screen.Offline("/watch/show/1"), Screen.Section("new"), Screen.Hidden, Screen.Schedule,
            Screen.Trailer("https://example.com/embed", "Trailer"))
        assertEquals(stack, decodeScreens(encodeScreens(stack)))
    }
    @Test fun emptyNavigationRoundTrips() { assertEquals(emptyList<Screen>(), decodeScreens(encodeScreens(emptyList()))) }
    @Test(expected = Exception::class) fun rejectsUnknownScreens() { decodeScreens("[{\"type\":\"Removed\"}]") }

    @Test fun automaticPipDefaultsOnAndHonorsSavedChoice() {
        assertEquals(true, autoPipEnabled(org.json.JSONObject()))
        val prefs = org.json.JSONObject().put("autoPip", false)
        assertEquals(false, autoPipEnabled(org.json.JSONObject(prefs.toString())))
        assertEquals(true, autoPipEnabled(prefs.put("autoPip", true)))
    }

    @Test fun controlsDispatchPlayAndPauseAndWaitForVideoConfirmation() {
        val controls = PlaybackControls()
        val commands = mutableListOf<Boolean>()
        val detach = controls.bind(true) { commands.add(it) }
        controls.play(true)
        assertEquals(listOf(true), commands)
        assertEquals(true, controls.paused) // a rejected play request must still show Play
        controls.report(false)
        assertEquals(false, controls.paused)
        controls.play(false)
        assertEquals(listOf(true, false), commands)
        controls.report(true)
        assertEquals(true, controls.paused)
        detach()
        assertEquals(false, controls.available)
        controls.play(true)
        assertEquals(2, commands.size)
    }

    @Test fun releasingOldPlayerDoesNotDisconnectTheNewPlayer() {
        val controls = PlaybackControls()
        val commands = mutableListOf<Boolean>()
        val old = controls.bind(false) { error("old player received a command") }
        val current = controls.bind(true) { commands.add(it) }
        old()
        controls.play(true)
        assertEquals(listOf(true), commands)
        current()
    }

    @Test fun videoEventsUpdatePipObserversAndUnsubscribeOnDestroy() {
        val controls = PlaybackControls()
        val states = mutableListOf<Boolean>()
        val stop = controls.observe { states.add(controls.paused) }
        controls.report(false)
        controls.report(false)
        controls.report(true)
        stop()
        controls.report(false)
        assertEquals(listOf(true, false, true), states)
    }
}
