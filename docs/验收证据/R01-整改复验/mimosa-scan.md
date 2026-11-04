# Mimosa 深度安全扫描记录（2026-11-04 整改后）

## 第一次扫描（发现 1 条高危）

- scanId：`scan-2026-11-04T02-49-41.135Z-97fad0325172`
- 封印：`sha256:632e0dcf6eeb9cdee140a5c5b881ae4b2aca95771ba18201484214244e0bbb51`
- 结果：1 条高危（static advisory）——`saveCursor 是 path-traversal 入口`（`server/src/cli.ts:139`）
- 人工复核：写入路径是常量 `data/kf-cursor.json`，游标值只作为 JSON 内容，**实际不可穿越**；
  但按“能证明安全”的标准做了加固（不是单纯忽略告警）

## 加固动作

| 文件 | 改动 |
| --- | --- |
| `sources/wecomClient.ts` | 文件名改为常量 `CURSOR_FILE_NAME`；游标/token 写入前按 `^[A-Za-z0-9._-]{0,512}$` 白名单校验；读回时非法值清空；`path.basename` 断言 |
| `cli.ts` | 游标落盘失败只提示不抛错（已入库结果不受影响） |
| `tests/wecom.selftest.ts` | 新增 3 条断言：非法游标读回清空、非法值写入被拒绝、文件仍在固定路径 |

## 第二次扫描（复扫）

- scanId：`scan-2026-11-04T02-50-31.987Z-ad2b5ed2b2af`
- 封印：`sha256:12336dde7cb9de83e08bc414428a6c2b4e77539cae16720cc0ecde470f350118`
- 范围：`cli.ts` / `sources/wecomClient.ts` / `fetch/http.ts` / `fetch/htmlSanitize.ts`
- 结果：**0 条发现**，依赖风险 0
- **覆盖缺口（必须如实记录）**：调用图部分不完整（动态派发/规模限制），扫描状态为 `inconclusive`

## 结论口径

- 可以说：**本次整改涉及的 4 个文件，在该次 deep 扫描的范围内 0 发现**。
- **不能**把这句写成“项目已通过安全审计 / 已安全”：
  扫描本身报告 `inconclusive`（调用图不完整），静态扫描也不等于运行时验证；
  结论范围只有这 4 个文件，不含依赖树、部署配置与未列入的模块。
- 残余风险：动态派发路径（`deps` 注入、`transformTags` 回调）未被调用图完整覆盖，靠测试（13 个自测）兜底。
