/**
 * W103 · 账号区（观复自有【暂定】）
 *
 * 单机自托管没有云账号体系（11 号 §5 槽位简化：邮箱/手机/认证/设备管理不做），
 * 「账号」收敛为本地身份三件套，全部真存 Dexie meta（随 meta 表进备份）：
 *  - 昵称（accountNick，W101 已落）→ 侧栏工作区行 / 空间切换菜单 / 账号设置三处共用
 *  - 头像色（accountAvatarColor）→ 字母头像底色，取观复令牌色系，不留十六进制
 *  - 退出登录（单机语义【暂定】）→ 清同步凭证（服务端地址/Token）后刷新，不动本机数据
 */

import { useSyncExternalStore } from "react";
import { repo } from "./db";
import { loadClipServerUrl, saveClipServerUrl, loadClipToken, saveClipToken } from "./clipApi";

export const NICK_KEY = "accountNick";
export const AVATAR_COLOR_KEY = "accountAvatarColor";

/** 头像底色候选——全部引用 tokens.css 既有令牌（红线 8：不许十六进制字面量进 UI） */
export const AVATAR_COLORS = [
  "--gf-primary",
  "--gf-success",
  "--gf-warning",
  "--gf-danger",
  "--gf-info",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

export interface LocalAccount {
  nick: string;
  avatarColor: AvatarColor;
}

/** 头像字母：昵称首字符（去空白），无昵称回退「观」 */
export function avatarLetter(nick: string): string {
  const c = nick.trim()[0];
  return c || "观";
}

let snapshot: LocalAccount = { nick: "", avatarColor: AVATAR_COLORS[0] };
const listeners = new Set<() => void>();
let loaded = false;

function emit() {
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

/** 首次订阅前懒加载，避免模块顶层碰 indexedDB */
function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  void (async () => {
    const nick = await repo.getMeta<string>(NICK_KEY);
    const color = await repo.getMeta<AvatarColor>(AVATAR_COLOR_KEY);
    snapshot = {
      nick: typeof nick === "string" ? nick : "",
      avatarColor:
        typeof color === "string" && (AVATAR_COLORS as readonly string[]).includes(color)
          ? color
          : AVATAR_COLORS[0],
    };
    emit();
  })();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  ensureLoaded();
  return () => listeners.delete(l);
}

export function useLocalAccount(): LocalAccount {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export async function saveNick(nick: string): Promise<void> {
  const v = nick.trim();
  await repo.setMeta(NICK_KEY, v);
  snapshot = { ...snapshot, nick: v };
  emit();
}

export async function saveAvatarColor(color: AvatarColor): Promise<void> {
  await repo.setMeta(AVATAR_COLOR_KEY, color);
  snapshot = { ...snapshot, avatarColor: color };
  emit();
}

/** 退出登录（单机语义【暂定】）：清同步凭证，本机数据不动；返回是否确有凭证可清 */
export async function signOutLocal(): Promise<boolean> {
  const hadServer = !!(await loadClipServerUrl());
  const hadToken = !!(await loadClipToken());
  if (hadServer) await saveClipServerUrl("");
  if (hadToken) await saveClipToken("");
  return hadServer || hadToken;
}
