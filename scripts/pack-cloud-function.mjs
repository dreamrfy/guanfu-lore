#!/usr/bin/env node
// 云函数打包脚本（阶段一）：src/.ts 源码 + index.js 垫片 + @cloudbase/node-sdk → 单个 zip
// 用法：node scripts/pack-cloud-function.mjs
// 前提：Node >= 24（云上 Runtime 为 Node 24 时可原生直跑 .ts；<24 则需要先 tsc 编译，见 docs/部署清单）
// 产物：server/out/bijiapp-poll.zip（out/ 已 gitignore）
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SERVER = path.resolve(import.meta.dirname, "..", "server");
const STAGING = "E:\\dev\\tmp\\bijiapp-cloud-pkg";
const OUT_ZIP = path.join(SERVER, "out", "bijiapp-poll.zip");

function log(msg) {
  console.log("[pack] " + msg);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

log("清理暂存目录 " + STAGING);
rmrf(STAGING);
fs.mkdirSync(STAGING, { recursive: true });

log("复制 src/ 源码");
copy(path.join(SERVER, "src"), path.join(STAGING, "src"));

// src/ 下曾有夜间批次遗留的 out/ 产物目录，不进包
const strayOut = path.join(STAGING, "src", "out");
if (fs.existsSync(strayOut)) {
  log("剔除遗留产物 src/out/");
  rmrf(strayOut);
}

log("复制 package.json（type:module，保留运行时依赖）");
fs.copyFileSync(path.join(SERVER, "package.json"), path.join(STAGING, "package.json"));

log("安装运行时依赖（sanitize-html + htmlparser2 系列——htmlSanitize.ts 真实依赖，2026-11-06 模拟加载暴露）");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Windows 上 spawn .cmd 必须 shell:true（Node 安全限制）；参数全部是脚本内固定值，无注入面
const npmOpts = { cwd: STAGING, stdio: "inherit", shell: process.platform === "win32" };
try {
  execFileSync(npm, ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], npmOpts);
} catch {
  log("官方源失败，换 npmmirror 重试");
  execFileSync(
    npm,
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"],
    { ...npmOpts, env: { ...process.env, npm_config_registry: "https://registry.npmmirror.com" } }
  );
}

log("写入入口垫片 index.js + package.json 去掉 type:module（.js 才能按 CommonJS 被 require）");
const pkg = JSON.parse(fs.readFileSync(path.join(SERVER, "package.json"), "utf8"));
delete pkg.type; // 云函数包内入口走 CommonJS；src/*.ts 的加载不依赖该字段（Node 24 type stripping，已验证）
fs.writeFileSync(path.join(STAGING, "package.json"), JSON.stringify(pkg, null, 2), "utf8");
fs.writeFileSync(
  path.join(STAGING, "index.js"),
  `// CloudBase 云函数入口垫片（2026-11-06 修复：FUNCTIONS_INVOCATION_FAILED/443）\n` +
    `// 平台加载器按 CommonJS 解析 index.js 并要求 module.exports.main；ESM import 写法会加载即崩。\n` +
    `// 包内 package.json 已去掉 type:module，本文件天然 CommonJS。\n` +
    `// Node 24 的 require 可直接加载 .ts（原生 type stripping，本地已验证）。\n` +
    `const pollFn = require("./src/cloud/pollFn.ts");\n` +
    `module.exports.main = pollFn.main;\n` +
    `module.exports.pollOnce = pollFn.pollOnce;\n`,
  "utf8"
);

log("压缩 zip（用 Windows 自带 bsdtar：Compress-Archive 的 zip 变体 CloudBase 解不开，2026-11-06 实测）");
fs.mkdirSync(path.dirname(OUT_ZIP), { recursive: true });
fs.rmSync(OUT_ZIP, { force: true });
execFileSync(
  "C:\\Windows\\System32\\tar.exe",
  ["-a", "-c", "-f", OUT_ZIP, "index.js", "package.json", "src", "node_modules"],
  { cwd: STAGING, stdio: "inherit", shell: false }
);

// 自验：入口、源码、关键依赖三个都在（防打出缺件包；2026-11-06 曾漏 node_modules）
const listed = execFileSync("C:\\Windows\\System32\\tar.exe", ["-tf", OUT_ZIP], {
  encoding: "utf8",
  shell: false,
});
for (const must of ["index.js", "src/cloud/pollFn.ts", "node_modules/sanitize-html/"]) {
  if (!listed.split("\n").some((line) => line.trim() === must || line.trim().startsWith(must))) {
    throw new Error("打包自验失败：zip 里缺 " + must);
  }
}

const size = fs.statSync(OUT_ZIP).size;
log("完成：" + OUT_ZIP + "（" + Math.round(size / 1024) + " KB）");