/**
 * 全项目文案字典 · 唯一来源是《品牌与文案-观复Lore.md》
 * 中英成对、同根、互不直译；新增文案先补进那份文档，再进这里。
 */

export type Lang = "zh" | "en";

export const STRINGS = {
  // §1 启动与加载
  windowTitle: { zh: "观复", en: "Lore" },
  brandTitle: { zh: "观复", en: "Lore" },
  bootLoading: { zh: "正在打开你的库…", en: "Opening your library…" },
  bootErrorTitle: { zh: "库没能打开", en: "We couldn't open your library" },
  bootErrorBody: {
    zh: "数据还在本机，只是这次没读出来。",
    en: "Your data is still on this machine; it just didn't load this time.",
  },
  bootReload: { zh: "重新载入", en: "Reload" },

  // §2 空状态
  emptyPages: { zh: "从一篇空白开始。", en: "Begin with a blank page." },
  emptyTables: { zh: "还没有表格。", en: "No tables yet." },
  emptyRecords: {
    zh: "还没有记录，点右上「新建记录」开始",
    en: "No records yet — add one from the top right.",
  },
  tableGone: { zh: "这张表不见了", en: "This table is gone" },
  trashEmpty: { zh: "空，也是一种整理。", en: "Emptiness is a kind of tidiness." },
  searchNoResult: {
    zh: "没找到。换个词试试。",
    en: "Nothing found. Try another word.",
  },

  // §5 侧栏分组
  groupPages: { zh: "页面", en: "Pages" },
  groupTables: { zh: "表格", en: "Tables" },

  // §5 功能微文案
  searchPlaceholder: { zh: "搜索页面标题", en: "Search page titles" },
  clipEntry: { zh: "快速剪藏", en: "Quick clip" },
  clipFetching: { zh: "抓取中…", en: "Fetching…" },
  clipButton: { zh: "剪藏", en: "Clip" },
  aiTabActions: { zh: "操作", en: "Actions" },
  aiTabChat: { zh: "对话", en: "Chat" },
  aiTabAsk: { zh: "问答", en: "Ask" },
  aiTabSkills: { zh: "技能", en: "Skills" },
  aiAskPlaceholder: { zh: "问点什么…", en: "Ask something…" },
  aiRewritePlaceholder: {
    zh: "可选：改写要求（如「更口语一点」）",
    en: 'Optional: rewrite notes (e.g. "more casual")',
  },
  aiRewrite: { zh: "改写本段", en: "Rewrite" },
  aiSummarize: { zh: "总结本页", en: "Summarize" },
  aiDistill: { zh: "提炼要点", en: "Distill" },
  aiProcessing: { zh: "处理中…", en: "Working…" },

  // §6 全局搜索浮层（W6 · 08 号规格）
  searchPanelTitle: { zh: "全局搜索", en: "Global search" },
  searchTitle: { zh: "搜索", en: "Search" },
  searchCancel: { zh: "取消", en: "Cancel" },
  searchPlaceholderInPages: { zh: "在页面中搜索", en: "Search in pages" },
  searchPlaceholderInSpace: { zh: "在当前空间中搜索", en: "Search in this space" },
  searchClear: { zh: "清空", en: "Clear" },
  searchTabPages: { zh: "页面", en: "Pages" },
  searchTabChats: { zh: "对话", en: "Chats" },
  searchChatsEmpty: {
    zh: "还没有对话记录。",
    en: "No conversations yet.",
  },
  searchTitleOnly: { zh: "只搜索标题", en: "Titles only" },
  searchByCreator: { zh: "创建者", en: "Creator" },
  searchByCreatorUnavailable: {
    zh: "观复的页面还没有创建者字段，暂时用不了这一项。",
    en: "Lore pages don't track a creator yet, so this filter is unavailable.",
  },
  searchRemoveScope: { zh: "移出这个范围", en: "Remove this scope" },
  searchAddScope: { zh: "加范围", en: "Add scope" },
  searchSort: { zh: "排序", en: "Sort" },
  searchSortRelevance: { zh: "按匹配度", en: "By relevance" },
  searchSortUpdatedDesc: {
    zh: "按最后编辑时间 · 最近到最早",
    en: "By last edited · newest first",
  },
  searchSortUpdatedAsc: {
    zh: "按最后编辑时间 · 最早到最近",
    en: "By last edited · oldest first",
  },
  searchResults: { zh: "搜索结果", en: "Results" },
  searchResultCount: { zh: "{n} 条结果", en: "{n} results" },
  searchOpen: { zh: "打开", en: "Open" },
  searchAskAiWith: { zh: "问问 AI「{q}」", en: "Ask AI about “{q}”" },
  searchAskAiInPage: {
    zh: "在「{page}」中问 AI",
    en: "Ask AI within “{page}”",
  },
  searchAskAiGeneric: { zh: "问问 AI", en: "Ask AI" },
  searchRecent: { zh: "最近浏览", en: "Recently viewed" },
  searchRecentEmpty: { zh: "还没浏览过页面。", en: "You haven't opened any page yet." },
  searchInTrash: { zh: "在回收站", en: "In trash" },
  untitled: { zh: "无标题", en: "Untitled" },
  backlinksTitle: { zh: "引用了本页", en: "Pages that point here" },
  backlinksNone: { zh: "还没有页面引用本页", en: "No pages reference this one yet" },
  newPage: { zh: "新建页面", en: "New page" },
  newTable: { zh: "新建表格", en: "New table" },
  newRecord: { zh: "新建记录", en: "New record" },
} satisfies Record<string, { zh: string; en: string }>;

export type StringKey = keyof typeof STRINGS;
