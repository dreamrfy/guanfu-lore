import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_KIND, exportBackup, importBackupFile } from "./backup";
import { repo } from "./db";
import { flushDocs, useStore } from "./store";

const s = () => useStore.getState();

/** 拦住真实下载，把导出的内容抓下来 */
function captureDownload() {
  let blob: Blob | null = null;
  const realCreate = URL.createObjectURL;
  const realClick = HTMLAnchorElement.prototype.click;

  URL.createObjectURL = ((b: Blob) => {
    blob = b;
    return "blob:test";
  }) as typeof URL.createObjectURL;
  HTMLAnchorElement.prototype.click = function () {
    /* 不真的下载 */
  };

  return {
    read: async () => (blob ? await blob.text() : null),
    restore: () => {
      URL.createObjectURL = realCreate;
      HTMLAnchorElement.prototype.click = realClick;
    },
  };
}

beforeEach(() => {
  useStore.setState({ ready: false, bootError: null, pages: [], trash: [], docs: {}, tabs: [], activeTabId: null });
});

describe("整库备份", () => {
  it("导出的文件结构完整、内容与库一致", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    void s().ensureDoc(id);
    s().renamePage(id, "备份测试页");
    s().setBlocks(id, [{ type: "paragraph" }, { type: "paragraph" }]);

    const cap = captureDownload();
    try {
      const result = await exportBackup();
      const text = await cap.read();
      expect(text).toBeTruthy();

      const payload = JSON.parse(text!);
      expect(payload.kind).toBe(BACKUP_KIND);
      expect(payload.version).toBe(1);
      expect(payload.pages).toHaveLength(1);
      expect(payload.pages[0].title).toBe("备份测试页");
      expect(payload.docs[0].blocks).toHaveLength(2);
      expect(result.pages).toBe(1);
    } finally {
      cap.restore();
    }
  });

  it("导出前会先把防抖里的正文落盘（避免备份少最后一秒的改动）", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    void s().ensureDoc(id);
    s().setBlocks(id, [{ type: "paragraph" }]);

    const cap = captureDownload();
    try {
      await exportBackup();
      const payload = JSON.parse((await cap.read())!);
      expect(payload.docs[0].blocks).toHaveLength(1);
    } finally {
      cap.restore();
    }
    await flushDocs();
  });

  it("导入会整体覆盖数据", async () => {
    await s().hydrate();
    const old = s().pages[0].id;
    void s().ensureDoc(old);
    s().renamePage(old, "应该被覆盖掉");

    const payload = {
      kind: BACKUP_KIND,
      version: 1,
      exportedAt: Date.now(),
      prefs: null,
      pages: [
        {
          id: "from-backup",
          parentId: null,
          title: "来自备份",
          icon: null,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          sortKey: 1,
        },
      ],
      docs: [{ pageId: "from-backup", blocks: [{ type: "paragraph" }], updatedAt: 1 }],
      meta: [],
    };
    const file = new File([JSON.stringify(payload)], "backup.json", { type: "application/json" });

    const r = await importBackupFile(file);
    expect(r.pages).toBe(1);

    const rows = await repo.listPages();
    expect(rows.map((p) => p.title)).toEqual(["来自备份"]);
    expect(await repo.getDoc("from-backup")).toHaveLength(1);
  });

  it("陌生文件、坏 JSON、版本不符 都会被挡下来（而不是默默清库）", async () => {
    await s().hydrate();
    const before = (await repo.listPages()).length;

    const cases: Array<[string, string]> = [
      ["坏 JSON", "{ 这不是 json"],
      ["别的应用的文件", JSON.stringify({ hello: "world" })],
      ["版本不符", JSON.stringify({ kind: BACKUP_KIND, version: 99, pages: [] })],
    ];

    for (const [name, content] of cases) {
      const file = new File([content], "x.json", { type: "application/json" });
      await expect(importBackupFile(file), name).rejects.toThrow();
    }

    // 关键：报错之后，原有数据必须还在
    expect((await repo.listPages()).length).toBe(before);
  });
});
