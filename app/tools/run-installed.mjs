// 启动已安装版（验证用）：npm run run-installed
// CDP 9226 + 全新 WebView2 用户目录（避免默认目录被调试过程弄脏）
import { spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";

const exe = "C:/Users/12589/scoop/apps/guanfu-lore/0.1.0/guanfu-lore.exe";
if (!existsSync(exe)) {
  console.error("安装版不存在: " + exe);
  process.exit(1);
}
const dir = "E:/VBcoding/bijiapp/app/.webview2-installed-profile";
try { rmSync(dir, { recursive: true, force: true }); } catch { /* 独占时忽略 */ }

const child = spawn(exe, {
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${process.env.CDP_PORT || "9226"}`,
    WEBVIEW2_USER_DATA_FOLDER: dir,
  },
});
child.on("exit", (code, signal) => console.log(`[run-installed] exe 退出 code=${code} signal=${signal}`));