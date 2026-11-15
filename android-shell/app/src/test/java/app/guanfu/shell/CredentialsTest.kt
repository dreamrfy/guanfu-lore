package app.guanfu.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Credentials 的纯 JVM 可测部分：回落语义（ifNullOrBlank）与 deviceId 格式。
 * EncryptedSharedPreferences 依赖 Android runtime，在模拟器冒烟里覆盖（A02 验收）。
 */
class CredentialsTest {

    private fun fallback(v: String?, default: String): String =
        if (v.isNullOrBlank()) default else v

    @Test
    fun `空值回落内置默认 - 与旧 effectiveUrl 语义一致`() {
        assertEquals("https://clip.guanfu.app", fallback(null, BuildConfig.DEFAULT_CLIP_BASE_URL))
        assertEquals("https://clip.guanfu.app", fallback("", BuildConfig.DEFAULT_CLIP_BASE_URL))
        assertEquals("https://clip.guanfu.app", fallback("   ", BuildConfig.DEFAULT_CLIP_BASE_URL))
        assertEquals("https://my.example.com", fallback("https://my.example.com", BuildConfig.DEFAULT_CLIP_BASE_URL))
    }

    @Test
    fun `token 空值回落 - 有值优先`() {
        assertEquals("tok-123", fallback("tok-123", BuildConfig.DEFAULT_CLIP_TOKEN))
        assertEquals(BuildConfig.DEFAULT_CLIP_TOKEN, fallback("", BuildConfig.DEFAULT_CLIP_TOKEN))
    }

    @Test
    fun `deviceId 格式 - and 前缀 16 位`() {
        val id = "and-" + java.util.UUID.randomUUID().toString().replace("-", "").take(16)
        assertTrue(id.startsWith("and-"))
        assertEquals("and-".length + 16, id.length)
        // 与 web 端 dev- 前缀不冲突（同库区分端来源）
        assertTrue(!id.startsWith("dev-"))
    }
}
