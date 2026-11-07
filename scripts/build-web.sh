#!/bin/bash
# Flutter Web 标准构建入口：自动准备数据库引擎文件 → 构建 → 清出（保持仓库无引擎产物）。
# 用法：bash scripts/build-web.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/web-db-engine.sh" prepare
cd "$ROOT/client"
export PUB_HOSTED_URL=https://pub.flutter-io.cn FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
flutter build web --release
bash "$ROOT/scripts/web-db-engine.sh" clean
echo "完成：产物在 client/build/web（引擎文件已随构建带入，仓库内 client/web 保持干净）"
