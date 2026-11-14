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
        root.addView(statusView)
        root.addView(urlView)
        setContentView(root)
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
        Thread {
            val result = ClipClient.clip(
                BuildConfig.DEFAULT_CLIP_BASE_URL,
                BuildConfig.DEFAULT_CLIP_TOKEN,
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
