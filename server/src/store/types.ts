// 数据模型定义（阶段一 · 本地原型）
//
// 设计约定（依据 docs/P0-微信剪藏链路验证与云方案选型记录-v1.md §4 / §8.5）：
// - G1【已确认】：图片/附件等资源在数据库里【只存编号 + 存储来源】，绝不存完整 URL；
//   真实地址由存储层按 assetId 生成。将来更换存储只改配置，不动历史记录。
// - 幂等键：同一篇文章用规范化源 URL 的哈希作为 id，重复转发不重复入库（需求 CLIP-03）。

/** 资源存储来源。迁移存储 = 只改这个字段，记录里的 assetId 不变。 */
export type Provider = "local" | "r2" | "cloudbase";

/** 一个已落盘的资源（图片/导出文件等）。只存编号与来源，不存完整地址。 */
export interface AssetRef {
  /** 稳定编号：由源地址规范化哈希派生，如 "a1b2c3d4e5" */
  assetId: string;
  /** 存储来源 */
  provider: Provider;
  /** 扩展名（不含点），存储层用它拼回真实文件名 */
  ext: string;
  /** 原始尺寸（可选，便于排版） */
  width?: number;
  height?: number;
}

export type ClipStatus = "pending" | "partial" | "complete" | "failed";

export type FailReason =
  | "network_timeout" // 网络超时/5xx/429（唯一可重试的类别）
  | "blocked_by_platform" // 被平台风控/拦截（如需微信客户端环境）
  | "content_missing" // 找不到正文容器 / 正文为空
  | "images_failed" // 图片下载失败
  | "unsupported_type" // 不支持的来源/类型/非法地址
  | "blocked_address" // SSRF 防护拒绝（环回/私有/保留地址、主机不在白名单）
  | "response_too_large" // 响应体超过上限
  | "internal_error"; // 数据库/JSON/未知程序错误（默认不重试）

export type SourcePlatform = "wechat_mp" | "xiaohongshu" | "bilibili" | "douyin" | "unknown";

/** 一条剪藏记录（需求里“文章快照”的目录部分；正文文字也存这里） */
export interface Clip {
  /** 幂等键：规范化源 URL 的 SHA-256 前 16 位十六进制（64 位熵） */
  id: string;
  source: SourcePlatform;
  /** 原始链接（一字不删——来自消息/快照的原始分享地址，抓取与核对都需要） */
  sourceUrl: string;
  /** 规范化后的抓取地址（公众号：常量 origin + 白名单参数；幂等 id 按它计算）
   *  与 sourceUrl 分开保存：既保留原始参数，又保证抓取目标可控。 */
  canonicalUrl?: string | null;
  title: string;
  author: string;
  /** 公众号名称（来自 data-nickname） */
  account: string;
  publishedAt: string | null;
  /** 入库时间（ISO） */
  savedAt: string;
  /** 正文文字（不含图片） */
  text: string;
  /** G1：资源只存编号，不存完整 URL */
  assets: AssetRef[];
  status: ClipStatus;
  failReason: FailReason | null;
  /** 处理备注（如：该平台正文需浏览器渲染，属阶段二） */
  note?: string;
}

/** 归一化后的“待剪藏条目”（由消息解析层产出，喂给 pipeline） */
export interface NormalizedItem {
  source: SourcePlatform;
  sourceUrl: string;
  title: string;
  desc: string;
  coverUrl: string;
  /** 作者（能从转发文案/卡片描述里抽到时填，如抖音「看看【咖喱的图文作品】」→ 咖喱） */
  author?: string;
  /** 话题标签（不含 #，如 小李子；能抽到时填） */
  tags?: string[];
  /** 该平台本次能抓到什么：full=正文+图；metadata-only=仅标题/描述/封面 */
  capability: "full" | "metadata-only";
  note?: string;
}
