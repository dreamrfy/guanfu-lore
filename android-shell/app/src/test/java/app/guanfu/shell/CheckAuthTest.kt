package app.guanfu.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 「测试连接」用的 checkAuth（GET /api/clips）单测：真机/模拟器之外的 JVM 验证 */
class CheckAuthTest {

    @Test
    fun `count from response is surfaced in message`() {
        val r = ClipClient.parseClipsResponse(
            200,
            "{\"ok\":true,\"clips\":[],\"count\":42}",
        )
        assertTrue(r.ok)
        assertTrue(r.message.contains("42"))
    }

    @Test
    fun `unauthorized message passthrough`() {
        val r = ClipClient.parseClipsResponse(
            401,
            "{\"ok\":false,\"code\":\"unauthorized\",\"error\":\"缺少或错误的访问 Token（Authorization: Bearer …）\"}",
        )
        assertEquals(false, r.ok)
        assertTrue(r.message.contains("Token"))
    }

    @Test
    fun `garbage body still yields failure not crash`() {
        val r = ClipClient.parseClipsResponse(502, "<html>Bad Gateway</html>")
        assertTrue(!r.ok)
        assertTrue(r.message.isNotBlank())
    }
}
