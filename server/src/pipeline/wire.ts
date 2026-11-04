// 生产环境依赖装配：把安全 HTTP 层 / 图片下载 / SQLite 存储接进编排器
//
// 单独成文件的目的：pipeline/run.ts 保持纯逻辑（可在测试里全 mock），
// 真实网络与数据库只在这里出现，便于审计时一眼看清“外部边界”。
import { safeGet, DEFAULT_MAX_BODY_BYTES } from "../fetch/http.ts";
import { ALLOWED_ARTICLE_HOSTS, parseArticleHtml } from "../fetch/article.ts";
import { downloadImage } from "../fetch/images.ts";
import { existsClip, saveClip, writeAssetFile } from "../store/localStore.ts";
import type { PipelineDeps } from "./run.ts";

/** 公众号抓取：host 白名单 + 响应上限 + 只重试网络错误 */
export async function fetchWechatArticle(url: string) {
  const res = await safeGet(
    url,
    { Referer: "https://mp.weixin.qq.com/" },
    { tries: 2, maxBytes: DEFAULT_MAX_BODY_BYTES, allowedHosts: ALLOWED_ARTICLE_HOSTS }
  );
  return parseArticleHtml(res.body.toString("utf8"), url);
}

export function createLocalDeps(): PipelineDeps {
  return {
    fetchArticle: fetchWechatArticle,
    downloadImage,
    saveClip,
    existsClip,
    writeAssetFile,
  };
}
