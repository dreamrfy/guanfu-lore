/**
 * 编辑器 schema：默认块 + 我们的自定义块
 *
 * 自定义块必须登记在这里，否则：
 *  - 文档里已有的自定义块打不开（不认识这个类型）
 *  - 斜杠菜单里也选不到
 */
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { BookmarkBlock } from "./blocks/bookmark";
import { CalloutBlock } from "./blocks/callout";
import { CollectionBlock } from "./blocks/collectionBlock";
import { PageMention } from "./blocks/pageMention";
import { PageBlock } from "./blocks/pageBlock";

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: CalloutBlock(),
    bookmark: BookmarkBlock(),
    pageBlock: PageBlock(),
    collectionBlock: CollectionBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    pageMention: PageMention,
  },
});

/** 供界面显示用：我们额外加了哪些块类型 */
export const CUSTOM_BLOCK_LABELS: Record<string, string> = {
  callout: "着重文字",
  bookmark: "书签",
  collectionBlock: "多维表",
  pageBlock: "页面",
};
