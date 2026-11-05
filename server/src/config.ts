// 配置读取：凭证一律从【仓库外】文件读，路径由环境变量传入。
// 本文件与仓库内任何文件都不得出现可用凭据字面量（项目安全约定）。
import fs from "node:fs";
import path from "node:path";

const BASE_DIR = path.resolve(import.meta.dirname ?? ".", ".."); // 本文件在 src/ 下，服务端根是上一级
/** 仓库根（服务端目录的上一级）：凭证文件必须落在它之外 */
const REPO_ROOT = path.dirname(BASE_DIR);

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
export const SAMPLES_DIR = resolveLocalPath("KF_SAMPLES_DIR", "samples");

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
 * 凭证文件必须在**仓库外**（项目约定：路径由环境变量 KF_SECRETS_FILE 传入）。
 * 校验：拒绝空值、".."、NUL；解析后（含真实路径）不得落在仓库目录内（N-10）。
 */
function secretsFilePath(): string {
  const raw = process.env.KF_SECRETS_FILE;
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("..") || raw.includes("\0")) {
    throw new Error("KF_SECRETS_FILE 未设置或非法（凭证文件必须在仓库外）");
  }
  const abs = path.resolve(raw);
  const insideRepo = (p: string): boolean => p === REPO_ROOT || p.startsWith(REPO_ROOT + path.sep);
  if (insideRepo(abs)) {
    throw new Error("KF_SECRETS_FILE 指向仓库内路径，已拒绝（凭证文件必须在仓库外）");
  }
  // 文件已存在时再校验真实路径，防符号链接指回仓库
  if (fs.existsSync(abs)) {
    let real: string;
    try {
      real = fs.realpathSync(abs);
    } catch {
      throw new Error("KF_SECRETS_FILE 无法解析真实路径");
    }
    if (insideRepo(real)) {
      throw new Error("KF_SECRETS_FILE 的真实路径位于仓库内，已拒绝");
    }
  }
  return abs;
}

/** 云函数等无文件系统环境：凭证五项与各环境变量的对应关系（值由部署时注入，不进仓库） */
const SECRET_ENV_KEYS: ReadonlyArray<[keyof KfSecrets, string]> = [
  ["corpId", "KF_CORP_ID"],
  ["agentId", "KF_AGENT_ID"],
  ["appSecret", "KF_APP_SECRET"],
  ["token", "KF_TOKEN"],
  ["encodingAESKey", "KF_ENCODING_AES_KEY"],
];

/** 云上直读：五项凭证全部从环境变量给值；缺任何一项报错并点名缺哪个 */
export function loadSecretsFromEnv(): KfSecrets {
  const missing = SECRET_ENV_KEYS.filter(([, env]) => (process.env[env] ?? "") === "").map(([, env]) => env);
  if (missing.length > 0) throw new Error("凭证环境变量未设置：" + missing.join(", "));
  const out = {} as KfSecrets;
  for (const [key, env] of SECRET_ENV_KEYS) out[key] = process.env[env]!;
  return out;
}

/**
 * 读微信客服凭证（分派）：
 * 云上——环境变量直接给值（五项任一存在即走此分支，缺项报错点名）；
 * 本地——回退仓库外文件，路径由 KF_SECRETS_FILE 传入。
 */
export function loadSecrets(): KfSecrets {
  const fromEnv = SECRET_ENV_KEYS.some(([, env]) => (process.env[env] ?? "") !== "");
  if (fromEnv) return loadSecretsFromEnv();
  return loadSecretsFromFile();
}

/** 本地读法（原实现）：路径由 secretsFilePath() 校验后给出 */
function loadSecretsFromFile(): KfSecrets {
  const file = secretsFilePath();
  if (!fs.statSync(file).isFile()) throw new Error("凭证文件不存在");
  return JSON.parse(fs.readFileSync(file, "utf8")) as KfSecrets;
}
