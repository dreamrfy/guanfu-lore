/**
 * 着重文字块（FlowUs 的 callout）
 *
 * 为什么自定义：BlockNote 内置块里没有它，但它在你日常写作里很常用
 * （强调重点、放提示）。自定义块是官方支持的扩展方式，不是改它的源码。
 *
 * ⚠️ 配色待补采：M0 阶段没采到 FlowUs 着重文字的实际色值（当时缺样本），
 *    下面四组是按同类产品推定的，等按基准补采后校准。
 */
import type { ReactNode } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";

export const CALLOUT_COLORS = ["grey", "yellow", "red", "blue"] as const;
export type CalloutColor = (typeof CALLOUT_COLORS)[number];

export const CALLOUT_COLOR_LABEL: Record<CalloutColor, string> = {
  grey: "灰",
  yellow: "黄",
  red: "红",
  blue: "蓝",
};

export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      ...defaultProps,
      color: { default: "grey", values: [...CALLOUT_COLORS] },
      emoji: { default: "💡" },
    },
    content: "inline",
  },
  {
    render: ({ block, contentRef }) => {
      const color = (block.props.color ?? "grey") as CalloutColor;
      const emoji = block.props.emoji || "💡";
      return (
        <div className={`callout callout--${color}`} data-callout-color={color}>
          <span className="callout__emoji" contentEditable={false}>
            {emoji}
          </span>
          <div className="callout__content" ref={contentRef} />
        </div>
      );
    },
    /**
     * 导出到 HTML / 复制到别处时的样子，Markdown 导出也由它转换而来。
     * 用 <blockquote> 而不是 div：这样导出成 Markdown 会变成引用块（`> 💡 ...`），
     * 语义没丢；用 div 的话就退化成一行普通文字了。
     */
    toExternalHTML: ({ block, contentRef }): ReactNode => {
      const color = (block.props.color ?? "grey") as CalloutColor;
      return (
        <blockquote data-callout-color={color} style={{ borderLeft: "3px solid var(--gf-border-strong)", margin: "4px 0", paddingLeft: 12 }}>
          <span>{(block.props.emoji as string) || "💡"} </span>
          <span ref={contentRef} />
        </blockquote>
      );
    },
  }
);
