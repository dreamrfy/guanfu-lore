/**
 * 书签块
 *
 * 只存网址 + 标题，不在客户端抓网页：
 *  - 浏览器直接 fetch 别人的页面会撞 CORS，抓不到标题是常态；
 *  - 个人知识库也不该为了一个标题把用户剪藏的网址发去第三方。
 * 标题默认取域名，用户可以点标题自己改。
 */
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const BookmarkBlock = createReactBlockSpec(
  {
    type: "bookmark",
    propSchema: {
      ...defaultProps,
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const url = block.props.url as string;
      const title = (block.props.title as string) || (url ? hostOf(url) : "");
      const description = block.props.description as string;

      if (!url) {
        return (
          <div className="bookmark bookmark--empty" contentEditable={false}>
            <span className="bookmark__icon">🔗</span>
            <input
              className="bookmark__url-input"
              placeholder="粘贴网址，回车创建书签"
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const value = (e.target as HTMLInputElement).value.trim();
                if (!value) return;
                const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
                editor.updateBlock(block, {
                  props: { url: normalized, title: hostOf(normalized) },
                });
              }}
            />
          </div>
        );
      }

      return (
        <div className="bookmark" contentEditable={false}>
          <span className="bookmark__icon">🔗</span>
          <div className="bookmark__meta">
            <input
              className="bookmark__title"
              defaultValue={title}
              title="点击可改标题"
              onBlur={(e) => editor.updateBlock(block, { props: { title: e.target.value } })}
            />
            <a className="bookmark__url" href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
            {description && <div className="bookmark__desc">{description}</div>}
          </div>
          <button
            className="bookmark__reset"
            title="换一个网址"
            onClick={() => editor.updateBlock(block, { props: { url: "", title: "", description: "" } })}
          >
            ×
          </button>
        </div>
      );
    },
    toExternalHTML: ({ block }) => (
      <p>
        <a href={(block.props.url as string) || "#"}>{(block.props.title as string) || (block.props.url as string)}</a>
      </p>
    ),
  }
);
