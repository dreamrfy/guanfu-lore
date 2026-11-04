// SSRF 地址判定自测（P0-01）
// 覆盖：IPv4 私有/环回/链路本地、IPv6 链路本地（fe90::1）、文档地址（2001:db8::1）、
//       IPv4-mapped、非全球单播（ULA/组播），以及正常公网地址不被误杀。
// 用法: node tests/ssrf.selftest.ts
import { isBlockedAddress, parseTarget, FetchError } from "../src/fetch/http.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const mustBlock: Array<[string, number | undefined]> = [
  ["127.0.0.1", 4],
  ["127.1.2.3", 4],
  ["10.0.0.1", 4],
  ["172.16.0.1", 4],
  ["172.31.255.255", 4],
  ["192.168.1.1", 4],
  ["169.254.169.254", 4],
  ["100.64.0.1", 4],
  ["0.0.0.0", 4],
  ["198.18.0.1", 4],
  ["224.0.0.1", 4],
  ["255.255.255.255", 4],
  ["::1", 6],
  ["::", 6],
  ["fe80::1", 6],
  ["fe90::1", 6], // 链路本地 fe80::/10 内，旧实现会放行
  ["febf::1", 6],
  ["fc00::1", 6],
  ["fd12:3456::1", 6],
  ["2001:db8::1", 6], // 文档地址
  ["2001::1", 6], // Teredo
  ["2002::1", 6], // 6to4
  ["ff02::1", 6], // 组播
  ["64:ff9b::7f00:1", 6], // NAT64（内嵌 127.0.0.1）
  ["::ffff:127.0.0.1", 6], // IPv4-mapped
  ["::ffff:7f00:1", 6], // IPv4-mapped（十六进制写法）
  ["::ffff:10.0.0.1", 6],
  ["::ffff:169.254.169.254", 6],
  // 第二轮审计 N-04：IANA special-use 补齐
  ["2001:1::1", 6], // PCP anycast（2001::/23 内）
  ["2001:3::1", 6], // AMT
  ["2001:4:112::1", 6], // AS112
  ["2001:20::1", 6], // ORCHIDv2
  ["2001:30::1", 6], // Drone Remote ID
  ["2620:4f:8000::1", 6], // AS112 direct delegation（在 2000::/3 内）
  ["192.31.196.1", 4], // AS112
  ["192.52.193.1", 4], // AMT
  ["192.175.48.1", 4], // AS112 direct delegation
  ["not-an-ip", undefined],
  ["", undefined],
];

for (const [ip, family] of mustBlock) {
  check("拒绝 " + (ip || "(空串)"), isBlockedAddress(ip, family));
}

const mustAllow: Array<[string, number]> = [
  ["1.1.1.1", 4],
  ["8.8.8.8", 4],
  ["223.5.5.5", 4],
  ["101.32.0.1", 4],
  ["2001:4860:4860::8888", 6], // Google DNS，全球单播
  ["2400:3200::1", 6], // 阿里 DNS
  ["::ffff:8.8.8.8", 6], // 映射到公网 IPv4 应放行
];
for (const [ip, family] of mustAllow) {
  check("放行 " + ip, !isBlockedAddress(ip, family));
}

// parseTarget：直连内网字面量必须在解析阶段就被拒绝
const badUrls = [
  "http://127.0.0.1/",
  "http://[::1]/",
  "http://[fe90::1]/",
  "http://[2001:db8::1]/",
  "http://[2001:20::1]/",
  "http://192.31.196.1/",
  "http://[::ffff:127.0.0.1]/",
  "http://localhost/",
  "http://foo.localhost/",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.1:8080/",
  "ftp://example.com/",
  "file:///etc/passwd",
  "http://user:pass@example.com/",
  "not-a-url",
];
for (const url of badUrls) {
  let blocked = false;
  try {
    parseTarget(url);
  } catch (e) {
    blocked = e instanceof FetchError;
  }
  check("parseTarget 拒绝 " + url, blocked);
}

// 正常地址必须能通过解析
for (const url of ["https://mp.weixin.qq.com/s?__biz=x", "https://example.com/a/b?c=1"]) {
  let ok = true;
  try {
    parseTarget(url);
  } catch {
    ok = false;
  }
  check("parseTarget 放行 " + url, ok);
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
