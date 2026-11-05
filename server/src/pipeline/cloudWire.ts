// 云函数生产装配（路线 A）：R2 资源 + R2 记录存储
//
// 与 wire.ts（本地装配）同构；本地装配保持不动，云上外部边界只出现在本文件。
// 2026-11-05 拍板：用户 CloudBase 环境是 PG 模式（无文档型数据库），
// 记录不落 CloudBase 数据库，改存 R2 JSON 文件（store/r2ClipStore）——
// 云函数只依赖微信凭证 + R2 凭证，环境数据库类型不再影响部署。
// 复用同一套安全 HTTP 层（SSRF/上限/重定向）与 B站模块——抓取逻辑不因上云而改变。
import { fetchWechatArticle } from "./wire.ts";
import { downloadImage } from "../fetch/images.ts";
import { fetchBilibiliFromShortLink } from "../fetch/bilibili.ts";
import { loadR2Config, makeR2AssetWriter } from "../store/r2Store.ts";
import { R2ClipStore } from "../store/r2ClipStore.ts";
import type { PipelineDeps } from "./run.ts";

export interface CloudDepsBundle {
  deps: PipelineDeps;
  store: R2ClipStore;
}

/** 云上依赖装配：R2 凭证从环境变量读（云函数控制台配置），读不到直接报错退出 */
export async function createCloudDeps(): Promise<CloudDepsBundle> {
  const cfg = loadR2Config();
  const store = new R2ClipStore(cfg);
  const r2Writer = makeR2AssetWriter(cfg);
  const deps: PipelineDeps = {
    fetchArticle: fetchWechatArticle,
    downloadImage: (url) => downloadImage(url, { writeAsset: r2Writer, provider: "r2" }),
    fetchBilibili: fetchBilibiliFromShortLink,
    saveClip: (clip) => store.saveClip(clip),
    existsClip: (id) => store.existsClip(id),
    writeAssetFile: r2Writer,
  };
  return { deps, store };
}
