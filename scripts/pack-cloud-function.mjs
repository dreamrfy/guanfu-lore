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

log("复制 package.json（type:module）");
fs.copyFileSync(path.join(SERVER, `package.json`), path.join(STAGING, "package.json"));

log("写入 index.js 入口垫片");
fs.writeFileSync(
  path.join(STAGING, "index.js"),
  `// CloudBase 云函数入口垫片：转发到 TS 入口（Node 24 原生直跑 .ts）\n` +
    `import { main } from "./src/cloud/pollFn.ts";\n` +
    `export { main };\n`,
  "utf8"
);

log("安装 @cloudbase/node-sdk 进函数包（优先官方源，失败自动换国内镜像）");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Windows 上 spawn .cmd 必须 shell:true（Node 安全限制）；参数全部是脚本内固定值，无注入面
const npmOpts = { cwd: STAGING, stdio: "inherit", shell: process.platform === "win32" };
try {
  execFileSync(npm, ["install", "@cloudbase/node-sdk", "--no-audit", "--no-fund", "--loglevel=error"], npmOpts);
} catch {
  log("官方源失败，换 npmmirror 重试");
  execFileSync(
    npm,
    ["install", "@cloudbase/node-sdk", "--no-audit", "--no-fund", "--loglevel=error"],
    { ...npmOpts, env: { ...process.env, npm_config_registry: "https://registry.npmmirror.com" } }
  );
}

log("压缩 zip");
fs.mkdirSync(path.dirname(OUT_ZIP), { recursive: true });
fs.rmSync(OUT_ZIP, { force: true });
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${OUT_ZIP}' -Force`,
  ],
  { stdio: "inherit", shell: false }
);

const size = fs.statSync(OUT_ZIP).size;
log("完成：" + OUT_ZIP + "（" + Math.round(size / 1024) + " KB）");