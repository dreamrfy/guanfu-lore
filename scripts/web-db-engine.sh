#!/bin/bash
# Web 数据库引擎文件管理（这两个文件不进 git——扫描器对第三方压缩 JS 误报 61 处强制拦截提交）。
# 磁盘缓存：E:\dev\web-db-engine（仓库外，永久）。
# 用法：
#   bash scripts/web-db-engine.sh prepare   # 复制进 client/web/（构建前）
#   bash scripts/web-db-engine.sh clean     # 从 client/web/ 清出（提交前/构建后）
#   bash scripts/web-db-engine.sh ensure    # 只保证缓存存在（下载走镜像链）
set -e
CACHE="/e/dev/web-db-engine"
WEB_DIR="/e/VBcoding/bijiapp/client/web"
FILES=(sqlite3.wasm drift_worker.js)

ensure_cache() {
  mkdir -p "$CACHE"
  for f in "${FILES[@]}"; do
    [ -s "$CACHE/$f" ] && continue
    local ok=0
    for m in "https://ghfast.top/" "https://gh-proxy.com/" "https://ghproxy.net/" ""; do
      local url="${m}https://github.com/"
      case "$f" in
        sqlite3.wasm)   url="${url}simolus3/sqlite3.dart/releases/download/sqlite3-2.9.4/sqlite3.wasm";;
        drift_worker.js) url="${url}simolus3/drift/releases/download/drift-2.31.0/drift_worker.js";;
      esac
      echo "尝试 ${m:-直连} 下载 $f ..."
      if curl -sfL -m 120 -o "$CACHE/$f" "$url"; then
        local sz; sz=$(stat -c%s "$CACHE/$f" 2>/dev/null || echo 0)
        if [ "$sz" -ge 100000 ]; then ok=1; echo "成功 ($sz B)"; break; fi
      fi
      rm -f "$CACHE/$f"
    done
    [ "$ok" = 0 ] && { echo "失败: $f"; exit 1; }
  done
}

case "${1:-}" in
  ensure) ensure_cache ;;
  prepare)
    ensure_cache
    for f in "${FILES[@]}"; do cp "$CACHE/$f" "$WEB_DIR/$f"; done
    echo "prepare: 已复制进 $WEB_DIR"
    ;;
  clean)
    for f in "${FILES[@]}" ; do rm -f "$WEB_DIR/$f"; done
    echo "clean: 已从 $WEB_DIR 清出（缓存仍在 $CACHE）"
    ;;
  *) echo "用法: $0 prepare|clean|ensure"; exit 1 ;;
esac
