#!/usr/bin/env bash
# Project environment for Git Bash.
# Source this file before running flutter, adb, gradle or java:
#   source scripts/env.sh

export DEV_ROOT="/e/VBcoding/biyaaozhicheng/dev"

export JAVA_HOME="$DEV_ROOT/jdk/jdk-17.0.20.1+1"
export ANDROID_HOME="$DEV_ROOT/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$DEV_ROOT/android-avd"
export GRADLE_USER_HOME="$DEV_ROOT/gradle-home"
export PUB_CACHE="$DEV_ROOT/pub-cache"
export FLUTTER_HOME="$DEV_ROOT/flutter"

export PATH="$FLUTTER_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"
