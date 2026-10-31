package com.medanime.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChapterDownloadsTest {
    private fun chapter(id: String, n: String, state: String, show: String = "/manga/series/1") = JSONObject()
        .put("id", "manga:$id").put("chapterId", id).put("kind", "manga").put("show", show).put("ep", n).put("state", state)

    @Test fun completedCopySurvivesSourceChangeWithoutLosingFiles() {
        val done = chapter("new", "0", "done").put("file", "/downloads/chapter0")
            .put("files", JSONArray(listOf("/downloads/chapter0/0001.jpg"))).put("size", 1234)
        val failed = chapter("old", "0.0", "error").put("at", 9999).put("file", "/downloads/chapter0")
        val all = JSONObject().put("manga:old", failed).put("manga:new", done)
        assertTrue(ChapterDownloads.repair(all))
        assertEquals(1, all.length())
        assertSame(done, all.getJSONObject("manga:new"))
        assertEquals(1234L, done.getLong("size"))
        assertEquals("/downloads/chapter0/0001.jpg", done.getJSONArray("files").getString(0))
        assertEquals(setOf("old", "new"), ChapterDownloads.ids(done))
        assertFalse(ChapterDownloads.repair(all))
    }

    @Test fun pendingCopyWinsOverFailureAndRetainsEarlierAliases() {
        val pending = chapter("new", "1", "paused")
        val old = chapter("old", "01", "cancelled")
        ChapterDownloads.alias(old, "older")
        val all = JSONObject().put("manga:old", old).put("manga:new", pending)
        ChapterDownloads.repair(all)
        assertSame(pending, ChapterDownloads.find(all, "/manga/series/1", "1.0"))
        assertEquals(setOf("old", "older", "new"), ChapterDownloads.ids(pending))
    }

    @Test fun separateSeriesFractionalChaptersAndAnimeStaySeparate() {
        val all = JSONObject()
        listOf(chapter("a", "1", "done"), chapter("b", "1.5", "done"), chapter("c", "1", "done", "/manga/series/2"),
            chapter("d", "1", "error").put("kind", "anime")).forEach { all.put(it.getString("id"), it) }
        assertFalse(ChapterDownloads.repair(all))
        assertEquals(4, all.length())
        assertEquals("b", ChapterDownloads.find(all, "/manga/series/1", "1.50")!!.getString("chapterId"))
    }

    @Test fun newSourceIdFindsExistingDownloadByNumber() {
        val done = chapter("old", "12", "done")
        val all = JSONObject().put("manga:old", done)
        val existing = ChapterDownloads.find(all, "/manga/series/1", "12.0")!!
        ChapterDownloads.alias(existing, "new")
        assertSame(done, existing)
        assertEquals(1, all.length())
        assertTrue("new" in ChapterDownloads.ids(done))
    }
}
