// 扩展弹窗：填服务地址/Token → 存本地；点「剪藏当前页」让内容脚本去剪。
const serverInput = document.getElementById("server");
const tokenInput = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.local.get(["server", "token"], (items) => {
  serverInput.value = items.server || "";
  tokenInput.value = items.token || "";
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set(
    { server: serverInput.value.trim(), token: tokenInput.value.trim() },
    () => {
      status.textContent = "已保存";
      setTimeout(() => (status.textContent = ""), 1500);
    }
  );
});

document.getElementById("clip").addEventListener("click", async () => {
  status.textContent = "剪藏中…";
  chrome.storage.local.set(
    { server: serverInput.value.trim(), token: tokenInput.value.trim() },
    async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) {
          status.textContent = "找不到当前标签页";
          return;
        }
        await chrome.tabs.sendMessage(tab.id, { type: "biji:clip" });
        status.textContent = "已发出剪藏请求（结果看页面右下角提示）";
      } catch (e) {
        status.textContent = "剪藏失败：" + (e && e.message ? e.message : "未知错误");
      }
    }
  );
});
