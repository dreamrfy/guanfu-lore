package app.guanfu.shell

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class SettingsActivity : Activity() {

    private lateinit var urlInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var testResult: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
        }

        fun label(text: String) = TextView(this).apply {
            this.text = text
            textSize = 14f
            setPadding(0, 32, 0, 8)
        }

        root.addView(label("服务地址"))
        urlInput = EditText(this).apply {
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.getString(KEY_URL, BuildConfig.DEFAULT_CLIP_BASE_URL))
        }
        root.addView(urlInput)

        root.addView(label("访问 Token"))
        tokenInput = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            setText(prefs.getString(KEY_TOKEN, BuildConfig.DEFAULT_CLIP_TOKEN))
        }
        root.addView(tokenInput)

        root.addView(TextView(this).apply {
            textSize = 12f
            setTextColor(Color.GRAY)
            setPadding(0, 8, 0, 0)
            text = "留空即用内置默认值。"
        })

        testResult = TextView(this).apply {
            textSize = 14f
            setPadding(0, 24, 0, 0)
        }
        root.addView(testResult)

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 48, 0, 0)
        }
        fun button(text: String, onClick: () -> Unit) = Button(this).apply {
            this.text = text
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { onClick() }
        }
        row.addView(button("测试连接") { runTest() })
        row.addView(button("保存并返回") { saveAndFinish() })
        root.addView(row)

        setContentView(root)
    }

    private fun runTest() {
        val base = urlInput.text.toString().trim().ifEmpty { BuildConfig.DEFAULT_CLIP_BASE_URL }
        val token = tokenInput.text.toString().trim().ifEmpty { BuildConfig.DEFAULT_CLIP_TOKEN }
        testResult.text = getString(R.string.testing)
        Thread {
            val r = ClipClient.checkAuth(base, token)
            runOnUiThread {
                testResult.text = if (r.ok) getString(R.string.test_ok) else getString(R.string.test_fail, r.message)
                Toast.makeText(this, if (r.ok) R.string.test_ok else R.string.testing_failed_toast, Toast.LENGTH_SHORT).show()
            }
        }.start()
    }

    private fun saveAndFinish() {
        val url = urlInput.text.toString().trim()
        val token = tokenInput.text.toString().trim()
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString(KEY_URL, url)
            .putString(KEY_TOKEN, token)
            .apply()
        Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show()
        finish()
    }

    companion object {
        const val PREFS = "guanfu_shell_settings"
        const val KEY_URL = "clip_base_url"
        const val KEY_TOKEN = "clip_token"

        /** 实际生效配置：设置页存的值优先，空则回落内置默认（供 MainActivity 读） */
        fun effectiveUrl(prefs: android.content.SharedPreferences) =
            prefs.getString(KEY_URL, "")?.trim().takeUnless { it.isNullOrEmpty() }
                ?: BuildConfig.DEFAULT_CLIP_BASE_URL

        fun effectiveToken(prefs: android.content.SharedPreferences) =
            prefs.getString(KEY_TOKEN, "")?.trim().takeUnless { it.isNullOrEmpty() }
                ?: BuildConfig.DEFAULT_CLIP_TOKEN
    }
}
