import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from "react";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { filterSuggestionItems, type PartialBlock } from "@blocknote/core";
import * as blocknoteLocales from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { setCurrentEditor } from "./editorRef";
import { schema } from "./schema";
import { SelectionAiButton } from "./SelectionAi";
import { AiAskBox } from "./AiAskBox";
import { useStore } from "../data/store";
import { BlockContextMenu } from "../shell/BlockContextMenu";

/** 取块内联内容的纯文本（AI 命令要用） */
function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (typeof node === "string") return node;
      if (node && typeof node === "object") {
        const text = (node as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
      return "";
    })
    .join("");
}

/** 中文词条（BlockNote 若某版本改了导出名，这里会退化成英文，不影响功能） */
const zhDictionary = (blocknoteLocales as Record<string, unknown>).zh;

type Props = {
  /** 初次挂载时的内容。切换页面时由父组件用 key 强制重建编辑器 */
  initialBlocks: PartialBlock[];
  theme: "light" | "dark";
  onChange: (blocks: PartialBlock[]) => void;
  /** 图片/文件上传：存进本地附件库，返回可显示的地址 */
  uploadFile?: (file: File) => Promise<string>;
  /** 只读（R01）：剪藏记录的原文区不可编辑，想法写在单独的分区 */
  readOnly?: boolean;
};

export function PageEditor({ initialBlocks, theme, onChange, uploadFile, readOnly }: Props) {
  const dispatchAiCommand = useStore((s) => s.dispatchAiCommand);
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialBlocks.length ? (initialBlocks as never) : undefined,
    dictionary: zhDictionary as never,
    uploadFile,
  });

  /** 空行按空格 → 唤起「问 AI」小框 */
  const [ask, setAsk] = useState<{ blockId: string; top: number; left: number } | null>(null);

  const onEditorKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    const pos = editor.getTextCursorPosition();
    if (!pos) return;
    const block = pos.block;
    // 只有"空段落"才触发：有字时按空格就是正常打字
    if (inlineText(block.content).trim() !== "") return;
    e.preventDefault();
    const el = document.querySelector(`[data-id="${block.id}"]`);
    const rect = el?.getBoundingClientRect();
    setAsk({
      blockId: block.id,
      top: Math.min((rect?.bottom ?? 120) + 6, window.innerHeight - 170),
      left: Math.min(rect?.left ?? 120, window.innerWidth - 340),
    });
  };

  const insertAnswer = (text: string) => {
    if (!ask) return;
    editor.insertBlocks(
      [{ type: "callout", props: { emoji: "🤖", color: "blue" }, content: text } as never],
      ask.blockId,
      "after"
    );
    setAsk(null);
    editor.focus();
  };

  // 挂载后把当前内容推一次，保证"打开即存的基线"与编辑器一致；
  // 同时把编辑器实例登记出去（工具栏的导出/复制要用它的序列化能力）
  useEffect(() => {
    onChange(editor.document as unknown as PartialBlock[]);
    setCurrentEditor(editor);
    return () => setCurrentEditor(null);
    // 只在页面切换（组件重建）时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 自定义块在斜杠菜单里的入口（BlockNote 不会自动把自定义块加进菜单） */
  const calloutSlashItem = {
    title: "着重文字",
    subtext: "带底色的提示框",
    aliases: ["callout", "着重", "提示", "zhuozhong", "tishi", "zzt"],
    group: "扩展块",
    icon: <span style={{ fontSize: 16 }}>💡</span>,
    onItemClick: () => {
      // 直接把当前块"变成"着重块（而不是在后面插一个）：
      // 这样光标留在块里，用户能接着打字；也不会留下一个空的 "/着重" 段落。
      const current = editor.getTextCursorPosition().block;
      editor.updateBlock(current, { type: "callout" as never, props: { color: "grey" } as never });
      editor.focus();
    },
  };

  /** 书签块：把当前空段落变成书签（和着重文字同一套做法，光标不会跑掉） */
  const bookmarkSlashItem = {
    title: "书签",
    subtext: "保存一个网址卡片",
    aliases: ["bookmark", "shuqian", "link", "wangzhi", "书签", "网址"],
    group: "扩展块",
    icon: <span style={{ fontSize: 16 }}>🔗</span>,
    onItemClick: () => {
      const current = editor.getTextCursorPosition().block;
      editor.updateBlock(current, { type: "bookmark" as never });
      editor.focus();
    },
  };

  /** 多维表块：正文里放一张已有多维表的入口 */
  /** W53 页面块：在当前位置建子页面并显示为卡片 */
  const pageSlashItem = {
    title: "页面",
    subtext: "新建子页面并插入卡片",
    aliases: ["ym", "page", "yemian"],
    group: "基础块",
    icon: <span style={{ fontSize: 16 }}>📄</span>,
    onItemClick: () => {
      const current = editor.getTextCursorPosition().block;
      editor.updateBlock(current, { type: "pageBlock" as never, props: { mode: "new" } as never });
      editor.focus();
    },
  };

  /** W53 引用页面块：从现有页面里挑一个，显示为可点击卡片 */
  const pageRefSlashItem = {
    title: "引用页面",
    subtext: "引用已有页面",
    aliases: ["yyym", "pageref", "yinyong"],
    group: "基础块",
    icon: <span style={{ fontSize: 16 }}>🔗</span>,
    onItemClick: () => {
      const current = editor.getTextCursorPosition().block;
      editor.updateBlock(current, { type: "pageBlock" as never, props: { mode: "ref" } as never });
      editor.focus();
    },
  };

  const collectionSlashItem = {
    title: "多维表",
    subtext: "在正文里嵌入一张表",
    aliases: ["collection", "table", "biaoge", "duoweibiao", "多维表"],
    group: "扩展块",
    icon: <span style={{ fontSize: 16 }}>🗂️</span>,
    onItemClick: () => {
      const current = editor.getTextCursorPosition().block;
      editor.updateBlock(current, { type: "collectionBlock" as never });
      editor.focus();
    },
  };

  /** 斜杠菜单里的 AI 命令：走 store 的命令通道，右侧面板关着也不会丢 */
  const aiSlashItems = [
    {
      title: "AI 总结本页",
      subtext: "概括整页要点",
      aliases: ["ai", "总结", "summary", "zongjie"],
      group: "AI",
      icon: <span style={{ fontSize: 16 }}>🤖</span>,
      onItemClick: () => dispatchAiCommand({ kind: "summary" }),
    },
    {
      title: "AI 提炼要点",
      subtext: "列成条目",
      aliases: ["ai", "要点", "points", "yaodian"],
      group: "AI",
      icon: <span style={{ fontSize: 16 }}>📌</span>,
      onItemClick: () => dispatchAiCommand({ kind: "points" }),
    },
    {
      title: "AI 改写本段",
      subtext: "润色当前段落",
      aliases: ["ai", "改写", "rewrite", "gaixie"],
      group: "AI",
      icon: <span style={{ fontSize: 16 }}>✍️</span>,
      onItemClick: () => {
        const block = editor.getTextCursorPosition().block;
        dispatchAiCommand({
          kind: "rewriteBlock",
          blockId: block.id,
          text: inlineText(block.content),
        });
      },
    },
  ];

  /** @ 页面提及：列表直接取当前知识库里的页面，输入即筛 */
  const mentionItems = async (query: string) => {
    const q = query.trim().toLowerCase();
    return useStore
      .getState()
      .pages.filter((p) => !q || (p.title || "无标题").toLowerCase().includes(q))
      .slice(0, 20)
      .map((p) => ({
        title: p.title || "无标题",
        subtext: "页面",
        icon: <span style={{ fontSize: 16 }}>{p.icon ?? "📄"}</span>,
        onItemClick: () => {
          // 尾随空格：否则光标卡在提及节点里，用户接着打字会打不进去
          editor.insertInlineContent([
            { type: "pageMention", props: { pageId: p.id, title: p.title || "无标题" } },
            " ",
          ] as never);
        },
      }));
  };

  /**
   * W51 基础块文案照录（07 §1）：把 BlockNote 默认项改成观测到的中文名 + 规格快捷码别名。
   * 只改名/加别名，不改行为——插入、渲染、快捷键仍由 BlockNote 自带实现负责。
   */
  const TITLE_MAP: Record<string, string> = {
    段落: "正文",
    一级标题: "标题1",
    二级标题: "标题2",
    三级标题: "标题3",
    四级标题: "标题4",
    可折叠一级标题: "折叠标题1",
    可折叠二级标题: "折叠标题2",
    可折叠三级标题: "折叠标题3",
    无序列表: "项目列表",
    有序列表: "编号列表",
    检查清单: "待办列表",
    可折叠列表: "折叠列表",
    引用: "引述文字",
    代码块: "代码片段",
    表格: "简单表格",
    分隔线: "分割线",
    表情符号: "Emoji",
  };
  const ALIAS_MAP: Record<string, string[]> = {
    段落: ["zw", "zhenwen"],
    一级标题: ["h1", "bt1"],
    二级标题: ["h2", "bt2"],
    三级标题: ["h3", "bt3"],
    四级标题: ["h4", "bt4"],
    可折叠一级标题: ["zdbt1"],
    可折叠二级标题: ["zdbt2"],
    可折叠三级标题: ["zdbt3"],
    无序列表: ["xmlb"],
    有序列表: ["bhlb"],
    检查清单: ["dblb"],
    可折叠列表: ["zdlb"],
    引用: ["yswz"],
    代码块: ["dmpd"],
    表格: ["jdbg"],
    分隔线: ["fgx"],
    表情符号: ["Emoji"],
  };
  // 规格只有标题1~4；五级/六级不出现在菜单里（不做假入口）
  const HIDDEN_TITLES = new Set(["五级标题", "六级标题"]);

  return (
    <div className="editor-host" onKeyDown={onEditorKeyDown}>
      <BlockNoteView
        editor={editor}
        theme={theme}
        editable={!readOnly}
        slashMenu={false}
        // 关掉默认工具条：下面用 FormattingToolbarController 换成"默认项 + AI"
        formattingToolbar={false}
        onChange={() => onChange(editor.document as unknown as PartialBlock[])}
      >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          // 默认块 + 我们的着重文字块，一起交给筛选器
          filterSuggestionItems(
            [
              ...(getDefaultReactSlashMenuItems(editor as never) as {
                title: string;
                aliases?: string[];
              }[])
                .filter((it) => !HIDDEN_TITLES.has(it.title))
                .map((it) => ({
                  ...it,
                  title: TITLE_MAP[it.title] ?? it.title,
                  aliases: [...(it.aliases ?? []), ...(ALIAS_MAP[it.title] ?? [])],
                })),
              calloutSlashItem,
              bookmarkSlashItem,
              pageSlashItem,
              pageRefSlashItem,
              collectionSlashItem,
              ...aiSlashItems,
            ] as never,
            query
          )
        }
      />
      <SuggestionMenuController triggerCharacter="@" getItems={mentionItems as never} />
      {/* 默认格式化工具条 + 我们自己的 AI 按钮 */}
      <FormattingToolbarController
        formattingToolbar={() => (
          <FormattingToolbar>
            {getFormattingToolbarItems()}
            <SelectionAiButton />
          </FormattingToolbar>
        )}
      />
      </BlockNoteView>

      {ask && (
        <AiAskBox position={{ top: ask.top, left: ask.left }} onAnswer={insertAnswer} onClose={() => setAsk(null)} />
      )}
      <BlockContextMenu editor={editor} />
    </div>
  );
}
