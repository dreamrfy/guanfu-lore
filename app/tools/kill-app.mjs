// 清理遗留的 guanfu-lore.exe 进程（npm run kill-app）
import { execSync } from "node:child_process";
try {
  const out = execSync('taskkill /F /IM guanfu-lore.exe /T', { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  console.log(out.trim());
} catch (e) {
  console.log("无存活进程或清理失败: " + (e.stderr ?? e.message));
}
