/**
 * 快速访问（收藏）集合（W23 建立、W46 抽出为共享 store）
 *
 * 侧栏「快速访问」分组与页面 ⋯ 菜单的「添加到快速访问」共用同一份状态，
 * 这样菜单里一勾，侧栏分组立即出现/消失（不再各存一份 localStorage）。
 */
import { create } from "zustand";

/** 与 W23 侧栏使用的 localStorage 键保持一致，避免旧数据丢失 */
const KEY = "guanfu.starred";

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

type StarredState = {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
};

export const useStarred = create<StarredState>((set, get) => ({
  ids: load(),
  has: (id) => get().ids.includes(id),
  toggle: (id) => {
    const next = get().ids.includes(id) ? get().ids.filter((x) => x !== id) : [...get().ids, id];
    set({ ids: next });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
  },
  remove: (id) => {
    const next = get().ids.filter((x) => x !== id);
    set({ ids: next });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
  },
}));