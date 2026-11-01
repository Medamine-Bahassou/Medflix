package com.medanime.app.ui

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import kotlin.concurrent.thread

class MediaProbeTest {
    @Test fun rejectsHostErrorsAndArchivesInsteadOfTreatingThemAsVideos() {
        assertFalse(isVideoResponse(403, "application/json", "{\"su".toByteArray()))
        assertFalse(isVideoResponse(200, "application/json", "{\"su".toByteArray()))
        assertFalse(isVideoResponse(200, "application/octet-stream", "{\"su".toByteArray()))
        assertFalse(isVideoResponse(200, "text/html", "<htm".toByteArray()))
        assertFalse(isVideoResponse(200, "application/octet-stream", byteArrayOf(80, 75, 3, 4)))
        assertTrue(isVideoResponse(206, "video/mp4", byteArrayOf(0, 0, 0, 32)))
        assertTrue(isVideoResponse(200, "application/octet-stream", byteArrayOf(0, 0, 0, 32)))
    }
    @Test fun rangeProbeRejectsJsonAndClosesResponse() = runBlocking {
        ServerSocket(0).use { server ->
            var request = ""
            val worker = thread {
                server.accept().use { socket ->
                    val input = socket.getInputStream().bufferedReader()
                    val lines = mutableListOf<String>()
                    while (true) { val line = input.readLine() ?: break; if (line.isEmpty()) break; lines += line }
                    request = lines.joinToString("\n")
                    val json = "{\"success\":false,\"value\":\"hotlink_detected\"}"
                    socket.getOutputStream().write(("HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: ${json.length}\r\nConnection: close\r\n\r\n$json").toByteArray())
                }
            }
            try {
                MediaProbe.video("http://127.0.0.1:${server.localPort}/file")
                fail("Host denial must not be passed to the player")
            } catch (e: java.io.IOException) { assertTrue(e.message!!.contains("403")) }
            worker.join(5000)
            assertTrue(request.contains("Range: bytes=0-3", ignoreCase = true))
        }
    }
}
