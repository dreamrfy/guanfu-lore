// 凭证路径自测（第二轮 N-10）：KF_SECRETS_FILE 必须落在仓库外
// 不写入任何真实凭证；测试用的 JSON 只是字段齐全的假值。
// 用法: node tests/config.selftest.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { loadSecrets } = await import("../src/config.ts");

const SERVER_ROOT = path.dirname(import.meta.dirname);
const REPO_ROOT = path.dirname(SERVER_ROOT);

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function expectReject(raw: string | undefined, label: string, pattern: RegExp): void {
  if (raw === undefined) delete process.env.KF_SECRETS_FILE;
  else process.env.KF_SECRETS_FILE = raw;
  let rejected = false;
  let message = "";
  try {
    loadSecrets();
  } catch (e) {
    rejected = true;
    message = String((e as Error).message);
  }
  check(label, rejected && pattern.test(message), "message=" + message);
}

expectReject(undefined, "未设置环境变量被拒绝", /未设置|非法/);
expectReject("", "空值被拒绝", /未设置|非法/);
// 注意：Windows 上环境变量里的 NUL 会被截断（"a\0b" 实际变成 "a"），
// 所以这里只要求“被拒绝”，不限定具体措辞。
expectReject("a\0b", "含 NUL 被拒绝", /未设置|非法|仓库内/);
expectReject("a/../b", "含 .. 被拒绝", /未设置|非法/);
expectReject(path.join(SERVER_ROOT, "secret-test.json"), "仓库内绝对路径被拒绝", /仓库内/);
expectReject(path.join(REPO_ROOT, "secrets", "kf.json"), "仓库根内路径被拒绝", /仓库内/);
expectReject("package.json", "仓库内相对路径被拒绝", /仓库内/);

// 仓库外路径可读（临时文件，假值）
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bijiapp-secrets-"));
const tmpFile = path.join(tmpDir, "kf.json");
fs.writeFileSync(
  tmpFile,
  JSON.stringify({ corpId: "corp-fake", agentId: "1", appSecret: "secret-fake", token: "t", encodingAESKey: "k" }),
  "utf8"
);
process.env.KF_SECRETS_FILE = tmpFile;
let ok = false;
let corpId = "";
try {
  const s = loadSecrets();
  ok = true;
  corpId = s.corpId;
} catch (e) {
  console.error(String(e));
}
check("仓库外文件可读", ok && corpId === "corp-fake", corpId);

process.env.KF_SECRETS_FILE = tmpDir + path.sep + "missing.json";
let missingRejected = false;
try {
  loadSecrets();
} catch (e) {
  missingRejected = /不存在|ENOENT/.test(String((e as Error).message));
}
check("仓库外但文件不存在时报错", missingRejected);

fs.rmSync(tmpDir, { recursive: true, force: true });

// ---- 环境变量直读分支（云函数用，2026-11-05 接云准备）----
const { loadSecretsFromEnv } = await import("../src/config.ts");
const ENV_KEYS = ["KF_CORP_ID", "KF_AGENT_ID", "KF_APP_SECRET", "KF_TOKEN", "KF_ENCODING_AES_KEY"];
for (const k of ENV_KEYS) delete process.env[k];

let envOk = false;
let envCorp = "";
process.env.KF_CORP_ID = "corp-env";
process.env.KF_AGENT_ID = "1000002";
process.env.KF_APP_SECRET = "secret-env";
process.env.KF_TOKEN = "token-env";
process.env.KF_ENCODING_AES_KEY = "aes-env";
try {
  const s = loadSecrets();
  envOk = true;
  envCorp = s.corpId;
} catch (e) {
  console.error(String(e));
}
check(
  "五项环境变量齐全时直读成功（不要求 KF_SECRETS_FILE）",
  envOk && envCorp === "corp-env",
  envCorp
);
check("环境变量直读返回全部五项", loadSecretsFromEnv().appSecret === "secret-env");

// 部分设置：缺一项要报错并点名
delete process.env.KF_ENCODING_AES_KEY;
let partialMsg = "";
try {
  loadSecrets();
} catch (e) {
  partialMsg = String((e as Error).message);
}
check("缺一项报错并点名缺失变量", /KF_ENCODING_AES_KEY/.test(partialMsg), partialMsg);

// 环境变量优先于文件：设置非法 KF_SECRETS_FILE（仓库内路径），若直读分支生效则不触发文件校验
process.env.KF_ENCODING_AES_KEY = "aes-env";
process.env.KF_SECRETS_FILE = "package.json"; // 仓库内路径，走文件分支必被拒
let envPriority = false;
try {
  envPriority = loadSecrets().corpId === "corp-env";
} catch (e) {
  console.error(String(e));
}
check("环境变量分支优先于文件分支", envPriority);

for (const k of [...ENV_KEYS, "KF_SECRETS_FILE"]) delete process.env[k];

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
