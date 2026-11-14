package app.guanfu.shell

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tv = TextView(this)
        tv.textSize = 20f
        tv.text = getString(R.string.app_name)
        setContentView(tv)
    }
}
