// 云函数生产装配：R2 资源 + CloudBase 数据库
//
// 与 wire.ts（本地装配）同构；本地装配保持不动，云上外部边界只出现在本文件。
// 复用同一套安全 HTTP 层（SSRF/上限/重定向）与 B站模块——抓取逻辑不因上云而改变。
import { fetchWechatArticle } from "./wire.ts";
import { downloadImage } from "../fetch/images.ts";
import { fetchBilibiliFromShortLink } from "../fetch/bilibili.ts";
import { loadR2Config, makeR2AssetWriter } from "../store/r2Store.ts";
import { CloudbaseStore, createClipDbAdapter, type ClipDbAdapter } from "../store/cloudbaseStore.ts";
import type { PipelineDeps } from "./run.ts";

export interface CloudDepsBundle {
  deps: PipelineDeps;
  store: CloudbaseStore;
  adapter: ClipDbAdapter;
}

/** 云上依赖装配：数据库 + R2 凭证从环境变量读（云函数控制台配置），读不到直接报错退出 */
export async function createCloudDeps(): Promise<CloudDepsBundle> {
  const adapter = await createClipDbAdapter();
  const store = new CloudbaseStore(adapter);
  const r2 = loadR2Config();
  const r2Writer = makeR2AssetWriter(r2);
  const deps: PipelineDeps = {
    fetchArticle: fetchWechatArticle,
    downloadImage: (url) => downloadImage(url, { writeAsset: r2Writer, provider: "r2" }),
    fetchBilibili: fetchBilibiliFromShortLink,
    saveClip: (clip) => store.saveClip(clip),
    existsClip: (id) => store.existsClip(id),
    writeAssetFile: r2Writer,
  };
  return { deps, store, adapter };
}
