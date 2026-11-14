import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 默认 Token 从凭证目录读取（不进仓库；文件缺失时空串，运行时服务端会回 401）
val clipTokenFile = File("E:/credentials/clip.token")
val clipToken = clipTokenFile.takeIf { it.isFile }
    ?.readText(Charsets.UTF_8)?.trim().orEmpty()
    .replace("\\", "\\\\").replace("\"", "\\\"")

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
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
