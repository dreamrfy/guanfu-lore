/**
 * 导航历史（W12 手册 §1 导航钮区）：后退/前进跨页签的全局访问历史 + 主页 + 刷新。
 *
 * 设计说明（观复自有实现，对齐 FlowUs「浏览器式」后退语义）：
 *  - 历史栈记录 activeTabId 的变化顺序；后退/前进在栈上移动，目标页若不在当前页签则重新打开。
 *  - back/forward 内部切页时打 navigating 标记，避免订阅器把程序化跳转再记一次历史。
 *  - 页签关闭时剪掉栈里的死条目（否则后退会翻到已关页）。
 *  - 主页【暂定】= 打开最近修改的第一页（桌面主页的 AI chat 形态在 W94 落位）。
 *  - 刷新 = 从 Dexie 强制重读正文 + bump tick，AppShell 用 tick 参与 PageEditor 的 key 触发重挂载；
 *    refreshTab(id) 是通用版（W14 页签右键菜单也用它刷新非激活页签）。
 */
import { create } from "zustand";
import { useStore } from "./store";
import { repo } from "./db";
import { resolveAssetRefs } from "./assets";

type NavState = {
  stack: string[];
  idx: number;
  /** 刷新计数：每次真刷新 +1，AppShell 用它重挂载编辑器 */
  tick: number;
  canBack: () => boolean;
  canForward: () => boolean;
  back: () => void;
  forward: () => void;
  goHome: () => void;
  refresh: () => Promise<void>;
  refreshTab: (pageId: string) => Promise<void>;
};

let navigating = false;

export const useNavHistory = create<NavState>((set, get) => ({
  stack: [],
  idx: -1,
  tick: 0,

  canBack: () => get().idx > 0,
  canForward: () => get().idx < get().stack.length - 1,

  back: () => {
    const { stack, idx } = get();
    const { tabs } = useStore.getState();
    let i = idx - 1;
    while (i >= 0 && !tabs.includes(stack[i])) i--;
    if (i < 0) return;
    navigating = true;
    set({ idx: i });
    useStore.getState().openTab(stack[i]);
    navigating = false;
  },

  forward: () => {
    const { stack, idx } = get();
    const { tabs } = useStore.getState();
    let i = idx + 1;
    while (i < stack.length && !tabs.includes(stack[i])) i++;
    if (i >= stack.length) return;
    navigating = true;
    set({ idx: i });
    useStore.getState().openTab(stack[i]);
    navigating = false;
  },

  goHome: () => {
    const { pages } = useStore.getState();
    if (!pages.length) return;
    const first = [...pages].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    useStore.getState().openTab(first.id);
  },

  refresh: () => {
    const id = useStore.getState().activeTabId;
    if (!id) return Promise.resolve();
    return get().refreshTab(id);
  },

  refreshTab: async (pageId) => {
    const raw = await repo.getDoc(pageId);
    const blocks = raw ? await resolveAssetRefs(raw) : [];
    useStore.setState((s) => ({ docs: { ...s.docs, [pageId]: blocks } }));
    if (useStore.getState().activeTabId === pageId) set((s) => ({ tick: s.tick + 1 }));
  },
}));


/* ---- 订阅主 store：记录历史 & 剪枝 ---- */

useStore.subscribe((s, prev) => {
  const nav = useNavHistory.getState();

  // 页签关闭 → 剪掉栈里的死条目，idx 落到当前页
  if (s.tabs.length < prev.tabs.length) {
    const alive = nav.stack.filter((id) => s.tabs.includes(id));
    const idx = s.activeTabId ? alive.indexOf(s.activeTabId) : -1;
    useNavHistory.setState({ stack: alive, idx });
    return;
  }

  // 程序化跳转（back/forward）不重复记录
  if (navigating) return;

  // 用户切换/打开页面 → 压栈（截断前进分支，和浏览器一致）
  if (s.activeTabId && s.activeTabId !== prev.activeTabId) {
    const cut = nav.stack.slice(0, nav.idx + 1);
    if (cut[cut.length - 1] === s.activeTabId) return;
    const stack = [...cut, s.activeTabId];
    useNavHistory.setState({ stack, idx: stack.length - 1 });
  }
});

