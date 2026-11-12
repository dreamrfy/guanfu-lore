import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 说明：
// 1) 暂不启用 Tailwind —— 本阶段界面数值要严格对齐 FlowUs 基准规格（固定像素），纯 CSS 更好控；
//    且 Tailwind 的 preflight 可能与 BlockNote 自带样式相互影响。Tailwind 已装好，做设置页时再启用。
// 2) 端口读 PORT 环境变量 —— 这样预览宿主分配端口时能对上（否则会各起各的、页面打不开）。
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  server: { port, strictPort: false, open: false },
  clearScreen: false,
});
