package app.guanfu.shell

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.guanfu.shell.sync.SyncWorker
import app.guanfu.shell.ui.MainScreen

/**
 * 单 Activity（架构 §4）：A04 起主界面交给 Compose，剪藏入口（SEND/VIEW）保持原语义。
 * Compose 需要 ComponentActivity 才能 setContent，因此基类由 Activity 改为 ComponentActivity。
 */
class MainActivity : ComponentActivity() {

    /** 剪藏结果/入口提示，Compose 顶部卡片展示（原 View 版 statusView/urlView 的替代） */
    private var clipMessage by mutableStateOf<String?>(null)
    private var lastClippedUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // App 活着就周期同步（15 分钟 + 有网）；WorkManager 在进程被杀后仍会兜底
        SyncWorker.schedulePeriodic(this)
        setContent {
            MaterialTheme {
                MainScreen(
                    clipMessage = clipMessage,
                    onOpenSettings = {
                        startActivity(Intent(this@MainActivity, SettingsComposeActivity::class.java))
                    },
                )
            }
        }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val action = intent?.action
        val url = when (action) {
            Intent.ACTION_SEND -> ExtractUrl.from(intent.getStringExtra(Intent.EXTRA_TEXT))
            Intent.ACTION_VIEW -> intent.dataString ?: intent.data?.toString()
            else -> null
        }
        if (url == null) {
            clipMessage = if (action == Intent.ACTION_SEND) {
                getString(R.string.received_share_no_url)
            } else {
                null
            }
            return
        }
        clipMessage = when (action) {
            Intent.ACTION_SEND -> "${getString(R.string.received_share)}\n$url"
            else -> "${getString(R.string.received_open)}\n$url"
        }
        submitClip(url)
    }

    /** 收到链接即自动剪藏（服务端按 url 幂等入库，重复提交不会产生重复记录） */
    private fun submitClip(url: String) {
        if (url == lastClippedUrl) return
        lastClippedUrl = url
        clipMessage = getString(R.string.clipping)
        val config = Credentials.load(this)
        Thread {
            val result = ClipClient.clip(
                config.serverUrl,
                config.token,
                url,
            )
            runOnUiThread {
                clipMessage = if (result.ok) {
                    Toast.makeText(this, getString(R.string.clip_ok), Toast.LENGTH_SHORT).show()
                    getString(R.string.clip_ok)
                } else {
                    Toast.makeText(this, getString(R.string.clip_fail, result.message), Toast.LENGTH_LONG).show()
                    getString(R.string.clip_fail, result.message)
                }
            }
        }.start()
    }
}
