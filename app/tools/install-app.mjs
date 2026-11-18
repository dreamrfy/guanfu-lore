// 静默安装 NSIS 包（ currentUser 模式）：npm run install-app
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const installer =
  "src-tauri/target/release/bundle/nsis/guanfu-lore_0.1.0_x64-setup.exe";
if (!existsSync(installer)) {
  console.error("安装包不存在: " + installer);
  process.exit(1);
}
try {
  execSync(`"${installer}" /S`, { stdio: "ignore", timeout: 120_000 });
  console.log("安装完成（静默）");
} catch (e) {
  console.error("安装失败: " + (e.message ?? e));
  process.exit(1);
}
