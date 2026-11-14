// 在任意网页右下角挂一个「剪藏」按钮。
// 点它（或从扩展弹窗触发）→ 抓当前页正文 → 交给知识库服务端清洗并存档。
//
// 为什么正文由浏览器抓、服务器不自己抓：普通网页正文要渲染才有，
// 服务端直接抓 HTML 常常拿到空壳；扩展在渲染后的页面里取，最准。
(function () {
  if (window.__bijiClipInjected) return;
  window.__bijiClipInjected = true;

  const BTN_ID = "biji-clip-btn";
  const TIP_ID = "biji-clip-tip";
  const MAX_HTML = 200000;

  function extract() {
    const title = (
      document.querySelector("h1")?.innerText ||
      document.title ||
      ""
    ).trim();

    const root =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;

    // 复制一份正文：去掉脚本/样式/iframe，避免带脏东西上去
    const clone = root.cloneNode(true);
    clone
      .querySelectorAll("script,style,noscript,iframe,svg,form,button")
      .forEach((node) => node.remove());

    const html = (clone.innerHTML || "").slice(0, MAX_HTML);
    const text = (root.innerText || "").trim().slice(0, 20000);
    const img =
      document.querySelector("article img[src], main img[src]")?.src || "";

    return { title, html, text, img, url: location.href };
  }

  function tip(message, ok) {
    const old = document.getElementById(TIP_ID);
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = TIP_ID;
    el.textContent = message;
    el.style.cssText =
      "position:fixed;right:18px;bottom:62px;z-index:2147483647;max-width:280px;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5;color:#fff;background:" +
      (ok ? "#067647" : "#b42318") +
      ";box-shadow:0 4px 14px rgba(0,0,0,.18)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function getConfig() {
    return new Promise((resolve) =>
      chrome.storage.local.get(["server", "token"], (items) =>
        resolve({ server: items.server || "", token: items.token || "" })
      )
    );
  }

  async function doClip() {
    const { server, token } = await getConfig();
    if (!server) {
      tip("先在扩展里填服务地址", false);
      return;
    }
    try {
      const info = extract();
      const res = await fetch(server.replace(/\/+$/, "") + "/api/clip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({
          url: info.url,
          title: info.title,
          html: info.html,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        tip("已剪藏：" + (data.clip?.title || info.title), true);
      } else {
        tip("失败：" + (data?.error || "HTTP " + res.status), false);
      }
    } catch (e) {
      tip("失败：" + (e && e.message ? e.message : "连不上服务"), false);
    }
  }


  /* ---------------- 划线高亮（H01）：选中文字 → 浮出按钮 → 上报 ---------------- */

  const HL_BTN_ID = "biji-hl-btn";
  let hlRange = null; // 最近一次有效选区的副本

  function buildSelector(range) {
    const locator = window.kfTextLocator;
    if (!locator) return null;
    return locator.buildTextQuoteSelector(document.body, range);
  }

  function reportHighlight() {
    if (!hlRange) return;
    void (async () => {
      const { server, token } = await getConfig();
      if (!server) {
        tip("先在扩展里填服务地址", false);
        return;
      }
      const sel = buildSelector(hlRange);
      if (!sel) {
        tip("划线失败：选区拿不到文本", false);
        return;
      }
      try {
        const res = await fetch(server.replace(/\/+$/, "") + "/api/highlights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
          body: JSON.stringify({
            pageUrl: location.href,
            title: document.title,
            quote: sel,
          }),
        });
        const data = await res.json().catch(() => null);
        if (data && data.ok) {
          tip("已划线", true);
          window.getSelection().removeAllRanges();
        } else {
          tip("划线失败：" + (data?.error || "HTTP " + res.status), false);
        }
      } catch (e) {
        tip("划线失败：" + (e && e.message ? e.message : "连不上服务"), false);
      } finally {
        document.getElementById(HL_BTN_ID)?.remove();
        hlRange = null;
      }
    })();
  }

  function showHlButton(rect) {
    let btn = document.getElementById(HL_BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = HL_BTN_ID;
      btn.textContent = "🖍 划线";
      btn.addEventListener("mousedown", (e) => e.stopPropagation()); // 别把选区弄没了
      btn.addEventListener("click", reportHighlight);
      document.body.appendChild(btn);
    }
    const top = Math.max(8, Math.min(window.innerHeight - 44, rect.top - 40));
    const left = Math.max(8, Math.min(window.innerWidth - 120, rect.left));
    btn.style.cssText =
      "position:fixed;z-index:2147483647;padding:6px 12px;border-radius:999px;border:1px solid #d8d8d8;" +
      "background:#fff;color:#37352f;font-size:13px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.16);" +
      "top:" + top + "px;left:" + left + "px";
  }

  function checkSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text || !sel.rangeCount || !document.body) {
      document.getElementById(HL_BTN_ID)?.remove();
      return;
    }
    hlRange = sel.getRangeAt(0).cloneRange();
    showHlButton(hlRange.getBoundingClientRect());
  }

  // 选完鼠标抬起稍等一下再检查（让浏览器把选区定住）；点空白处按钮消失
  document.addEventListener("mouseup", () => setTimeout(checkSelection, 10));
  document.addEventListener("mousedown", (e) => {
    if (e.target instanceof Element && e.target.id !== HL_BTN_ID) {
      document.getElementById(HL_BTN_ID)?.remove();
    }
  });

  function mountButton() {
    if (!document.body || document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "✂ 剪藏";
    btn.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:8px 14px;border-radius:999px;border:1px solid #d8d8d8;background:#fff;color:#37352f;font-size:13px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.12)";
    btn.addEventListener("click", doClip);
    document.body.appendChild(btn);
  }

  if (document.body) mountButton();
  else document.addEventListener("DOMContentLoaded", mountButton);

  // 扩展弹窗触发的剪藏
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "biji:clip") {
      void doClip();
    }
  });
})();
