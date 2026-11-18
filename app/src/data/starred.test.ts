import { beforeEach, describe, expect, it } from "vitest";
import { useStarred } from "./starred";

beforeEach(() => {
  localStorage.clear();
  useStarred.setState({ ids: [] });
});

describe("快速访问（W46 共享 store）", () => {
  it("toggle 加入/移除，并落盘到 localStorage", () => {
    const s = () => useStarred.getState();
    s().toggle("a");
    expect(s().has("a")).toBe(true);
    expect(JSON.parse(localStorage.getItem("guanfu.starred") ?? "[]")).toEqual(["a"]);

    s().toggle("a");
    expect(s().has("a")).toBe(false);
    expect(JSON.parse(localStorage.getItem("guanfu.starred") ?? "[]")).toEqual([]);
  });

  it("remove 幂等", () => {
    const s = () => useStarred.getState();
    s().toggle("b");
    s().remove("b");
    s().remove("b");
    expect(s().ids).toEqual([]);
  });
});
