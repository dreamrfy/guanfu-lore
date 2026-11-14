// 同步层自测（完全离线）：变更流水、乐观锁、冲突副本、冲突处理
// 用法: node tests/sync.selftest.ts
import fs from "node:fs";
import path from "node:path";

// 数据目录指到仓库内的临时相对路径（服务端配置只接受仓库内相对路径）
const REL_DIR = path.join("out", "test-sync");
const tmpDir = path.resolve(import.meta.dirname, "..", REL_DIR);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.KF_DATA_DIR = REL_DIR;
process.env.KF_ASSETS_DIR = path.join(REL_DIR, "assets");

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// 数据目录指到临时目录，别污染真实库
const store = await import("../src/cloud/syncStore.ts");
const { applyChange, conflictCount, currentSeq, listConflicts, pushChanges, readChanges, resolveConflict, rowSeq } = store;

// ---- 1. 写一行 → 进流水，版本号递增 ----
{
  const { seq } = applyChange({ entity: "page", entityId: "p1", op: "upsert", payload: { title: "第一版" }, actor: "devA" });
  check("写入后拿到 seq=1", seq === 1, String(seq));
  check("行版本号 = 1", rowSeq("page", "p1") === 1);
  check("当前全局序号 = 1", currentSeq() === 1);

  const changes = readChanges(0);
  check("流水里有 1 条", changes.length === 1, String(changes.length));
  check("流水带上了载荷", changes[0].payload?.includes("第一版") === true, String(changes[0].payload));
  check("拉取游标生效（since=1 拉不到）", readChanges(1).length === 0);
}

// ---- 2. 用旧版本号推送 → 冲突，服务器不被覆盖 ----
{
  const results = pushChanges([
    { entity: "page", entityId: "p1", op: "upsert", payload: { title: "别人的版本" }, baseSeq: 0, actor: "devB" },
  ]);
  check("旧版本号推送 → 冲突", results[0].status === "conflict", results[0].status);
  check("冲突副本记下来了", conflictCount() === 1, String(conflictCount()));
  const row = readChanges(0)[0];
  check("服务器内容没被覆盖", row.payload?.includes("第一版") === true, String(row.payload));
  const copies = listConflicts();
  check("副本里存的是客户端版本", JSON.stringify(copies[0].payload).includes("别人的版本"), JSON.stringify(copies[0].payload));
}

// ---- 3. 用正确版本号推送 → 应用成功 ----
{
  const results = pushChanges([
    { entity: "page", entityId: "p1", op: "upsert", payload: { title: "第二版" }, baseSeq: 1, actor: "devA" },
  ]);
  check("同版本号推送 → 应用", results[0].status === "applied", results[0].status);
  check("版本号涨到 2", rowSeq("page", "p1") === 2, String(rowSeq("page", "p1")));
  check("增量拉取能拿到新变更", readChanges(1).length === 1, String(readChanges(1).length));
}

// ---- 4. 冲突处理：采用我的 / 保留服务器 ----
{
  const copy = listConflicts()[0];
  const kept = resolveConflict(copy.id, "keep-server");
  check("保留服务器版：冲突被清掉", kept.ok && conflictCount() === 0, String(conflictCount()));
  check("保留服务器版：不产生新变更", currentSeq() === 2, String(currentSeq()));
}
{
  // 再制造一个冲突，然后"采用我的"
  pushChanges([
    { entity: "page", entityId: "p1", op: "upsert", payload: { title: "第三版" }, baseSeq: 1, actor: "devC" },
  ]);
  const copy = listConflicts()[0];
  const mine = resolveConflict(copy.id, "use-mine");
  check("采用我的：冲突被清掉", mine.ok && conflictCount() === 0, String(conflictCount()));
  check("采用我的：产生了新变更", (mine.seq ?? 0) > 2, String(mine.seq));
  const latest = readChanges(0).at(-1);
  check("采用我的：内容确实是第三版", latest?.payload?.includes("第三版") === true, String(latest?.payload));
}

// ---- 5. 删除也是一次变更 ----
{
  applyChange({ entity: "page", entityId: "p1", op: "delete", actor: "devA" });
  const last = readChanges(0).at(-1);
  check("删除记进流水", last?.op === "delete", String(last?.op));
}

// ---- 6. 边界：未知实体、超大载荷、推送条数上限 ----
{
  let threw = false;
  try {
    pushChanges([{ entity: "whatever", entityId: "x", op: "upsert", payload: {}, baseSeq: 0 }]);
  } catch {
    threw = true;
  }
  check("未知实体被拒绝", threw);

  threw = false;
  try {
    pushChanges([
      { entity: "page", entityId: "big", op: "upsert", payload: { t: "x".repeat(3 * 1024 * 1024) }, baseSeq: 0 },
    ]);
  } catch {
    threw = true;
  }
  check("超大载荷被拒绝", threw);

  threw = false;
  try {
    pushChanges(
      Array.from({ length: 300 }, (_, i) => ({
        entity: "page" as const,
        entityId: "p" + i,
        op: "upsert" as const,
        payload: {},
        baseSeq: 0,
      }))
    );
  } catch {
    threw = true;
  }
  check("一次推太多被拒绝", threw);
}

// 收尾：关连接 + 删临时目录
store.closeSyncDb();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* Windows 上偶尔删不掉，忽略 */
}

console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
process.exit(failed === 0 ? 0 : 1);
