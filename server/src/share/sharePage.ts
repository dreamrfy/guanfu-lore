// 公开分享只读页渲染（W112）
//
// 输入是同步库里的 page + BlockNote 块数组，输出一个自包含的只读 HTML。
// 设计约束：
//   - 服务端手写渲染，不引编辑器依赖（公开页不能把整个 ProseMirror 打包出去）
//   - 所有动态文本都过 escapeHtml；图片只允许本页正文里出现过的 asset://（路由层再校验一次）
//   - <meta name="robots" content="noindex"> + X-Robots-Tag（路由层）双保险
//   - 相对地址 ./a/<id>：域名无论挂在 share 还是别的子域都能直接用

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 从任意 JSON 里收集 asset:// 引用（路由层用它做“只准取本页附件”的白名单） */
export function collectAssetIds(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.startsWith("asset://")) into.add(value.slice("asset://".length));
  } else if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, into);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectAssetIds(v, into);
  }
  return into;
}

const ASSET_SCHEME = "asset://";

type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
};

function renderInline(item: unknown): string {
  if (typeof item === "string") return escapeHtml(item);
  if (!item || typeof item !== "object") return "";
  const node = item as { type?: string; text?: string; styles?: InlineStyle; href?: string; content?: unknown };
  if (node.type === "link") {
    const href = typeof node.href === "string" && /^https?:\/\//.test(node.href) ? node.href : "#";
    return `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${renderInline(node.content)}</a>`;
  }
  const text = escapeHtml(String(node.text ?? ""));
  const s = node.styles ?? {};
  if (s.code) return `<code>${text}</code>`;
  let out = text;
  if (s.bold) out = `<strong>${out}</strong>`;
  if (s.italic) out = `<em>${out}</em>`;
  if (s.underline) out = `<u>${out}</u>`;
  if (s.strike) out = `<s>${out}</s>`;
  return out;
}

function renderContent(content: unknown): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return escapeHtml(content);
  if (Array.isArray(content)) return content.map(renderInline).join("");
  return escapeHtml(String(content));
}

function renderChildren(children: unknown): string {
  if (!Array.isArray(children) || children.length === 0) return "";
  return `<div class="indent">${renderBlockList(children)}</div>`;
}

function blockText(node: Record<string, unknown>): string {
  return renderContent(node.content);
}

function renderBlock(node: Record<string, unknown>): string {
  const type = String(node.type ?? "");
  const props = (node.props ?? {}) as Record<string, unknown>;
  switch (type) {
    case "heading": {
      const level = Math.min(Math.max(Number(props.level) || 1, 1), 3);
      return `<h${level}>${blockText(node)}${renderChildren(node.children)}</h${level}>`;
    }
    case "paragraph":
      return blockText(node) || renderChildren(node.children)
        ? `<p>${blockText(node)}${renderChildren(node.children)}</p>`
        : "";
    case "bulletListItem":
      return `<li>${blockText(node)}${renderChildren(node.children)}</li>`;
    case "numberedListItem":
      return `<li>${blockText(node)}${renderChildren(node.children)}</li>`;
    case "checkListItem":
      return `<li class="check">${props.checked ? "☑" : "☐"} ${blockText(node)}${renderChildren(node.children)}</li>`;
    case "quote":
      return `<blockquote>${blockText(node)}${renderChildren(node.children)}</blockquote>`;
    case "codeBlock": {
      const lang = escapeHtml(String(props.language ?? ""));
      return `<pre><code data-lang="${lang}">${blockText(node)}</code></pre>`;
    }
    case "divider":
      return `<hr />`;
    case "image":
    case "video":
    case "audio":
    case "file": {
      const url = String(props.url ?? "");
      const caption = escapeHtml(String(props.caption ?? ""));
      if (url.startsWith(ASSET_SCHEME)) {
        const id = escapeHtml(url.slice(ASSET_SCHEME.length));
        const tag =
          type === "image"
            ? `<img src="./a/${id}" alt="${caption || "附件"}" loading="lazy" />`
            : `<p><a href="./a/${id}" rel="noopener noreferrer" target="_blank">📎 附件${caption ? "：" + caption : ""}</a></p>`;
        return caption && type === "image" ? `${tag}<p class="caption">${caption}</p>` : tag;
      }
      if (/^https?:\/\//.test(url)) {
        const safe = escapeHtml(url);
        return type === "image"
          ? `<img src="${safe}" alt="${caption || "图片"}" loading="lazy" />`
          : `<p><a href="${safe}" rel="noopener noreferrer nofollow" target="_blank">📎 外链${caption ? "：" + caption : ""}</a></p>`;
      }
      return "";
    }
    default: {
      // 未识别的块型（表格、嵌入等）：至少把纯文本内容放出来，不静默丢字
      const text = blockText(node);
      return text ? `<p>${text}${renderChildren(node.children)}</p>` : "";
    }
  }
}

/** 连续的列表项归组到 ul/ol，其余块原样渲染 */
function renderBlockList(blocks: unknown[]): string {
  const out: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };
  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const node = raw as Record<string, unknown>;
    const type = String(node.type ?? "");
    if (type === "bulletListItem") {
      if (listTag !== "ul") {
        closeList();
        out.push("<ul>");
        listTag = "ul";
      }
      out.push(renderBlock(node));
      continue;
    }
    if (type === "numberedListItem") {
      if (listTag !== "ol") {
        closeList();
        out.push("<ol>");
        listTag = "ol";
      }
      out.push(renderBlock(node));
      continue;
    }
    closeList();
    const html = renderBlock(node);
    if (html) out.push(html);
  }
  closeList();
  return out.join("\n");
}

const PAGE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: #2b2a27; background: #fbfaf8; line-height: 1.85; padding: 48px 20px 80px; }
main { max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e8e6e1;
  border-radius: 12px; padding: 40px 44px 44px; box-shadow: 0 1px 4px rgba(40,36,30,.06); }
h1 { font-size: 26px; line-height: 1.4; margin-bottom: 6px; }
.meta { color: #8a8781; font-size: 13px; margin-bottom: 28px; }
h2 { font-size: 20px; margin: 30px 0 10px; }
h3 { font-size: 17px; margin: 26px 0 8px; }
p { margin: 10px 0; overflow-wrap: break-word; }
ul, ol { margin: 10px 0 10px 1.6em; }
li { margin: 4px 0; }
li.check { list-style: none; margin-left: -1.2em; }
blockquote { margin: 14px 0; padding: 8px 16px; border-left: 3px solid #d8d4cc;
  color: #5d5a54; background: #f6f4ef; border-radius: 0 6px 6px 0; }
pre { margin: 14px 0; padding: 14px 16px; background: #f2f0eb; border-radius: 8px;
  overflow-x: auto; font-size: 13px; line-height: 1.6; }
code { font-family: ui-monospace, Consolas, monospace; font-size: .92em; }
pre code { background: none; padding: 0; }
img { max-width: 100%; border-radius: 8px; margin: 10px 0; display: block; }
hr { border: none; border-top: 1px solid #e8e6e1; margin: 24px 0; }
a { color: #2f5d8a; }
.indent { margin-left: 1.4em; }
.caption { color: #8a8781; font-size: 13px; margin-top: -6px; text-align: center; }
footer { max-width: 720px; margin: 18px auto 0; color: #a5a29b; font-size: 12px; text-align: center; }
footer a { color: #8a8781; }
`;

export function renderShareHtml(
  page: { title?: unknown; updatedAt?: unknown; createdAt?: unknown },
  blocks: unknown[],
): string {
  const title = escapeHtml(typeof page.title === "string" && page.title.trim() ? page.title : "（无标题）");
  const ts = typeof page.updatedAt === "number" ? page.updatedAt : undefined;
  const updated = ts ? new Date(ts).toLocaleString("zh-CN", { hour12: false }) : "";
  const body = renderBlockList(Array.isArray(blocks) ? blocks : []);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${title} · 观复分享</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  <div class="meta">${updated ? "更新于 " + escapeHtml(updated) + " · " : ""}公开分享 · 只读</div>
  ${body || '<p class="meta">这篇页面还没有内容。</p>'}
</main>
<footer>由 <a href="https://www.guanfu.app" rel="noopener noreferrer">观复 · Lore</a> 生成 · 内容为作者分享的只读快照</footer>
</body>
</html>`;
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><meta name="robots" content="noindex, nofollow" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>链接已失效 · 观复分享</title><style>${PAGE_CSS}</style></head>
<body><main><h1>链接已失效</h1>
<div class="meta">这篇分享已被作者关闭，或链接不正确。</div>
<p>请向作者重新索取分享链接。</p></main>
<footer>由 <a href="https://www.guanfu.app" rel="noopener noreferrer">观复 · Lore</a> 生成</footer>
</body></html>`;

export function renderShareNotFound(): string {
  return NOT_FOUND_HTML;
}