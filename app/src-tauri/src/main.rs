// 桌面壳（第一版只包网页）
//
// 决策 D1：桌面版**不自带剪藏服务**——剪藏统一走云端那台（唯一抓取器，避免分叉）。
// 因此这个壳里没有 sidecar、没有本地服务，只是一个装好 WebView 的窗口。
// 前端是同一个 app/ 里的网页端：数据仍在浏览器 IndexedDB（本地优先，见 D4 同步层）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动桌面壳失败");
}
