/**
 * 桌面端自动更新（D03 可准备部分）
 *
 * 只在 Tauri 桌面壳里生效（网页端没有 window.__TAURI_INTERNALS__，直接跳过）。
 * 启动 30 秒后静默查一次更新；发现新版本用 confirm 问用户，同意就下载安装并重启。
 * 查询失败（没网/仓库还没建/更新源没配好）一律静默——更新是锦上添花，不能挡开机。
 *
 * 发布环节：仓库已建（dreamrfy/guanfu-lore），端点已指向真实仓库；
 * GitHub Releases 上传 latest.json + 签名好的安装包，这条链才算通。
 */

const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function initDesktopUpdater(): void {
  if (!isDesktop) return;
  window.setTimeout(() => {
    void checkForUpdate();
  }, 30_000);
}

async function checkForUpdate(): Promise<void> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const update = await check();
    if (!update?.available) return;
    const ok = window.confirm(
      `发现新版本 ${update.version}（当前 ${update.currentVersion}），现在下载并安装吗？`
    );
    if (!ok) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch {
    /* 静默：更新源没就绪/断网都不影响正常使用 */
  }
}
