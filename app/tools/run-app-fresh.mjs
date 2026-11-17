// 启动桌面壳（验证用）：npm run run-app-fresh
// 默认用全新测试数据目录（绕开默认 EBWebView 损坏问题）；设 WEBVIEW2_TEST_PROFILE=0 则用真实默认目录
// CDP 端口默认 9224，可用 CDP_PORT 覆盖
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const useTestProfile = process.env.WEBVIEW2_TEST_PROFILE !== "0";
const testDir = "E:/VBcoding/bijiapp/app/.webview2-test-profile";
if (useTestProfile) {
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* 独占时忽略 */ }
}
const child = spawn("src-tauri/target/debug/guanfu-lore.exe", {
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${process.env.CDP_PORT || "9224"}`,
    ...(useTestProfile ? { WEBVIEW2_USER_DATA_FOLDER: testDir } : {}),
  },
});
child.on("exit", (code, signal) => console.log(`[run-app] exe 退出 code=${code} signal=${signal}`));
