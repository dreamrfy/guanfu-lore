/**
 * H04 端到端自验用的本地服务 mock（扩展划线 → 客户端看到高亮）。
 *
 * 在 I03 mock（/api/clips 契约）基础上补上 H02 的划线契约：
 *   GET  /api/clips                剪藏清单（1 条 complete）
 *   GET  /api/clips/:id            详情（正文 + assets + 快照）
 *   GET  /api/asset?key=...        图片字节
 *   GET  /article.html             被划线的"活页"（正文与剪藏一致）
 *   POST /api/highlights           划线上报（H02 契约：{pageUrl,title,quote} → {ok,id,created}）
 *   GET  /api/highlights?pageUrl=  划线清单（H02 契约：{ok,items}）
 *
 * 所有请求追加写 mock-log.txt（与脚本同目录）作证据。
 * 用法：node mock-clip-server.mjs   （监听 127.0.0.1:8787，客户端与扩展的默认地址）
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOG_FILE = path.join(import.meta.dirname, "mock-log.txt");

const CLIP_ID = "mp_h04a1b2c3d4e5"; // 匹配服务端 CLIP_ID_RE：/^[a-z]+_[0-9a-f]{8,16}$/
const ASSET_KEY = "assets/h04-img-001.png";
const PAGE_URL = "http://127.0.0.1:8787/article.html";

const PARA1 = "这是 H04 端到端自验的正文第一段：验证扩展划线会按引文定位回客户端正文。";
const PARA2 = "第二段：验证多条划线共存时客户端逐一渲染、互不覆盖，服务器数据即时可读。";

const INDEX = {
  ok: true,
  clips: [
    {
      id: CLIP_ID,
      title: "H04 自验：扩展划线 → 客户端高亮全链",
      source: "wechat_mp",
      savedAt: "2026-11-15T07:05:00.000Z",
      status: "complete",
    },
  ],
};

const DETAIL = {
  ok: true,
  clip: {
    id: CLIP_ID,
    title: "H04 自验：扩展划线 → 客户端高亮全链",
    source: "wechat_mp",
    sourceUrl: PAGE_URL,
    author: "看门狗",
    account: "观复测试号",
    publishedAt: null,
    savedAt: "2026-11-15T07:05:00.000Z",
    text: PARA1 + "\n\n" + PARA2,
    status: "complete",
    note: "",
  },
  assets: [{ key: ASSET_KEY, url: "http://127.0.0.1:8787/ignored" }],
  snapshotHtml:
    '<html><body><h1>H04 原文快照</h1><p><img src="h04-img-001.png"></p><p>' +
    PARA1 +
    "</p><p>" +
    PARA2 +
    "</p></body></html>",
};

const ARTICLE_HTML =
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>H04 自验文章</title></head><body>' +
  "<h1>H04 自验文章</h1>" +
  "<p>" + PARA1 + "</p>" +
  "<p>" + PARA2 + "</p>" +
  "</body></html>";

// ---- 128x128 棋盘 PNG（零依赖，与 S04/I03 同一套生成逻辑）----
function makePng() {
  const W = 128, H = 128;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      const checker = ((x >> 4) + (y >> 4)) % 2 === 0;
      raw[o++] = checker ? 200 : 30;
      raw[o++] = checker ? 40 : 120;
      raw[o++] = checker ? 60 : 200;
    }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 0; crcTable[n] = c >>> 0; }
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] >>> 0; return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// 最小 zlib 定长 Huffman（stored blocks）——和 I03 一样不引依赖
function zlibSync(data) {
  const blocks = [];
  for (let i = 0; i < data.length; i += 65535) {
    const slice = data.subarray(i, Math.min(i + 65535, data.length));
    const head = Buffer.alloc(5);
    head[0] = i + 65535 >= data.length ? 1 : 0;
    head.writeUInt16LE(slice.length, 1);
    head.writeUInt16LE(0xffff - slice.length, 3);
    blocks.push(head, slice);
  }
  return Buffer.concat([Buffer.from([0x78, 0x9c]), ...blocks, Buffer.alloc(4)]);
}

// ---- 划线内存库（H02 契约形态）----
const highlights = [];
const sha16 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

function logLine(text) {
  const line = `[${new Date().toISOString()}] ${text}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 1024 * 1024) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

fs.writeFileSync(LOG_FILE, "");
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:8787");
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify(body));
  };
  logLine(`${req.method} ${url.pathname}${url.search}`);

  if (url.pathname === "/api/clips") return json(200, INDEX);
  if (url.pathname.startsWith("/api/clips/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/clips/".length));
    return id === CLIP_ID ? json(200, DETAIL) : json(404, { ok: false, error: "服务器上没有这条剪藏" });
  }
  if (url.pathname === "/api/asset") {
    const key = url.searchParams.get("key") ?? "";
    if (key !== ASSET_KEY) return json(404, { ok: false, error: "no such asset" });
    res.writeHead(200, { "Content-Type": "image/png", ...CORS });
    res.end(makePng());
    return;
  }
  if (url.pathname === "/article.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...CORS });
    res.end(ARTICLE_HTML);
    return;
  }
  if (url.pathname === "/api/highlights" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(400, { ok: false, error: "bad json" }); }
    if (!body?.pageUrl || !body?.quote?.exact) return json(400, { ok: false, error: "缺 pageUrl/quote.exact" });
    const id = sha16(body.pageUrl + "\u0000" + body.quote.exact + "\u0000" + (body.quote.prefix ?? "") + "\u0000" + (body.quote.suffix ?? ""));
    const existed = highlights.some((h) => h.id === id);
    if (!existed) {
      highlights.push({
        id,
        pageUrl: body.pageUrl,
        title: String(body.title ?? "").slice(0, 300),
        quote: { exact: body.quote.exact, prefix: body.quote.prefix ?? "", suffix: body.quote.suffix ?? "" },
        createdAt: Date.now(),
      });
    }
    logLine(`    -> 划线入库 id=${id} created=${!existed} exact=${JSON.stringify(body.quote.exact)}`);
    return json(200, { ok: true, id, created: !existed });
  }
  if (url.pathname === "/api/highlights" && req.method === "GET") {
    const pageUrl = url.searchParams.get("pageUrl") ?? "";
    return json(200, { ok: true, pageUrl, items: highlights.filter((h) => h.pageUrl === pageUrl) });
  }
  json(404, { ok: false, error: "not found" });
});

server.listen(8787, "127.0.0.1", () => console.log("[mock] H04 服务已起：http://127.0.0.1:8787"));
