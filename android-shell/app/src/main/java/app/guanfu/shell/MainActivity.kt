package app.guanfu.shell

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    private lateinit var statusView: TextView
    private lateinit var urlView: TextView

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
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                val url = ExtractUrl.from(text)
                if (url != null) {
                    statusView.text = getString(R.string.received_share)
                    urlView.text = url
                } else {
                    statusView.text = getString(R.string.received_share_no_url)
                    urlView.text = text ?: ""
                }
            }
            else -> {
                statusView.text = getString(R.string.waiting)
                urlView.text = ""
            }
        }
    }
}
