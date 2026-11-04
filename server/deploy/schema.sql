-- 阶段一数据库表结构与索引（SQLite 版；云数据库版按此一一对应）
-- 说明：assets_json 存 AssetRef[]（{assetId, provider, ext}），
--       **不含完整 URL**（G1：资源只存编号，地址由存储层按编号生成）。

CREATE TABLE IF NOT EXISTS clips (
  id            TEXT PRIMARY KEY,   -- 幂等键：规范化源 URL 的 SHA-256 前 16 位（wx_/url_ + 16 hex）
  source        TEXT NOT NULL,      -- wechat_mp / xiaohongshu / bilibili / douyin
  source_url    TEXT NOT NULL,      -- 原始链接（一字不删，抓取必需）
  title         TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  account       TEXT NOT NULL DEFAULT '',
  published_at  TEXT,
  saved_at      TEXT NOT NULL,      -- 入库时间（ISO）
  text          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL,      -- pending / partial / complete / failed
                                    --   空正文只能 failed/partial；缺图只能 partial（SNAP-02）
  fail_reason   TEXT,               -- network_timeout / blocked_by_platform / content_missing /
                                    -- images_failed / unsupported_type / blocked_address /
                                    -- response_too_large / internal_error
  note          TEXT,
  assets_json   TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_clips_saved_at ON clips(saved_at);
CREATE INDEX IF NOT EXISTS idx_clips_status   ON clips(status);
