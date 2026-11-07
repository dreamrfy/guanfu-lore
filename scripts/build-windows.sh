#!/bin/bash
# Windows 标准构建入口：--no-tree-shake-icons 规避 Windows release 图标被误裁（安卓正常、Windows 空白的树摇差异）。
# 用法：bash scripts/build-windows.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/client"
export PUB_HOSTED_URL=https://pub.flutter-io.cn FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
flutter build windows --release --no-tree-shake-icons
echo "完成：产物在 client/build/windows/x64/runner/Release/bijiapp.exe"
