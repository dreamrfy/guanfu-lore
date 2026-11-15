package app.guanfu.shell

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID

/**
 * 凭证层（架构设计 §5）：EncryptedSharedPreferences 存 {serverUrl, token, deviceId}。
 *
 * 默认值语义沿用剪藏壳（SettingsActivity.effectiveUrl/effectiveToken 的既有约定）：
 * - 设置页存的值优先；空/未存回落 BuildConfig 注入的内置默认
 *   （DEFAULT_CLIP_BASE_URL=https://clip.guanfu.app，DEFAULT_CLIP_TOKEN 由 gradle
 *   从 E:/credentials/clip.token 注入，机制见 build.gradle.kts:9-13）。
 * - 剪藏与全功能客户端共用同一份凭证（web sync.ts 头注同语义）。
 *
 * deviceId：首次启动生成 and-<random>，对齐 web 端 dev- 前缀约定（sync.ts deviceId()）。
 * 旧版明文 prefs（guanfu_shell_settings）一次性迁移后删除——升级不丢配置。
 */
object Credentials {

    private const val PREFS = "guanfu_credentials"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_TOKEN = "token"
    private const val KEY_DEVICE_ID = "device_id"

    /** 旧版明文 prefs（v0.1.0 剪藏壳遗留），迁移完即删 */
    private const val LEGACY_PREFS = "guanfu_shell_settings"
    private const val LEGACY_KEY_URL = "clip_base_url"
    private const val LEGACY_KEY_TOKEN = "clip_token"

    data class Config(
        val serverUrl: String,
        val token: String,
        val deviceId: String,
    )

    fun prefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** 读生效配置：存量值优先，空则回落内置默认（与旧 SettingsActivity 语义一致） */
    fun load(context: Context): Config {
        val p = prefs(context)
        migrateLegacy(context, p)
        return Config(
            serverUrl = p.getString(KEY_SERVER_URL, null)?.trim().ifNullOrBlank(BuildConfig.DEFAULT_CLIP_BASE_URL),
            token = p.getString(KEY_TOKEN, null)?.trim().ifNullOrBlank(BuildConfig.DEFAULT_CLIP_TOKEN),
            deviceId = p.getString(KEY_DEVICE_ID, null) ?: newDeviceId(p),
        )
    }

    /** 保存用户覆盖值（存「用户填的原文」，含空串；effective 语义在 load 时统一回落） */
    fun save(context: Context, serverUrl: String, token: String) {
        prefs(context).edit()
            .putString(KEY_SERVER_URL, serverUrl.trim())
            .putString(KEY_TOKEN, token.trim())
            .apply()
    }

    private fun newDeviceId(p: SharedPreferences): String {
        val id = "and-" + UUID.randomUUID().toString().replace("-", "").take(16)
        p.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }

    /** 一次性迁移：旧明文 prefs 有值且新库为空 → 拷贝后删旧库 */
    private fun migrateLegacy(context: Context, target: SharedPreferences) {
        val legacy = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        val legacyUrl = legacy.getString(LEGACY_KEY_URL, null)
        val legacyToken = legacy.getString(LEGACY_KEY_TOKEN, null)
        if (legacyUrl == null && legacyToken == null) return
        if (target.contains(KEY_SERVER_URL) || target.contains(KEY_TOKEN)) {
            // 新库已有配置（以新库为准），只清旧库
            legacy.edit().clear().apply()
            return
        }
        target.edit()
            .putString(KEY_SERVER_URL, legacyUrl ?: "")
            .putString(KEY_TOKEN, legacyToken ?: "")
            .apply()
        legacy.edit().clear().apply()
    }
}

/** 空串/空白回落默认 —— 与旧 effectiveUrl 的 ifEmpty 语义等价 */
private fun String?.ifNullOrBlank(default: String): String =
    if (this.isNullOrBlank()) default else this
