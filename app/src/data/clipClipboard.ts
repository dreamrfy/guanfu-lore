/**
 * 剪贴板入口（W122 · 27 号 §3.3）：
 * 复制支持的文章链接后打开观复，首页顶部提示“检测到链接，收进收集箱？”。
 *
 * 只做纯逻辑：从剪贴板文本里找链接、按主机名过滤、记录“已忽略”。
 * 读剪贴板本身需要用户授权，权限不给就静默跳过，不打扰。
 */
import { clipLinkKey } from "./clipIngest";

const DISMISS_KEY = "guanfu.clipBannerDismissed";
const SUPPORTED_HOSTS = ["mp.weixin.qq.com", "b23.tv", "bilibili.com", "www.bilibili.com", "m.bilibili.com"];

function supportedHost(hostname: string): boolean {
  return SUPPORTED_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
}

/**
 * 从一段文本里提取第一个受支持的链接；去掉句末标点。
 * 不支持的主机返回 null（避免把普通网页/文件路径当成剪藏链接）。
 */
export function extractClipLink(text: string): string | null {
  const match = String(text ?? "").match(/https?:\/\/[^\s<>"'）)】]+/i);
  if (!match) return null;
  const raw = match[0].replace(/[)）\]】,，。；;!！?？"'”’]+$/u, "");
  try {
    return supportedHost(new URL(raw).hostname) ? raw : null;
  } catch {
    return null;
  }
}

function loadDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function isClipLinkDismissed(url: string): boolean {
  return loadDismissed().includes(clipLinkKey(url));
}

/** 用户点「忽略」后记住这条链接（按归一化 key，微信追踪参数变化也算同一条） */
export function dismissClipLink(url: string): void {
  const key = clipLinkKey(url);
  const list = loadDismissed().filter((x) => x !== key);
  list.push(key);
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* localStorage 不可用就算了，最多再提示一次 */
  }
}

/** 测试/调试用：清空忽略记录 */
export function clearDismissedClipLinks(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}