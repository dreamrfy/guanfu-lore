import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.0"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.0"
    id("com.google.devtools.ksp")
}

// 默认 Token 从凭证目录读取（不进仓库；文件缺失时空串，运行时服务端会回 401）
val clipTokenFile = File("E:/credentials/clip.token")
val clipToken = clipTokenFile.takeIf { it.isFile }
    ?.readText(Charsets.UTF_8)?.trim().orEmpty()
    .replace("\\", "\\\\").replace("\"", "\\\"")

// release 签名配置从凭证目录读（防丢：keystore 与密码都在 E:/credentials，不进仓库）
val signingPropsFile = File("E:/credentials/android-shell-signing.properties")

android {
    namespace = "app.guanfu.shell"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.guanfu.shell"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "DEFAULT_CLIP_BASE_URL", "\"https://clip.guanfu.app\"")
        buildConfigField("String", "DEFAULT_CLIP_TOKEN", "\"$clipToken\"")
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingPropsFile.isFile) {
                val props = Properties().apply {
                    signingPropsFile.inputStream().use { load(it) }
                }
                signingConfig = signingConfigs.create("release") {
                    storeFile = File(props.getProperty("storeFile"))
                    storePassword = props.getProperty("storePassword")
                    keyAlias = props.getProperty("keyAlias")
                    keyPassword = props.getProperty("keyPassword")
                }
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Compose（BOM 统一版本；A05+ 的块渲染也在这套上长）
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // 凭证加密存储（架构 §5：EncryptedSharedPreferences）
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // 网络（A03 同步引擎用；本任务只用 OkHttp 传 checkAuth 之外的探测）+ JSON
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // 数据层（A03：Room 1:1 复刻 web Dexie 表模型，架构 §2）
    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")

    // 后台调度（架构 §3：WorkManager 周期+即时同步）
    implementation("androidx.work:work-runtime-ktx:2.12.0")

    // 单测（沿用 shell 既有 JVM 单测模式）
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
