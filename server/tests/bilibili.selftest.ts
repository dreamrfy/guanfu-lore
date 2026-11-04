// B站抓取白名单自测（第二轮 N-03）
// 不联网：注入假 fetch，检查 resolveBvid / fetchBilibiliMeta 是否把白名单交给安全 HTTP 层。
// 用法: node tests/bilibili.selftest.ts
import { resolveBvid, fetchBilibiliMeta, type SafeGetLike } from "../src/fetch/bilibili.ts";
import type { SafeResponse } from "../src/fetch/http.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

interface Captured {
  url: string;
  headers: Record<string, string>;
  opts: {
    allowedHosts?: ReadonlySet<string>;
    allowedHostCheck?: (host: string) => boolean;
    tries?: number;
    maxRedirects?: number;
  };
}

function fakeFetch(finalUrl: string, body = ""): { fn: SafeGetLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fn = (async (url: string, headers: Record<string, string>, opts: Captured["opts"]) => {
    calls.push({ url, headers, opts });
    return {
      status: 200,
      headers: {},
      body: Buffer.from(body, "utf8"),
      finalUrl,
    } as SafeResponse;
  }) as unknown as SafeGetLike;
  return { fn, calls };
}

// ---- 短链：入口只允许 b23.tv ----
{
  const { fn, calls } = fakeFetch("https://www.bilibili.com/video/BV1xx411c7mD");
  const bvid = await resolveBvid("https://b23.tv/hnHeMSc", fn);
  check("能解析出 BV 号", bvid === "BV1xx411c7mD", bvid);
  check("给了重定向白名单检查函数", typeof calls[0]!.opts.allowedHostCheck === "function");
  const checkHost = calls[0]!.opts.allowedHostCheck!;
  check("允许留在 b23.tv", checkHost("b23.tv"));
  check("允许跳到 www.bilibili.com", checkHost("www.bilibili.com"));
  check("允许跳到 bilibili.com", checkHost("bilibili.com"));
  check("允许跳到 m.bilibili.com", checkHost("m.bilibili.com"));
  check("拒绝 example.com", !checkHost("example.com"));
  check("拒绝 evil.bilibili.com.evil.com", !checkHost("evil.bilibili.com.evil.com"));
}

{
  const { fn } = fakeFetch("https://www.bilibili.com/video/BV1xx411c7mD");
  for (const evil of ["https://example.com/abc", "https://b23.tv.evil.com/abc", "https://evilb23.tv/abc"]) {
    let rejected = false;
    try {
      await resolveBvid(evil, fn);
    } catch {
      rejected = true;
    }
    check("入口主机非 b23.tv 被拒绝：" + evil, rejected);
  }
}

{
  const { fn } = fakeFetch("https://www.bilibili.com/read/cv123456");
  let rejected = false;
  try {
    await resolveBvid("https://b23.tv/abc", fn);
  } catch {
    rejected = true;
  }
  check("最终地址没有 BV 号时抛错（不吞异常）", rejected);
}

// ---- API：只允许 api.bilibili.com ----
{
  const payload = JSON.stringify({
    code: 0,
    data: { title: "标题", desc: "简介", owner: { name: "UP" }, duration: 60, pic: "http://i1.hdslb.com/x.jpg" },
  });
  const { fn, calls } = fakeFetch("https://api.bilibili.com/x/web-interface/view", payload);
  const meta = await fetchBilibiliMeta("BV1xx411c7mD", fn);
  check("元数据解析正常", meta.title === "标题" && meta.owner === "UP", JSON.stringify(meta));
  const allowed = calls[0]!.opts.allowedHosts;
  check("API 调用使用主机白名单", !!allowed);
  check("允许 api.bilibili.com", allowed!.has("api.bilibili.com"));
  check("不允许 example.com", !allowed!.has("example.com"));
  check("不允许 www.bilibili.com（API 只走 api 域）", !allowed!.has("www.bilibili.com"));
  check("带 Referer", calls[0]!.headers.Referer === "https://www.bilibili.com/", calls[0]!.headers.Referer);
}

// ---- API 返回错误码时要抛出 ----
{
  const { fn } = fakeFetch("https://api.bilibili.com/x/web-interface/view", JSON.stringify({ code: -404, message: "啥都木有" }));
  let rejected = false;
  try {
    await fetchBilibiliMeta("BV1xx411c7mD", fn);
  } catch (e) {
    rejected = /-404/.test(String((e as Error).message));
  }
  check("API code!=0 抛错并带错误码", rejected);
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
