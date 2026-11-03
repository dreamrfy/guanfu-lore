# Project environment for PowerShell 5.1. ASCII only.
# Usage: . .\scripts\env.ps1

$env:DEV_ROOT = "E:\VBcoding\biyaaozhicheng\dev"

$env:JAVA_HOME = "$env:DEV_ROOT\jdk\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "$env:DEV_ROOT\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_AVD_HOME = "$env:DEV_ROOT\android-avd"
$env:GRADLE_USER_HOME = "$env:DEV_ROOT\gradle-home"
$env:PUB_CACHE = "$env:DEV_ROOT\pub-cache"
$env:FLUTTER_HOME = "$env:DEV_ROOT\flutter"

$env:Path = "$env:FLUTTER_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:JAVA_HOME\bin;$env:Path"
