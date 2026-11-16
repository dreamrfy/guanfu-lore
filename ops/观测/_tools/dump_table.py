#!/usr/bin/env python3
"""把 Android uiautomator dump 的 XML 转成可读控件表（写规格用）。

用法: python -I dump_table.py <dumped.xml> [> out.txt]

输出每行: 缩进 + id / 类 / 文案 / 描述 / bounds / 可点标志
只保留「有文案、有描述、可点、或有 resource-id」的节点，避免容器噪声。
"""
import sys
import xml.etree.ElementTree as ET

SHORT = {
    "android.widget.TextView": "Text",
    "android.widget.ImageView": "Image",
    "android.widget.ImageButton": "ImageBtn",
    "android.widget.Button": "Button",
    "android.widget.EditText": "Edit",
    "android.widget.LinearLayout": "Linear",
    "android.widget.FrameLayout": "Frame",
    "android.widget.RelativeLayout": "Relative",
    "android.view.View": "View",
    "android.view.ViewGroup": "Group",
    "androidx.recyclerview.widget.RecyclerView": "Recycler",
    "androidx.viewpager.widget.ViewPager": "Pager",
    "android.widget.ScrollView": "Scroll",
    "android.widget.HorizontalScrollView": "HScroll",
}


def short_id(rid: str) -> str:
    return rid.split("/")[-1] if rid else ""


def walk(node, depth, out):
    attrib = node.attrib
    text = (attrib.get("text") or "").strip()
    desc = (attrib.get("content-desc") or "").strip()
    rid = short_id(attrib.get("resource-id") or "")
    cls = SHORT.get(attrib.get("class") or "", (attrib.get("class") or "").split(".")[-1])
    bounds = attrib.get("bounds") or ""
    clickable = attrib.get("clickable") == "true"
    long_clickable = attrib.get("long-clickable") == "true"
    scrollable = attrib.get("scrollable") == "true"
    selected = attrib.get("selected") == "true"

    interesting = bool(text or desc or rid or clickable)
    if interesting:
        flags = []
        if clickable:
            flags.append("click")
        if long_clickable:
            flags.append("long")
        if scrollable:
            flags.append("scroll")
        if selected:
            flags.append("sel")
        parts = [
            f'{cls}',
            f'id={rid}' if rid else '',
            f'text="{text}"' if text else '',
            f'desc="{desc}"' if desc else '',
            f'[{bounds}]' if bounds else '',
            ('(' + ','.join(flags) + ')') if flags else '',
        ]
        out.append("  " * depth + " ".join(p for p in parts if p))

    for child in list(node):
        walk(child, depth + 1 if interesting else depth, out)


def main():
    path = sys.argv[1]
    root = ET.parse(path).getroot()
    out = []
    walk(root, 0, out)
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
