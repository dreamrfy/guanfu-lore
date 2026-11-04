// 清洗与抽取（对应需求 SNAP-05：清理可执行脚本、危险链接、跟踪参数）
//
// 关键坑（实测）：微信给正文容器加 `style="visibility:hidden; opacity:0"` 做渐进显示，
// 原样保留会让离线 HTML 打开后【正文整块不可见】——必须清除。
//
// 安全策略（2026-11-04 整改）：不再用「正则删标签」当唯一防线，改用
// sanitize-html 做 token 级白名单清洗：
//   - 标签白名单：只保留文章排版需要的标签；script/style/iframe/svg/math/object/embed
//     等连同内容一起丢弃（nonTextTags）
//   - 属性白名单：img 只留 src/alt/width/height/style/class，a 只留 href/title
//   - 协议白名单：只允许 http/https/mailto；img 只允许 http/https
//   - 所有 on* 事件属性、srcdoc、javascript:、data: 脚本型地址一律不在白名单内
//   - 懒加载图：有 data-src 无 src 时补 src（P1-05）
//   - 隐藏样式在清洗前后各清一遍（纵深防御）
import sanitizeHtml from "sanitize-html";

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
export function stripHiddenDeclarations(css: string): string {
  return css
    .replace(/visibility\s*:\s*hidden\s*;?/gi, "")
    .replace(/opacity\s*:\s*0(?:\.0+)?\s*;?/gi, "")
    .replace(/display\s*:\s*none\s*;?/gi, "");
}

const ALLOWED_TAGS = [
  "div", "p", "span", "section", "article", "header", "footer", "main", "aside",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "pre", "code", "kbd", "samp", "var",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "img", "a", "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small", "sup", "sub",
  "br", "hr", "figure", "figcaption", "time", "ruby", "rt", "rp",
];

/**
 * 允许保留的内联样式属性。
 * 用白名单属性名（而非放行整个 style），隐藏类声明在 transformTags 里先清掉。
 */
const ALLOWED_STYLE_PROPS: Record<string, RegExp[]> = {
  color: [/^[#a-z0-9(),.%\s-]+$/i],
  "background-color": [/^[#a-z0-9(),.%\s-]+$/i],
  "text-align": [/^(left|right|center|justify|start|end)$/i],
  "font-size": [/^[\d.]+(px|em|rem|%|pt)$/i],
  "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
  "font-style": [/^(normal|italic|oblique)$/i],
  "font-family": [/^[a-z0-9,\s"'\u4e00-\u9fa5-]+$/i],
  "text-decoration": [/^[a-z\s-]+$/i],
  "line-height": [/^[\d.]+(px|em|rem|%)?$/i],
  "letter-spacing": [/^[-\d.]+(px|em|rem)?$/i],
  "text-indent": [/^[-\d.]+(px|em|rem)?$/i],
  margin: [/^[-\d.\s]+(px|em|rem|%|auto|\s)*$/i],
  "margin-top": [/^[-\d.]+(px|em|rem|%)?$/i],
  "margin-bottom": [/^[-\d.]+(px|em|rem|%)?$/i],
  "margin-left": [/^[-\d.]+(px|em|rem|%)?$/i],
  "margin-right": [/^[-\d.]+(px|em|rem|%)?$/i],
  padding: [/^[-\d.\s]+(px|em|rem|%)*$/i],
  width: [/^[\d.]+(px|em|rem|%)$/i, /^auto$/i],
  height: [/^[\d.]+(px|em|rem|%)$/i, /^auto$/i],
  "max-width": [/^[\d.]+(px|em|rem|%)$/i, /^100%$/i],
  "min-width": [/^[\d.]+(px|em|rem|%)$/i],
  "vertical-align": [/^(baseline|middle|top|bottom|sub|super|text-top|text-bottom)$/i],
  "white-space": [/^(normal|pre|nowrap|pre-wrap|pre-line|break-spaces)$/i],
  "word-break": [/^(normal|break-all|keep-all|break-word)$/i],
  "overflow-wrap": [/^(normal|anywhere|break-word)$/i],
  "border-radius": [/^[\d.\s]+(px|em|rem|%)*$/i],
  "list-style-type": [/^(disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|none)$/i],
};

/** 允许内嵌的位图 data URI（SVG 不在内：SVG 可携带脚本/外链语义） */
const RASTER_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp)[;,]?/i;

/** data-src 优先补成 src：微信文章图片普遍是懒加载 */
function fillLazySrc(attribs: Record<string, string>, allowDataImages: boolean): Record<string, string> {
  const dataSrc = attribs["data-src"] || attribs["data-original"];
  const src = attribs.src ?? "";
  const hasRealSrc = /^(https?:\/\/|data:image\/)/i.test(src);
  if (dataSrc && (!hasRealSrc || src.trim() === "")) {
    attribs.src = dataSrc;
  }
  delete attribs["data-src"];
  delete attribs["data-original"];
  // data: 地址只允许「离线导入 + 位图格式」，其余一律丢弃
  // （data:text/html、data:image/svg+xml 都不能当图片放行）
  const finalSrc = attribs.src ?? "";
  if (/^data:/i.test(finalSrc)) {
    if (!allowDataImages || !RASTER_DATA_IMAGE_RE.test(finalSrc)) delete attribs.src;
  }
  return attribs;
}

/** 兜底：清洗后仍残留的非位图 data URI（例如属性顺序导致 transform 未覆盖） */
function stripNonRasterDataSrc(html: string): string {
  return html.replace(/(<img\b[^>]*?)\ssrc\s*=\s*("data:image\/(?!png|jpe?g|gif|webp)[^"]*"|'data:image\/(?!png|jpe?g|gif|webp)[^']*'|data:image\/(?!png|jpe?g|gif|webp)[^\s>]*)/gi, "$1");
}

function cleanStyle(attribs: Record<string, string>): Record<string, string> {
  if (typeof attribs.style === "string") {
    const cleaned = stripHiddenDeclarations(attribs.style)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("; ");
    if (cleaned) attribs.style = cleaned;
    else delete attribs.style;
  }
  return attribs;
}

export interface SanitizeOptions {
  /** 允许 data:image/* 内嵌图（离线快照导入时用；在线抓取一律不允许） */
  allowDataImages?: boolean;
}

export function sanitizeContent(html: string, opts: SanitizeOptions = {}): string {
  const allowDataImages = opts.allowDataImages === true;
  // 先做一次粗清：把隐藏样式在解析前拿掉，避免解析器把它当合法样式保留
  let h = stripHiddenDeclarations(html);

  h = sanitizeHtml(h, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["style", "class"],
      img: ["src", "alt", "title", "width", "height", "style", "class"],
      a: ["href", "title", "name", "id"],
      td: ["colspan", "rowspan", "style", "class"],
      th: ["colspan", "rowspan", "style", "class"],
      col: ["span", "width"],
      ol: ["start", "type"],
      time: ["datetime"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: allowDataImages ? ["http", "https", "data"] : ["http", "https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    // 这些标签连同内容一起丢弃（否则内容会被转义成文字留在正文里）
    nonTextTags: [
      "script", "style", "textarea", "option", "noscript", "iframe", "noembed",
      "noframes", "xmp", "plaintext", "svg", "math", "object", "embed", "template",
    ],
    allowedStyles: {
      "*": ALLOWED_STYLE_PROPS,
    },
    transformTags: {
      img: (tagName, attribs) => ({ tagName, attribs: cleanStyle(fillLazySrc(attribs, allowDataImages)) }),
      a: (tagName, attribs) => {
        const next = cleanStyle(attribs);
        // 外链统一加上安全关系属性
        if (next.href) {
          next.rel = "noopener noreferrer";
          next.target = "_blank";
        }
        return { tagName, attribs: next };
      },
      "*": (tagName, attribs) => ({ tagName, attribs: cleanStyle(attribs) }),
    },
  });

  // 清洗后再兜一遍：某些实体形式（&#111;nclick）可能被解码后留下 on* 属性
  h = h.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  h = h.replace(/\s(?:srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  h = stripNonRasterDataSrc(h);
  return h;
}

/** 图片标签里的地址：优先 data-src（懒加载），其次 src */
export function imgUrlOf(tag: string): { url: string; from: "data-src" | "src" | "none" } {
  const attr = (name: string): string | null => {
    const quoted = tag.match(new RegExp("\\s" + name + "\\s*=\\s*\"([^\"]*)\"", "i"));
    if (quoted) return unescapeEntities(quoted[1]!);
    const single = tag.match(new RegExp("\\s" + name + "\\s*=\\s*'([^']*)'", "i"));
    if (single) return unescapeEntities(single[1]!);
    const bare = tag.match(new RegExp("\\s" + name + "\\s*=\\s*([^\\s>\"']+)", "i"));
    return bare ? unescapeEntities(bare[1]!) : null;
  };
  const d = attr("data-src");
  if (d) return { url: d, from: "data-src" };
  const s = attr("src");
  if (s) return { url: s, from: "src" };
  return { url: "", from: "none" };
}

/**
 * 把正文里的外链图片替换为本地资源引用（同目录相对路径）。
 * 输入必须是 sanitizeContent 的输出（属性已规范化），避免在脏 HTML 上做替换。
 */
export function rewriteImageSources(html: string, mapping: ReadonlyMap<string, string>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const picked = imgUrlOf(tag);
    const replacement = picked.url ? mapping.get(picked.url) : undefined;
    if (!replacement) {
      // 未映射的图片（下载失败/非白名单）：移除 src，保留 alt 便于识别
      return tag.replace(/\s(?:src|data-src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    }
    let next = tag.replace(/\s(?:src|data-src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    next = next.replace(/\s*\/?>$/, "");
    return next + ' src="' + escapeHtml(replacement) + '">';
  });
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
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 纯文本化（用于正文长度校验与摘要） */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return unescapeEntities(text).replace(/\s+/g, " ").trim();
}

// 整页快照的审计与加固在 fetch/snapshot.ts（基于 DOM，能正确处理 srcset / <source> / CSS 背景图 / 含 > 的属性值）。
// 这里保留同名导出，避免调用方改 import 路径。
export { hardenOfflineHtml, auditSnapshotImages, classifyResource, OFFLINE_CSP } from "./snapshot.ts";
