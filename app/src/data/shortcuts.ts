/**
 * 全局快捷键（W84 · 手册 §12 快捷键清单）
 *
 * 为什么单独一个文件：项目原本没有全局快捷键注册表，各处零散地 addEventListener("keydown")。
 * 观复的快捷键集合会随模块增加（搜索、侧栏折叠、块 AI…），集中一处才能对账。
 *
 * 手册 §12 清单：
 *   Ctrl+P   全局搜索（快速查找）      ✅ 已实现
 *   Ctrl+\   侧栏折叠/展开              ✅ 已实现
 *   Ctrl+J   块 AI 助手                 📖 推测级（块右键菜单标注）
 *   Ctrl+T   新建页签                   ⚠️ 标题提示 ⌘T，Windows 键未实测
 *   Enter    菜单选中/新建记录           ✅ 浏览器原生
 *   Escape   关闭浮层                   ✅ 各浮层各自处理
 *
 * 只在「表单输入框（INPUT/TEXTAREA）」里让键：编辑器正文写作中按 Ctrl+P 找页面是主场景，必须放行；
 * 输入框里按 Ctrl+P 不打开搜索面板（留给浏览器打印），复制粘贴等系统键也一律放行。
 */

type Handler = (e: KeyboardEvent) => void;

const handlers = new Map<string, Handler>();

/** 注册一个全局快捷键；返回注销函数 */
export function registerShortcut(combo: string, handler: Handler): () => void {
  handlers.set(combo, handler);
  return () => {
    if (handlers.get(combo) === handler) handlers.delete(combo);
  };
}

/** 把键盘事件规范成 "Ctrl+Shift+P" 这样的组合键字符串 */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

/** 是否正在文本编辑中（输入框 / textarea / contenteditable） */
export function isEditingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * 全局快捷键要避让的场合：表单输入框（INPUT / TEXTAREA）。
 * 编辑器正文（contenteditable）不算——写作中按 Ctrl+P 找页面是主场景，必须放行。
 */
function isFormInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA";
}

let installed = false;

/** 装一次全局监听（AppShell 里调一次即可） */
export function installGlobalShortcuts() {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const handler = handlers.get(comboOf(e));
    if (!handler) return;
    // 文本编辑中不抢键（Ctrl+A/C/V/X 等照常交给浏览器；块级三键走 PageEditor 自己的监听，不经此处）
    if (isFormInput(e.target)) return;
    handler(e);
  });
}
