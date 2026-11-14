package app.guanfu.shell

/**
 * 从系统分享（EXTRA_TEXT）的文本里提取第一条 http/https 链接。
 *
 * 微信分享文本常见两种坑：URL 紧贴中文（无空格分隔）、句子标点黏在 URL 尾部。
 * 所以字符集只放行 RFC 3986 的 URL 字符，CJK 与全角标点天然截断；
 * 尾部 ASCII 句读再单独剥掉（「)」可能是合法 URL 字符，不在剥离之列）。
 */
object ExtractUrl {
    private val URL = Regex("""https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+""")
    private val TRAILING = Regex("""[.,;:!?…]+$""")

    fun from(text: String?): String? {
        if (text.isNullOrBlank()) return null
        val match = URL.find(text) ?: return null
        return TRAILING.replace(match.value, "")
    }
}
