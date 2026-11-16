package app.guanfu.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * 对真实服务（https://clip.guanfu.app）的契约冒烟测试。
 * 仅在本机存在 E:/credentials/clip.token 时运行；token 值不写入任何输出。
 *
 * 注意：VPS 当前部署的服务端没有「客户端提交正文」分支（html 直交是本地较新代码，
 * 待服务端部署任务上线后再补成功路径）。当前部署版对非公众号/B站链接的正确回应
 * 是 422 白名单提示——本测试以此验证：路由、Bearer 鉴权、JSON 契约端到端全通，
 * 且不在用户剪藏箱里制造真实记录。
 */
class ClipRealServiceTest {

    private val tokenFile = File("E:/credentials/clip.token")

    /**
     * 服务可达性预检（A06 补）：本机访问 clip.guanfu.app 需要代理/隧道，
     * 网络不通时这两条契约测试的正确行为是「跳过」，而不是把环境问题报成测试失败。
     */
    private fun serviceReachable(): Boolean = runCatching {
        java.net.Socket().use { socket ->
            socket.connect(java.net.InetSocketAddress("clip.guanfu.app", 443), 3000)
        }
        true
    }.getOrDefault(false)

    @Test
    fun `real service accepts our auth and answers contract`() {
        assumeTrue("本机无 clip.token，跳过真实服务测试", tokenFile.isFile)
        assumeTrue("clip.guanfu.app 不可达（需代理/隧道），跳过真实服务测试", serviceReachable())
        val token = tokenFile.readText(Charsets.UTF_8).trim()
        assertTrue("clip.token 为空", token.isNotEmpty())

        val r = ClipClient.clip("https://clip.guanfu.app", token, "https://example.com")
        assertFalse("不应是网络层失败: $r", r.httpCode == 0)
        assertFalse("token 应被接受（401=鉴权失败）: $r", r.httpCode == 401)
        assertEquals("部署版对 example.com 应为 422 白名单提示", 422, r.httpCode)
        assertFalse(r.ok)
        assertTrue("错误文案应为白名单提示: ${r.message}", r.message.contains("公众号"))
    }

    @Test
    fun `real service rejects wrong token with 401`() {
        assumeTrue("本机无 clip.token，跳过真实服务测试", tokenFile.isFile)
        assumeTrue("clip.guanfu.app 不可达（需代理/隧道），跳过真实服务测试", serviceReachable())

        val r = ClipClient.clip("https://clip.guanfu.app", "definitely-wrong-token", "https://example.com")
        assertEquals("错误 token 应回 401", 401, r.httpCode)
        assertFalse(r.ok)
        assertTrue(r.message.contains("Token"))
    }
}
