// 离线快照的资源审计与整页加固（第三轮审计 T-01 / T-02 / T-05）
//
// 为什么要单独一个模块：
// - 正则只认 `<img src>`，会被 `<picture><source srcset>`、`img srcset`、CSS 背景图、
//   `data-src` 优先级绕过（T-01）；
// - 属性值里含 `>` 时正则截不断，攻击者 CSP 会残留（T-05）。
// 所以这里统一用 htmlparser2 解析成 DOM，再按节点做判定与清理。
//
// 两条口径（必须一致）：
// 1) 审计：统计整页所有图片来源（img.src / img.srcset / source.src|srcset / CSS background），
//    相对引用必须能在资源目录里找到文件，否则算缺失；
// 2) 加固：把所有非本地资源引用从快照里移除（外链、非位图 data:、javascript: 等），
//    只保留可离线读取的位图 data URI 与本地相对引用。
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { findAll, findOne, prepend, removeElement } from "domutils";
import type { AnyNode, Element } from "domhandler";

/** 项目自己的 CSP（离线快照唯一允许出现的一条） */
export const OFFLINE_CSP =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/** 允许内嵌的位图 data URI（SVG 不在内） */
export const RASTER_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp)[;,]?/i;

const RESOURCE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL_FILE_RE = /^[A-Za-z0-9._-]+$/;

export type ResourceKind = "keep" | "relative" | "external" | "invalid";

/** 判定一个资源地址的类别（不碰文件系统） */
export function classifyResource(url: string): ResourceKind {
  const u = String(url ?? "").trim();
  if (!u) return "invalid";
  if (/^data:/i.test(u)) return RASTER_DATA_IMAGE_RE.test(u) ? "keep" : "invalid";
  if (RESOURCE_SCHEME_RE.test(u) || u.startsWith("//")) return "external";
  if (u.startsWith("/") || u.startsWith("\\") || u.includes("..")) return "invalid";
  return "relative";
}

function isElement(n: AnyNode): n is Element {
  return n.type === "tag" || n.type === "script" || n.type === "style";
}

/** 拆 srcset："a.png 1x, b.png 2x" */
export function splitSrcset(value: string): Array<{ url: string; descriptor: string }> {
  const out: Array<{ url: string; descriptor: string }> = [];
  for (const part of String(value).split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\S+)(?:\s+(.+))?$/);
    if (m && m[1]) out.push({ url: m[1], descriptor: (m[2] ?? "").trim() });
  }
  return out;
}

const URL_IN_CSS_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/** 取一段 CSS 里「background / background-image」声明的 url() */
export function collectBackgroundUrls(css: string): string[] {
  const out: string[] = [];
  const clean = String(css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const decl of clean.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
    const prop = (decl[1] ?? "").toLowerCase();
    if (!/^background(-image)?$/.test(prop)) continue;
    for (const u of (decl[2] ?? "").matchAll(URL_IN_CSS_RE)) out.push(u[2] ?? "");
  }
  return out;
}

/** 元素里的文本（用于 <style> 内容） */
function textOf(el: Element): string {
  return el.children.map((c) => ("data" in c ? String((c as { data: string }).data) : "")).join("");
}

// ---------------------------------------------------------------------------
// 审计：统计整页图片来源
// ---------------------------------------------------------------------------

export interface ImageAudit {
  /** 出现的图片来源总数（含成功与失败） */
  total: number;
  /** 已本地化且可读取（或位图 data URI） */
  local: number;
  /** 失败合计 = external + invalid + missing */
  failed: number;
  external: number;
  invalid: number;
  /** 相对引用但资源目录里找不到文件 */
  missing: number;
}

type LocalKind = "local" | "external" | "invalid" | "missing";

function classifyWithFs(url: string, assetsDir: string): LocalKind {
  const kind = classifyResource(url);
  if (kind === "keep") return "local";
  if (kind === "external") return "external";
  if (kind === "invalid") return "invalid";
  const bare = String(url).split("?")[0]!.split("#")[0]!;
  if (!LOCAL_FILE_RE.test(bare)) return "invalid";
  const abs = path.resolve(assetsDir, bare);
  if (!abs.startsWith(path.resolve(assetsDir) + path.sep)) return "invalid";
  return fs.existsSync(abs) ? "local" : "missing";
}

/**
 * 审计整页快照里的图片：
 * - img：src、srcset；只有 data-src 没有 src 时浏览器不会加载 → 记为无效
 * - source：src、srcset
 * - style 属性与 <style>：background(-image) 的 url()
 * 相对引用必须是资源目录里真实存在的文件。
 */
export function auditSnapshotImages(html: string, assetsDir: string): ImageAudit {
  const doc = parseDocument(html);
  const urls: string[] = [];
  let invalidCount = 0;

  for (const el of findAll(isElement, doc.children)) {
    if (el.name === "img" || el.name === "source") {
      const src = el.attribs.src;
      const srcset = el.attribs.srcset;
      const lazy = el.attribs["data-src"] ?? el.attribs["data-original"];
      if (src) urls.push(src);
      if (srcset) for (const c of splitSrcset(srcset)) urls.push(c.url);
      // 只有懒加载地址、没有真实 src：浏览器不会加载，快照里等于没有图
      if (el.name === "img" && !src && !srcset && lazy) invalidCount += 1;
      if (el.name === "img" && !src && !srcset && !lazy) invalidCount += 1;
    }
    // 其他可能承载图片的入口（审计也要覆盖，避免换个标签就绕过）
    if (el.name === "video" && el.attribs.poster) urls.push(el.attribs.poster);
    if (el.name === "input" && (el.attribs.type ?? "").toLowerCase() === "image" && el.attribs.src) {
      urls.push(el.attribs.src);
    }
    if (el.name === "image") {
      const href = el.attribs.href ?? el.attribs["xlink:href"];
      if (href) urls.push(href);
    }
    if (el.name === "object" && el.attribs.data) urls.push(el.attribs.data);
    if (el.attribs.style) urls.push(...collectBackgroundUrls(el.attribs.style));
    if (el.name === "style") urls.push(...collectBackgroundUrls(textOf(el)));
  }

  // 片段引用（#gradient 之类）指向文档自身，不算图片资源
  const resources = urls.filter((u) => !u.trim().startsWith("#"));

  const audit: ImageAudit = {
    total: resources.length + invalidCount,
    local: 0,
    failed: 0,
    external: 0,
    invalid: invalidCount,
    missing: 0,
  };
  for (const u of resources) {
    const kind = classifyWithFs(u, assetsDir);
    if (kind === "local") audit.local += 1;
    else if (kind === "external") audit.external += 1;
    else if (kind === "missing") audit.missing += 1;
    else audit.invalid += 1;
  }
  audit.failed = audit.external + audit.invalid + audit.missing;
  return audit;
}

// ---------------------------------------------------------------------------
// 加固：清理整页里的危险/远程资源引用
// ---------------------------------------------------------------------------

const DROP_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "frame",
  "frameset",
  "base",
  "link",
]);

/**
 * 清理内联样式里的 url()。
 * 注意：不能按 ";" 拆声明——`data:image/png;base64,...` 本身含分号，拆开会把数据 URI 切断。
 * 统一把「外链 / 非位图 data: / javascript:」的 url() 替换为 `url(#)`（等价于无资源）。
 */
function cleanStyleDeclarations(css: string): string {
  return cleanStyleSheet(css);
}

function cleanStyleSheet(css: string): string {
  return css.replace(URL_IN_CSS_RE, (whole, _q, u) => {
    const k = classifyResource(String(u));
    return k === "external" || k === "invalid" ? "url(#)" : whole;
  });
}

function filterSrcset(value: string): string | null {
  const kept = splitSrcset(value).filter((c) => {
    const k = classifyResource(c.url);
    return k === "keep" || k === "relative";
  });
  if (kept.length === 0) return null;
  return kept.map((c) => (c.descriptor ? c.url + " " + c.descriptor : c.url)).join(", ");
}

function cleanElement(el: Element): void {
  for (const name of Object.keys(el.attribs)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on") || lower === "srcdoc" || lower === "formaction") {
      delete el.attribs[name];
      continue;
    }
    if (lower === "href" || lower === "src" || lower === "action" || lower === "formaction") {
      if (/^\s*javascript:/i.test(el.attribs[name] ?? "")) delete el.attribs[name];
    }
  }

  if (el.name === "img" || el.name === "source") {
    const src = el.attribs.src;
    if (src !== undefined) {
      const k = classifyResource(src);
      if (k === "external" || k === "invalid") delete el.attribs.src;
    }
    const srcset = el.attribs.srcset;
    if (srcset !== undefined) {
      const filtered = filterSrcset(srcset);
      if (filtered) el.attribs.srcset = filtered;
      else delete el.attribs.srcset;
    }
    // 懒加载属性在离线快照里没有意义，且容易被误当成有效图片地址
    delete el.attribs["data-src"];
    delete el.attribs["data-original"];
  }

  // 其他资源入口：只保留本地位图引用
  const otherResourceAttrs: Record<string, string[]> = {
    video: ["poster"],
    input: ["src"],
    image: ["href", "xlink:href"],
    object: ["data"],
  };
  for (const attr of otherResourceAttrs[el.name] ?? []) {
    const value = el.attribs[attr];
    if (value === undefined) continue;
    const k = classifyResource(value);
    if (k === "external" || k === "invalid") delete el.attribs[attr];
  }

  if (el.attribs.style !== undefined) {
    const cleaned = cleanStyleDeclarations(el.attribs.style);
    if (cleaned.trim()) el.attribs.style = cleaned;
    else delete el.attribs.style;
  }

  if (el.name === "style" && el.children.length > 0) {
    for (const child of el.children) {
      if (child.type === "text") (child as { data: string }).data = cleanStyleSheet((child as { data: string }).data);
    }
  }
}

/** 删除所有 CSP / refresh 的 meta（属性顺序、值里带 `>` 都交给解析器处理） */
function isMetaHttpEquiv(el: Element): boolean {
  if (el.name !== "meta") return false;
  const equiv = (el.attribs["http-equiv"] ?? "").toLowerCase().trim();
  return equiv === "content-security-policy" || equiv === "refresh";
}

/**
 * 整页加固（导入外部/历史 HTML 时用）：
 * - 删除 script / iframe / object / embed / applet / frame / frameset / base / link
 * - 删除 CSP 与 refresh 的 meta，并由本项目**无条件注入**唯一 CSP
 * - 删除 on* / srcdoc / formaction / javascript: 链接
 * - 图片与 CSS 背景只保留「位图 data URI」与「本地相对引用」，外链与非位图 data: 一律移除
 * 保留页面自有样式与内嵌位图。
 */
export function hardenOfflineHtml(html: string): string {
  const doc = parseDocument(html);

  // 1) 删除危险标签与危险 meta
  for (const el of findAll((n): n is Element => isElement(n) && (DROP_TAGS.has(n.name) || isMetaHttpEquiv(n)), doc.children)) {
    removeElement(el);
  }

  // 2) 清理属性与资源引用
  for (const el of findAll(isElement, doc.children)) cleanElement(el);

  // 3) 注入项目自己的 CSP（head 优先，其次 html 根，最后文档开头）
  const cspSource = parseDocument(
    '<meta http-equiv="Content-Security-Policy" content="' + OFFLINE_CSP + '">'
  );
  const cspNode = cspSource.children.find(isElement);
  if (cspNode) {
    const head = findOne((n): n is Element => isElement(n) && n.name === "head", doc.children);
    if (head) prepend(head, cspNode);
    else {
      const root = doc.children.find(isElement);
      if (root) prepend(root, cspNode);
      else doc.children.unshift(cspNode);
    }
  }

  // encodeEntities:"utf8" 只保留中文可读，仍会转义 < > & 与引号（不会造成标签注入）；
  // dom-serializer 会把单引号转成 &apos;（等价但难读），CSP 里全是单引号，转回来便于核对
  return render(doc, { encodeEntities: "utf8" }).replace(/&apos;/g, "'");
}
