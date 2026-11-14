/**
 * I03 端到端自验用的本地剪藏服务 mock。
 *
 * 按 server/src/cloud/clipApi.ts 的真实 JSON 契约实现三个只读接口：
 *   GET /api/clips            清单
 *   GET /api/clips/:id        详情（正文 + assets + 快照）
 *   GET /api/asset?key=...    图片字节（客户端走服务器代理，不直连）
 *
 * 真服务的 /api/clips 需要 R2（取件码签名），本机自验没有 R2 凭证，
 * 所以用同一契约的 mock——客户端代码零改动，走真 HTTP、真浏览器、真 IndexedDB。
 *
 * 用法：node mock-clip-server.mjs   （监听 127.0.0.1:8787，即客户端默认地址）
 */
import http from "node:http";
import zlib from "node:zlib";
import fs from "node:fs";

const CLIP_ID = "mp_i03a1b2c3d4e5"; // 必须匹配服务端 CLIP_ID_RE：/^[a-z]+_[0-9a-f]{8,16}$/
const ASSET_KEY = "assets/i03-img-001.png";

const SNAPSHOT_FILE = "i03-img-001.png"; // 客户端按 key 的文件名部分改写快照里的 src

// ---- 128x128 棋盘 PNG（与 S04 的 make-image.mjs 同一套零依赖生成逻辑）----
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
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PNG = makePng();
fs.writeFileSync(new URL("./i03-img-001.png", import.meta.url), PNG);

const INDEX = {
  ok: true,
  clips: [
    {
      id: CLIP_ID,
      title: "I03 自验：剪藏自动入库的未读流转",
      source: "wechat_mp",
      savedAt: "2026-11-15T13:50:00.000Z",
      status: "complete",
    },
  ],
};

const DETAIL = {
  ok: true,
  clip: {
    id: CLIP_ID,
    title: "I03 自验：剪藏自动入库的未读流转",
    source: "wechat_mp",
    sourceUrl: "https://mp.weixin.qq.com/s/i03demo",
    author: "看门狗",
    account: "观复测试号",
    publishedAt: null,
    savedAt: "2026-11-15T13:50:00.000Z",
    text: "这是 I03 端到端自验的正文第一段：验证服务器剪藏箱的内容会自动进本地库。\n\n第二段：验证未读标记、点开标已读、侧栏未读角标。",
    status: "complete",
    note: "",
  },
  assets: [{ key: ASSET_KEY, url: "http://127.0.0.1:8787/ignored" }],
  snapshotHtml:
    '<html><body><h1>I03 原文快照</h1><p><img src="i03-img-001.png"></p><p>快照正文段落，图片引用会在导入时改写成 asset://。</p></body></html>',
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:8787");
  const log = `[mock] ${req.method} ${url.pathname}${url.search}`;
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (url.pathname === "/api/clips") {
    console.log(log);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify(INDEX));
    return;
  }
  if (url.pathname.startsWith("/api/clips/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/clips/".length));
    console.log(log);
    if (id !== CLIP_ID) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", ...CORS });
      res.end(JSON.stringify({ ok: false, error: "服务器上没有这条剪藏" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify(DETAIL));
    return;
  }
  if (url.pathname === "/api/asset" && url.searchParams.get("key") === ASSET_KEY) {
    console.log(log);
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": PNG.length, ...CORS });
    res.end(PNG);
    return;
  }
  console.log(log, "→ 404");
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.listen(8787, "127.0.0.1", () => {
  console.log("[mock] 剪藏服务就绪：http://127.0.0.1:8787（1 条 complete 剪藏 + 1 张 128x128 PNG + 快照）");
  console.log("[mock] 图片已存证据目录：i03-img-001.png", PNG.length, "bytes");
});
