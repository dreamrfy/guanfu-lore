#!/usr/bin/env bash
# 自测跑批：一次跑完所有 selftest，汇总通过/失败
# 用法: bash tests/run-all.sh
set -u
cd "$(dirname "$0")/.."

fail=0
total=0
for t in tests/*.selftest.ts; do
  [ -f "$t" ] || continue
  total=$((total + 1))
  echo "== $t =="
  if node "$t"; then
    echo "   -> 通过"
  else
    echo "   -> ❌ 失败"
    fail=$((fail + 1))
  fi
  echo
done

echo "========== 汇总 =========="
echo "自测脚本: $total | 失败: $fail"
[ "$fail" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit "$fail"
