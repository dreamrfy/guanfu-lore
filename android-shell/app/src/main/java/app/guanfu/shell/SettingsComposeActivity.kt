package app.guanfu.shell

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

/**
 * 登录/设置页（A02 · Compose 骨架首个落地页）：
 * 服务器地址 + Token（留空回落内置默认，语义沿用 Credentials/剪藏壳），
 * 连通性检测复用 ClipClient.checkAuth（GET /api/clips 只读鉴权）。
 * 后续任务（A03+）的主框架从这里接入。
 */
@OptIn(ExperimentalMaterial3Api::class)
class SettingsComposeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val config = Credentials.load(this)
        setContent {
            MaterialTheme {
                SettingsScreen(initialUrl = config.serverUrl, initialToken = config.token)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(initialUrl: String, initialToken: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // 输入框存「用户原文」，留空表示用内置默认 —— 与 Credentials.save/load 语义一致
    var url by remember { mutableStateOf(if (initialUrl == BuildConfig.DEFAULT_CLIP_BASE_URL) "" else initialUrl) }
    var token by remember { mutableStateOf(if (initialToken == BuildConfig.DEFAULT_CLIP_TOKEN) "" else initialToken) }
    var testing by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    var savedFlash by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("设置") }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("连接观复服务", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("服务地址") },
                placeholder = { Text("留空即用内置默认") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("访问 Token") },
                placeholder = { Text("留空即用内置默认") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )

            Text(
                "凭证加密存储（EncryptedSharedPreferences）。设备 ID 在首次同步时自动生成。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = {
                        val cfg = Credentials.load(context)
                        val base = url.trim().ifBlank { cfg.serverUrl }
                        val tok = token.trim().ifBlank { cfg.token }
                        testing = true
                        result = null
                        // ClipClient 是阻塞式 HttpURLConnection，必须走 IO 线程
                        // （首版用 Dispatchers.Main 直接炸 NetworkOnMainThreadException，模拟器冒烟逮到）
                        scope.launch(kotlinx.coroutines.Dispatchers.IO) {
                            val r = ClipClient.checkAuth(base, tok)
                            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                                testing = false
                                result = if (r.ok) "✔ 连接正常（鉴权通过）" else "✘ 连接失败：${r.message}"
                            }
                        }
                    },
                    enabled = !testing,
                ) {
                    Text("测试连接")
                }
                Button(
                    onClick = {
                        Credentials.save(context, url, token)
                        savedFlash = true
                    },
                    enabled = !testing,
                ) {
                    Text("保存")
                }
            }

            if (testing) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.height(18.dp))
                    Text("正在测试连接…", style = MaterialTheme.typography.bodyMedium)
                }
            }

            result?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            }
            if (savedFlash) {
                Text("已保存", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }

            Spacer(Modifier.height(12.dp))
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("观复 · Lore", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "安卓完整客户端骨架已就绪。剪藏入口（分享/打开网页）继续可用；笔记主框架在后续版本接入。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
