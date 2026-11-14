package app.guanfu.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ExtractUrlTest {

    @Test
    fun `plain url`() {
        assertEquals("https://example.com/a?b=1", ExtractUrl.from("https://example.com/a?b=1"))
    }

    @Test
    fun `url surrounded by chinese text`() {
        assertEquals("https://example.com/a", ExtractUrl.from("看看这篇 https://example.com/a 挺好"))
    }

    @Test
    fun `chinese glued after url without space`() {
        assertEquals("https://example.com/a", ExtractUrl.from("https://example.com/a标题在这里"))
    }

    @Test
    fun `trailing cjk punctuation stripped`() {
        assertEquals("https://example.com/a", ExtractUrl.from("https://example.com/a。"))
    }

    @Test
    fun `trailing ascii punctuation stripped`() {
        assertEquals("https://example.com/a", ExtractUrl.from("https://example.com/a."))
    }

    @Test
    fun `multiple urls takes first`() {
        assertEquals("https://a.com/1", ExtractUrl.from("https://a.com/1 http://b.com/2"))
    }

    @Test
    fun `text without url returns null`() {
        assertNull(ExtractUrl.from("没有任何链接的文字"))
    }

    @Test
    fun `null and blank return null`() {
        assertNull(ExtractUrl.from(null))
        assertNull(ExtractUrl.from("   "))
    }

    @Test
    fun `query and fragment preserved`() {
        assertEquals("https://a.com/p?id=3#top", ExtractUrl.from("https://a.com/p?id=3#top"))
    }
}
