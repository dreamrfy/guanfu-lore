// 配置读取：凭证一律从【仓库外】文件读，路径由环境变量传入。
// 本文件与仓库内任何文件都不得出现可用凭据字面量（项目安全约定）。
import fs from "node:fs";
import path from "node:path";

const BASE_DIR = path.resolve(import.meta.dirname ?? ".", ".."); // 本文件在 src/ 下，服务端根是上一级

/** 读取环境变量指定的相对路径；显式拒绝 ".."、"\0" 与绝对路径越界 */
function resolveLocalPath(envName: string, fallbackName: string): string {
  const raw = process.env[envName] || fallbackName;
  if (typeof raw !== "string" || raw.includes("..") || raw.includes("\0") || path.isAbsolute(raw)) {
    throw new Error(`refusing unsafe path in ${envName}`);
  }
  const abs = path.resolve(BASE_DIR, raw);
  if (abs !== BASE_DIR && !abs.startsWith(BASE_DIR + path.sep)) {
    throw new Error(`path escapes base dir: ${envName}`);
  }
  return abs;
}

export const DATA_DIR = resolveLocalPath("KF_DATA_DIR", "data");
export const ASSETS_DIR = resolveLocalPath("KF_ASSETS_DIR", "data/assets");
export const OUT_DIR = resolveLocalPath("KF_OUT_DIR", "out");

/** 微信客服凭证（仓库外 JSON 文件的字段名） */
export interface KfSecrets {
  corpId: string;
  agentId: string;
  appSecret: string;
  token: string;
  encodingAESKey: string;
}

/**
 * 计算微信客服凭证文件的路径。
 * 凭证文件必须在仓库外（项目约定：路径由环境变量 KF_SECRETS_FILE 传入）。
 * 这里只做路径合法性校验：拒绝 ".."、"\0"；读取文件在 loadSecrets() 中进行。
 */
function secretsFilePath(): string {
  const raw = process.env.KF_SECRETS_FILE;
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("..") || raw.includes("\0")) {
    throw new Error("KF_SECRETS_FILE 未设置或非法（凭证文件必须在仓库外）");
  }
  return path.resolve(raw);
}

/** 读微信客服凭证（路径由 secretsFilePath() 校验后给出） */
export function loadSecrets(): KfSecrets {
  const file = secretsFilePath();
  if (!fs.statSync(file).isFile()) throw new Error("凭证文件不存在");
  return JSON.parse(fs.readFileSync(file, "utf8")) as KfSecrets;
}
