// 临时取件码自测（阶段一接云）：SigV4 查询签名 + key 安全闸门
// 用法: node tests/presign.selftest.ts
//
// ⚠️ 关于「和 AWS 官方向量逐字节比对」：这条本该做（能独立证明 canonical query、
//    UNSIGNED-PAYLOAD、HMAC 推导全对），但安全扫描不允许把 AWS 文档示例里的 AccessKey 字面量
//    写进仓库源码（看着就是硬编码凭据，扫描器分不出它是公开示例）。
//    折中：本文件只用**合成值**验证确定性与结构，逐字节比对在仓库外单独跑过一次，
//    结论记在 docs/基准/M3-T01-签名取件码通道.md。

const { presignGet, clampTtl, MAX_TTL_SEC } = await import("../src/cloud/presign.ts");
const { issueAssetTicket, issueAssetTickets, assertSafeAssetKey, assertSafeAccountId, AssetKeyError } =
  await import("../src/cloud/assetTicket.ts");

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function expectThrow(name: string, fn: () => unknown, re: RegExp): void {
  try {
    fn();
    check(name, false, "没有抛错");
  } catch (e) {
    const msg = String((e as Error).message);
    check(name, re.test(msg), msg);
  }
}

// 合成凭证：形状像真值（便于走同一条代码路径），但显然不是任何真实密钥
const FAKE_AK = "TESTKEYID0000000000";
const FAKE_SK = "testsecretkey0000000000000000000000000000000000";
const FAKE_CONFIG = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: FAKE_AK,
  secretAccessKey: FAKE_SK,
  bucket: "biji-assets",
};

const base = {
  host: "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  canonicalUri: "/biji-assets/assets/a1.png",
  now: new Date("2026-11-10T00:00:00.000Z"),
  accessKeyId: FAKE_AK,
  secretAccessKey: FAKE_SK,
};

// ---------------------------------------------------------------------------
// 1. 签名确定性与结构
// ---------------------------------------------------------------------------
const s1 = presignGet({ ...base, ttlSec: 300 });
const s1b = presignGet({ ...base, ttlSec: 300 });
const s2 = presignGet({ ...base, ttlSec: 600 });
const s3 = presignGet({ ...base, canonicalUri: "/biji-assets/assets/a2.png", ttlSec: 300 });

check("同输入 → 同签名（确定性）", s1.signature === s1b.signature);
check("换 TTL → 换签名", s1.signature !== s2.signature);
check("换 key → 换签名", s1.signature !== s3.signature);
check("签名是 64 位小写 hex", /^[0-9a-f]{64}$/.test(s1.signature), s1.signature);
check("URL 以 X-Amz-Signature 结尾", s1.url.endsWith("X-Amz-Signature=" + s1.signature));
check("URL 以 https 开头且 host 正确", s1.url.startsWith(`https://${base.host}/biji-assets/assets/a1.png?`));
check("URL 只含 6 个参数（5 个 X-Amz-* + 签名）", (s1.url.split("?")[1] ?? "").split("&").length === 6, s1.url.split("?")[1]);
check(
  "canonical query 按参数名排序（Algorithm 在最前）",
  s1.url.indexOf("X-Amz-Algorithm=AWS4-HMAC-SHA256") < s1.url.indexOf("X-Amz-Credential=")
);
const credParam =
  (s1.url.split("?")[1] ?? "").split("&").find((p) => p.startsWith("X-Amz-Credential=")) ?? "";
check("Credential 里的斜杠编码成 %2F（值里没有裸斜杠）", credParam.startsWith("X-Amz-Credential=" + FAKE_AK + "%2F") && !credParam.slice(credParam.indexOf("=") + 1).includes("/"), credParam);
check("过期时间 = 签发时刻 + TTL", s1.expiresAtMs === base.now.getTime() + 300_000);

// ---------------------------------------------------------------------------
// 2. 有效期夹紧
// ---------------------------------------------------------------------------
check("clampTtl(86400) 夹到上限 3600", clampTtl(86400) === MAX_TTL_SEC, String(clampTtl(86400)));
check("ttl=0 → 1 秒", clampTtl(0) === 1);
check("ttl=-5 → 1 秒", clampTtl(-5) === 1);
check("ttl=NaN → 回退 300", clampTtl(Number.NaN) === 300);
check("ttl=12.9 → 向下取整 12", clampTtl(12.9) === 12);

const clamped = presignGet({ ...base, ttlSec: 999999 });
check("超长 TTL 在 URL 里是 3600", clamped.url.includes(`X-Amz-Expires=${MAX_TTL_SEC}`));

// ---------------------------------------------------------------------------
// 3. 取件码（业务层）
// ---------------------------------------------------------------------------
const t = issueAssetTicket("assets/a1.png", {
  ttlSec: 120,
  now: new Date("2026-11-10T00:00:00.000Z"),
  config: FAKE_CONFIG,
});
check("取件码带正确 TTL", t.ttlSec === 120);
check("过期时间 = 签发时刻 + TTL", t.expiresAtMs === new Date("2026-11-10T00:00:00.000Z").getTime() + 120_000);
check("取件码 URL 指向桶内路径", t.url.includes("/biji-assets/assets/a1.png?"));
check("取件码不回传密钥", !t.url.includes(FAKE_SK));

// ---------------------------------------------------------------------------
// 4. key 安全闸门（路径穿越 / 绝对路径 / 前缀白名单）
// ---------------------------------------------------------------------------
expectThrow("拒绝 .. 穿越", () => assertSafeAssetKey("assets/../../etc/passwd"), /路径穿越/);
expectThrow("拒绝中间空段", () => assertSafeAssetKey("assets//a.png"), /路径穿越/);
expectThrow("拒绝单点段", () => assertSafeAssetKey("assets/./a.png"), /路径穿越/);
expectThrow("拒绝绝对路径", () => assertSafeAssetKey("/assets/a.png"), /绝对路径/);
expectThrow("拒绝反斜杠（Windows 风格穿越）", () => assertSafeAssetKey("assets\\..\\a.png"), /反斜杠/);
expectThrow("拒绝空 key", () => assertSafeAssetKey(""), /为空/);
expectThrow("拒绝不在白名单的前缀", () => assertSafeAssetKey("secrets/a.png"), /白名单/);
expectThrow("拒绝超长 key", () => assertSafeAssetKey("assets/" + "x".repeat(600)), /过长/);
check("放行 assets/", assertSafeAssetKey("assets/a1.png") === "assets/a1.png");
check("放行 clips/（清单索引要读）", assertSafeAssetKey("clips/index.json") === "clips/index.json");
check("放行中文 key", assertSafeAssetKey("assets/中文-1.png") === "assets/中文-1.png");

expectThrow("账号 ID 非 32 位 hex → 拒绝（防主机名注入）", () => assertSafeAccountId("evil.com/x"), /形状不对/);
expectThrow("账号 ID 带 cfat_ 前缀 → 拒绝", () => assertSafeAccountId("cfat_abc123"), /形状不对/);
check("32 位 hex 账号 ID 放行", assertSafeAccountId("0123456789abcdef0123456789abcdef").length === 32);

// ---------------------------------------------------------------------------
// 5. 批量签发
// ---------------------------------------------------------------------------
const many = issueAssetTickets(["assets/a1.png", "assets/a2.png"], {
  ttlSec: 300,
  now: new Date("2026-11-10T00:00:00.000Z"),
  config: FAKE_CONFIG,
});
check("批量条数一致", many.length === 2);
check("批量里两个 URL 不同", many[0].url !== many[1].url);
expectThrow("批量超过 200 → 拒绝", () => issueAssetTickets(new Array(201).fill("assets/a.png")), /最多 200/);
expectThrow("批量含坏 key → 整批失败（不做部分成功）", () => issueAssetTickets(["assets/a.png", "../x"]), /白名单|穿越/);

const cn = issueAssetTicket("assets/中文-1.png", {
  ttlSec: 60,
  now: new Date("2026-11-10T00:00:00.000Z"),
  config: FAKE_CONFIG,
});
check("中文 key 在 URL 里是百分号编码", cn.url.includes("%E4%B8%AD%E6%96%87-1.png"), cn.url.slice(0, 120));
check("AssetKeyError 是具名错误类型", new AssetKeyError("x").name === "AssetKeyError");

console.log(failed === 0 ? "\n自测全部通过" : `\n有 ${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);