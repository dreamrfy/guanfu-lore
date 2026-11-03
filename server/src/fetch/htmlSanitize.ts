// 清洗与抽取（对应需求 SNAP-05：清理可执行脚本、危险链接、跟踪参数）
//
// 关键坑（实测）：微信给正文容器加 `style="visibility:hidden; opacity:0"` 做渐进显示，
// 原样保留会让离线 HTML 打开后【正文整块不可见】——必须清除。

export function unescapeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** 抽出正文容器：按 div 配对计数（正文是嵌套 div，懒惰正则会截断） */
export function extractJsContent(html: string): string | null {
  const anchor = html.search(/<div[^>]*id="js_content"/i);
  if (anchor < 0) return null;
  const tags = Array.from(html.matchAll(/<\/?div\b[^>]*>/gi)).filter((m) => m.index >= anchor);
  let depth = 0;
  for (const m of tags) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(anchor, m.index + m[0].length);
    } else {
      depth += 1;
    }
  }
  return null;
}

/** 清除隐藏样式声明（visibility:hidden / opacity:0 / display:none） */
function stripHidden(css: string): string {
  return css
    .replace(/visibility\s*:\s*hidden\s*;?/gi, "")
    .replace(/opacity\s*:\s*0(?:\.0+)?\s*;?/gi, "")
    .replace(/display\s*:\s*none\s*;?/gi, "");
}

export function sanitizeContent(html: string): string {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
  // 去隐藏样式（双引号与单引号两种写法都处理）
  h = h.replace(/style\s*=\s*"([^"]*)"/gi, (_m, css: string) => 'style="' + stripHidden(css) + '"');
  h = h.replace(/style\s*=\s*'([^']*)'/gi, (_m, css: string) => "style='" + stripHidden(css) + "'");
  return h;
}

/** 图片标签里的地址：优先 data-src（懒加载），其次 src */
export function imgUrlOf(tag: string): { url: string; from: "data-src" | "src" | "none" } {
  const d = tag.match(/data-src\s*=\s*"([^"]+)"/i);
  if (d) return { url: unescapeEntities(d[1]!), from: "data-src" };
  const s = tag.match(/\ssrc\s*=\s*"([^"]+)"/i);
  if (s) return { url: unescapeEntities(s[1]!), from: "src" };
  return { url: "", from: "none" };
}

export function metaContent(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? unescapeEntities(m[1]!) : "";
}

export function htmlTitle(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? unescapeEntities(t[1]!).replace(/\s+/g, " ").trim() : "";
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
