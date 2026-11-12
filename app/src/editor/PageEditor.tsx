import { useEffect } from "react";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { filterSuggestionItems, type PartialBlock } from "@blocknote/core";
import * as blocknoteLocales from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { setCurrentEditor } from "./editorRef";
import { schema } from "./schema";

/** 中文词条（BlockNote 若某版本改了导出名，这里会退化成英文，不影响功能） */
const zhDictionary = (blocknoteLocales as Record<string, unknown>).zh;

type Props = {
  /** 初次挂载时的内容。切换页面时由父组件用 key 强制重建编辑器 */
  initialBlocks: PartialBlock[];
  theme: "light" | "dark";
  onChange: (blocks: PartialBlock[]) => void;
  /** 图片/文件上传：存进本地附件库，返回可显示的地址 */
  uploadFile?: (file: File) => Promise<string>;
};

export function PageEditor({ initialBlocks, theme, onChange, uploadFile }: Props) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialBlocks.length ? (initialBlocks as never) : undefined,
    dictionary: zhDictionary as never,
    uploadFile,
  });

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
    group: "基本块",
    icon: <span style={{ fontSize: 16 }}>💡</span>,
    onItemClick: () => {
      // 直接把当前块"变成"着重块（而不是在后面插一个）：
      // 这样光标留在块里，用户能接着打字；也不会留下一个空的 "/着重" 段落。
      const current = editor.getTextCursorPosition().block;
      editor.updateBlock(current, { type: "callout" as never, props: { color: "grey" } as never });
      editor.focus();
    },
  };

  return (
    <BlockNoteView editor={editor} theme={theme} slashMenu={false} onChange={() => onChange(editor.document as unknown as PartialBlock[])}>
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          // 默认块 + 我们的着重文字块，一起交给筛选器
          filterSuggestionItems(
            [...(getDefaultReactSlashMenuItems(editor as never) as never[]), calloutSlashItem] as never,
            query
          )
        }
      />
    </BlockNoteView>
  );
}
