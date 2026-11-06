// VPS/systemd 部署入口（2026-11-06）：node 直接执行，调用 pollFn.main 并输出 JSON 统计
// 云函数部署不受影响（走 pack 脚本的 index.js 垫片），此文件只服务于 VPS 的 systemd oneshot。
// 凭证：KF_SECRETS_FILE（微信凭证文件路径）+ R2_*（EnvironmentFile=/etc/bijiapp/r2.env）
import { main } from "./pollFn.ts";

main()
  .then((result) => {
    console.log("[bijiapp-poll] " + JSON.stringify(result));
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("[bijiapp-poll] 运行失败：" + String((err && err.message) || err));
    process.exitCode = 1;
  });
