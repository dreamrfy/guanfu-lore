package app.guanfu.shell

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var statusView: TextView
    private lateinit var urlView: TextView
    private var lastClippedUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A03 起：App 活着就周期同步（15 分钟 + 有网）；WorkManager 在进程被杀后仍会兜底
        app.guanfu.shell.sync.SyncWorker.schedulePeriodic(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }
        statusView = TextView(this).apply { textSize = 16f }
        urlView = TextView(this).apply {
            textSize = 22f
            setTextColor(0xFF0B57D0.toInt())
        }
        val settingsButton = android.widget.Button(this).apply {
            text = getString(R.string.settings)
            setOnClickListener {
                // A02 起：设置入口切到 Compose 版（EncryptedSharedPreferences 凭证层）；
                // 旧 View 版 SettingsActivity 保留一个过渡版本，后续任务移除
                startActivity(android.content.Intent(this@MainActivity, SettingsComposeActivity::class.java))
            }
        }
        val syncButton = android.widget.Button(this).apply {
            text = "立即同步（自检）"
            setOnClickListener { runSyncSelfCheck() }
        }
        root.addView(settingsButton)
        root.addView(syncButton)
        root.addView(statusView)
        root.addView(urlView)
        setContentView(root)
        handleIntent(intent)
    }

    /**
     * A03 自检入口：立刻跑一次同步引擎并把结果写到状态栏。
     * 为什么要它：WorkManager 的 CONNECTED 约束在无外网的模拟器上永不满足，
     * 无法验证「Room 写库 + 拉/推协议」在设备上真跑得通；这个按钮给出确定性触发点。
     * A04 起有真正的同步状态 UI 后，可降级为隐藏入口。
     */
    private fun runSyncSelfCheck() {
        statusView.text = "同步中…（引擎在后台线程跑，不阻塞界面）"
        Thread {
            val summary = kotlinx.coroutines.runBlocking {
                app.guanfu.shell.SyncContainer.engine(applicationContext).run()
            }
            runOnUiThread {
                statusView.text = if (summary.error != null) {
                    "同步失败：${summary.error}（拉取 ${summary.pulled} · 推送 ${summary.pushed}）"
                } else {
                    "同步完成（ok=${summary.ok}）：拉取 ${summary.pulled} · 推送 ${summary.pushed} · 冲突 ${summary.conflicts}"
                }
            }
        }.start()
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
            statusView.text = if (action == Intent.ACTION_SEND)
                getString(R.string.received_share_no_url)
            else getString(R.string.waiting)
            urlView.text = if (action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) ?: "" else ""
            return
        }
        statusView.text = when (action) {
            Intent.ACTION_SEND -> getString(R.string.received_share)
            else -> getString(R.string.received_open)
        }
        urlView.text = url
        submitClip(url)
    }

    /** 收到链接即自动剪藏（服务端按 url 幂等入库，重复提交不会产生重复记录） */
    private fun submitClip(url: String) {
        if (url == lastClippedUrl) return
        lastClippedUrl = url
        statusView.text = getString(R.string.clipping)
        val config = Credentials.load(this)
        Thread {
            val result = ClipClient.clip(
                config.serverUrl,
                config.token,
                url,
            )
            runOnUiThread {
                if (result.ok) {
                    statusView.text = getString(R.string.clip_ok)
                    Toast.makeText(this, getString(R.string.clip_ok), Toast.LENGTH_SHORT).show()
                } else {
                    statusView.text = getString(R.string.clip_fail, result.message)
                    Toast.makeText(this, getString(R.string.clip_fail, result.message), Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }
}
