from pathlib import Path
from datetime import date
import calendar
import math

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
FONT = "C:/Windows/Fonts/msyh.ttc"
BOLD = "C:/Windows/Fonts/msyhbd.ttc"
INK = "#303330"
MUTED = "#7B807E"
LINE = "#E5E7E4"
PAPER = "#FFFFFF"
SIDEBAR = "#F7F8F6"
BLUE = "#2578D4"
BLUE_LIGHT = "#EDF5FF"
GREEN = "#47745C"
AMBER = "#94692F"
RED = "#AD5C55"
BG = "#EFF0ED"

ITEMS = [
    dict(title="Docker 容器网络：从原理到排障", source="云原生手记", tags=["Docker", "网络"], read="阅读中", saved="已存档", ai="已生成", local=False, added="11/02 09:42", start=3, end=5, summary="梳理容器网络模式，给出从 DNS 到端口映射的排障顺序。"),
    dict(title="Linux 日志排查的 10 个实用方法", source="Linux 实践", tags=["Linux", "运维"], read="未读", saved="已存档", ai="已生成", local=False, added="11/02 09:18", start=6, end=6, summary="从日志定位、过滤到关联分析，整理常用排查方法。"),
    dict(title="搭建个人知识库的三个关键习惯", source="知识笔记", tags=["知识管理"], read="未读", saved="已存档", ai="处理中", local=False, added="11/02 08:56", start=None, end=None, summary="AI 简介生成中；正文与图片已保存，可先阅读全文。"),
    dict(title="SQLite 离线同步：如何避免数据覆盖", source="工程实践录", tags=["数据库", "离线"], read="未读", saved="存档中", ai="等待中", local=False, added="11/02 08:31", start=8, end=10, summary="正在保存正文和图片，完成后再进行 AI 解析。"),
    dict(title="一文理解 HTTP 缓存策略", source="Web 技术志", tags=["Web", "网络"], read="已读", saved="已存档", ai="已生成", local=True, added="11/01 18:24", start=1, end=2, summary="区分强缓存与协商缓存，说明常见响应头的作用。"),
    dict(title="PostgreSQL 索引选择与性能分析", source="数据库小站", tags=["数据库"], read="未读", saved="存档失败", ai="未开始", local=False, added="11/01 17:08", start=None, end=None, summary="存档失败，尚无完整快照；可查看原因并重新处理。"),
    dict(title="如何设计可靠的后台任务队列", source="后端札记", tags=["后端"], read="未读", saved="已存档", ai="生成失败", local=False, added="11/01 14:50", start=5, end=7, summary="原文存档成功；AI 解析失败，不影响阅读全文。"),
    dict(title="TypeScript 类型收窄实战", source="前端观察", tags=["前端"], read="已读", saved="已存档", ai="已生成", local=True, added="10/31 20:16", start=None, end=None, summary="通过控制流和类型守卫，让联合类型更容易使用。"),
]


class Canvas:
    def __init__(self, title, subtitle, number, height=1160, version="V0.1"):
        self.im = Image.new("RGB", (1800, height), BG)
        self.d = ImageDraw.Draw(self.im)
        self.fonts = {}
        self.text(40, 23, f"个人知识库 / 交互草图  {version}     ·     {number}", 14, MUTED)
        self.text(40, 51, title, 30, INK, True)
        self.text(40, 96, subtitle, 16, MUTED)

    def font(self, size=16, bold=False):
        key = (size, bold)
        if key not in self.fonts:
            self.fonts[key] = ImageFont.truetype(BOLD if bold else FONT, size)
        return self.fonts[key]

    def text(self, x, y, value, size=16, color=INK, bold=False):
        self.d.text((x, y), str(value), font=self.font(size, bold), fill=color, anchor="lt")

    def width(self, value, size=16, bold=False):
        return self.d.textlength(str(value), font=self.font(size, bold))

    def fit(self, x, y, value, width, size=16, color=INK, bold=False):
        value = str(value)
        if self.width(value, size, bold) > width:
            while value and self.width(value + "…", size, bold) > width:
                value = value[:-1]
            value += "…"
        self.text(x, y, value, size, color, bold)

    def wrap(self, x, y, value, width, size=16, color=INK, bold=False, leading=None, limit=None):
        leading = leading or int(size * 1.65)
        lines = []
        for para in value.split("\n"):
            line = ""
            for char in para:
                if line and self.width(line + char, size, bold) > width:
                    lines.append(line)
                    line = char
                else:
                    line += char
            lines.append(line)
        if limit and len(lines) > limit:
            lines = lines[:limit]
            lines[-1] = lines[-1][:-1] + "…"
        for idx, line in enumerate(lines):
            self.text(x, y + idx * leading, line, size, color, bold)
        return y + len(lines) * leading

    def rect(self, box, fill=PAPER, outline=None, radius=0, width=1):
        if radius:
            self.d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
        else:
            self.d.rectangle(box, fill=fill, outline=outline, width=width)

    def line(self, points, color=LINE, width=1):
        self.d.line(points, fill=color, width=width)

    def icon(self, kind, x, y, color=MUTED, s=16):
        d = self.d
        if kind == "search":
            d.ellipse((x+1, y+1, x+s-5, y+s-5), outline=color, width=2)
            self.line((x+s-5, y+s-5, x+s, y+s), color, 2)
        elif kind in ("table", "db"):
            self.rect((x, y+1, x+s, y+s-1), None, color, 2)
            self.line((x, y+6, x+s, y+6), color)
            self.line((x+5, y+1, x+5, y+s-1), color)
            if kind == "db":
                self.line((x, y+11, x+s, y+11), color)
        elif kind == "doc":
            self.rect((x+2, y, x+s-2, y+s), None, color, 1)
            self.line((x+5, y+5, x+s-5, y+5), color)
            self.line((x+5, y+9, x+s-5, y+9), color)
        elif kind == "board":
            for k, h in enumerate((12, 16, 9)):
                self.rect((x+k*6, y, x+k*6+3, y+h), None, color, 1)
        elif kind == "gallery":
            for a in (0, 9):
                for b in (0, 9):
                    self.rect((x+a, y+b, x+a+6, y+b+6), None, color, 1)
        elif kind == "calendar":
            self.rect((x, y+2, x+s, y+s), None, color, 2)
            self.line((x, y+7, x+s, y+7), color)
            self.line((x+4, y, x+4, y+4), color, 2)
            self.line((x+s-4, y, x+s-4, y+4), color, 2)
        elif kind == "timeline":
            for a, b, yy in ((0, 9, 2), (5, 16, 8), (2, 12, 14)):
                self.line((x+a, y+yy, x+b, y+yy), color, 3)
        elif kind == "list":
            for yy in (2, 8, 14):
                self.rect((x, y+yy, x+2, y+yy+2), color)
                self.line((x+6, y+yy+1, x+s, y+yy+1), color)
        elif kind == "download":
            self.line((x+8, y, x+8, y+11), color, 2)
            self.line((x+4, y+7, x+8, y+11, x+12, y+7), color, 2)
            self.line((x, y+12, x, y+16, x+16, y+16, x+16, y+12), color)
        elif kind == "check":
            self.line((x+2, y+8, x+6, y+12, x+14, y+3), color, 2)
        elif kind == "link":
            d.rounded_rectangle((x, y+6, x+10, y+13), radius=3, outline=color, width=1)
            d.rounded_rectangle((x+6, y+1, x+16, y+8), radius=3, outline=color, width=1)
        elif kind == "menu":
            for yy in (2, 8, 14):
                self.line((x, y+yy, x+16, y+yy), color, 2)
        else:
            self.rect((x+1, y+1, x+s-1, y+s-1), None, color, 3)

    def chip(self, x, y, value, tone="gray", size=13):
        tones = {"gray": ("#F0F1EF", "#626962"), "blue": (BLUE_LIGHT, BLUE), "green": ("#EDF4ED", GREEN), "amber": ("#FAF1E4", AMBER), "red": ("#FAECEA", RED)}
        bg, fg = tones[tone]
        w = self.width(value, size) + 16
        self.rect((x, y, x+w, y+size+11), bg, radius=3)
        self.text(x+8, y+5, value, size, fg)
        return w

    def tag(self, x, y, value):
        tone = "green" if value in ("Docker", "Linux", "Web") else "blue" if value in ("网络", "离线", "前端") else "gray"
        return self.chip(x, y, value, tone)

    def status(self, x, y, value, size=14):
        tone = "red" if "失败" in value else "amber" if value in ("存档中", "处理中", "等待中") else "green" if value in ("已存档", "已生成", "已读") else "blue" if value == "阅读中" else "gray"
        return self.chip(x, y, value, tone, size)

    def button(self, x, y, label, primary=False, w=None, h=32):
        w = w or self.width(label, 14) + 24
        self.rect((x, y, x+w, y+h), BLUE if primary else PAPER, None if primary else LINE, 4)
        self.text(x+12, y+9, label, 14, PAPER if primary else INK)
        return w

    def pin(self, x, y, number):
        self.d.ellipse((x-12, y-12, x+12, y+12), fill=PAPER, outline=BLUE, width=2)
        w = self.width(str(number), 13, True)
        self.text(x-w/2, y-7, number, 13, BLUE, True)

    def notes(self, items, y=1032):
        col = 1720 / len(items)
        for i, (title, body) in enumerate(items):
            x = 57 + i*col
            self.pin(x, y+14, i+1)
            self.text(x+24, y+5, title, 17, INK, True)
            self.wrap(x+24, y+34, body, col-65, 14, MUTED, leading=23)

    def shell(self, selected="微信公众号剪藏", sidebar=True):
        self.rect((40, 136, 1760, 1000), PAPER, LINE)
        left = 40
        if sidebar:
            self.rect((40, 136, 270, 1000), SIDEBAR)
            self.line((270, 136, 270, 1000))
            self.rect((58, 156, 84, 182), "#E8EDDB", radius=5)
            self.text(64, 162, "知", 15, "#64704D", True)
            self.text(95, 161, "我的知识库", 16, INK, True)
            self.text(239, 164, "«", 17, MUTED)
            nav = [("搜索", "search"), ("收件箱", "doc"), ("稍后阅读", "doc"), ("最近打开", "doc"), ("本机离线", "download")]
            for i, (label, icon) in enumerate(nav):
                yy = 214 + i*35
                self.icon(icon, 62, yy+2)
                self.text(89, yy+1, label, 15, "#606660")
                if label == "收件箱":
                    self.text(232, yy+2, "8", 13, MUTED)
            self.text(61, 414, "我的页面", 13, MUTED)
            self.text(239, 410, "+", 22, MUTED)
            pages = [("微信公众号剪藏", "db", 0), ("技术知识", "doc", 0), ("Linux 笔记", "doc", 1), ("开发资料", "db", 1), ("学习路线", "timeline", 1), ("学习计划", "doc", 0), ("文档资料", "db", 0)]
            for i, (label, icon, level) in enumerate(pages):
                yy = 448 + i*36
                if selected == label:
                    self.rect((50, yy-7, 260, yy+25), "#E9ECE7", radius=4)
                xx = 62 + level*18
                self.icon(icon, xx, yy+1, INK if selected == label else MUTED)
                self.text(xx+27, yy, label, 14, INK if selected == label else "#666C66", selected == label)
            self.line((58, 857, 251, 857))
            for i, label in enumerate(("任务与同步", "回收站", "设置")):
                yy = 877 + i*32
                self.icon("download" if i == 0 else "doc", 62, yy, MUTED)
                self.text(89, yy, label, 14, MUTED)
            left = 270
        self.text(left+25, 154, "我的页面  /  " + selected, 13, MUTED)
        self.text(1470, 154, "示例数据 · 静态草图", 12, MUTED)
        self.text(1713, 151, "···", 22, MUTED)
        self.line((left, 182, 1760, 182))
        return left

    def cover(self, left=270, right=1760):
        self.rect((left+1, 183, right-1, 275), "#E9EDE7")
        self.d.polygon([(left+1, 183), (left+530, 183), (left+380, 275), (left+1, 275)], fill="#DFE8E3")
        self.d.polygon([(left+530, 183), (right-1, 183), (right-1, 275), (left+380, 275)], fill="#EEECE2")
        self.text(right-108, 247, "更换封面", 12, "#91958D")

    def db_header(self):
        self.cover()
        self.icon("db", 307, 301, INK, 24)
        self.text(306, 338, "微信公众号剪藏", 33, INK, True)
        self.text(307, 388, "先收下，稍后慢慢读。每条记录都有独立的正文、属性和版本。", 15, MUTED)

    def views(self, x, y, active="表格", compact=False):
        types = [("表格", "table"), ("看板", "board"), ("列表", "list"), ("画廊", "gallery"), ("日历", "calendar"), ("时间轴", "timeline")]
        for name, icon in types:
            w = (72 if name != "时间轴" else 88) if not compact else (66 if name != "时间轴" else 83)
            selected = name == active
            if selected:
                self.rect((x-5, y-5, x+w-7, y+26), "#F3F5F2", radius=3)
            self.icon(icon, x+1, y+2, INK if selected else MUTED, 14)
            self.text(x+23, y+2, name, 14, INK if selected else MUTED, selected)
            if selected:
                self.line((x-4, y+35, x+w-7, y+35), INK, 2)
            x += w
        self.text(x+4, y-1, "+", 23, MUTED)

    def toolbar(self, right, y, group=False):
        self.text(right-458, y+8, "视图设置", 14, MUTED)
        self.text(right-370, y+8, "筛选", 14, MUTED)
        self.text(right-307, y+8, "排序", 14, MUTED)
        if group:
            self.text(right-244, y+8, "分组", 14, MUTED)
        self.icon("search", right-167, y+7)
        self.text(right-132, y+4, "···", 19, MUTED)
        self.button(right-82, y, "新建 +", True, 82)

    def save(self, name):
        self.im.save(ROOT / name)


def draw_table(c, box, compact=False, highlight=False):
    x, y, right, bottom = box
    if compact:
        cols = [("标题", 360), ("标签", 165), ("阅读状态", 105)]
    else:
        cols = [("标题", 360), ("标签", 160), ("作者 / 公众号", 145), ("收藏时间", 125), ("阅读状态", 108), ("存档状态", 112), ("AI 状态", 110), ("本机离线", 114)]
    c.rect((x, y, right, y+41), "#FAFBF9")
    c.line((x, y, right, y))
    c.line((x, y+41, right, y+41))
    xx = x
    for label, width in cols:
        c.text(xx+13, y+14, label, 13, MUTED)
        c.line((xx, y, xx, bottom))
        xx += width
    row_h = 51
    for idx, item in enumerate(ITEMS):
        yy = y+41+idx*row_h
        if highlight and idx == 0:
            c.rect((x, yy+1, right, yy+row_h-1), BLUE_LIGHT)
        c.line((x, yy+row_h, right, yy+row_h))
        c.icon("doc", x+12, yy+17, "#717870", 14)
        c.fit(x+37, yy+18, item["title"], 310, 14, BLUE if highlight and idx == 0 else INK)
        tx = x+cols[0][1]+12
        for tag in item["tags"]:
            tx += c.tag(tx, yy+13, tag)+5
        xx = x+cols[0][1]+cols[1][1]
        if not compact:
            c.fit(xx+12, yy+18, item["source"], 124, 13, MUTED)
            xx += cols[2][1]
            c.text(xx+12, yy+18, item["added"], 13, MUTED)
            xx += cols[3][1]
        c.status(xx+10, yy+13, item["read"], 13)
        if not compact:
            xx += 108
            c.status(xx+10, yy+13, item["saved"], 13)
            xx += 112
            c.status(xx+10, yy+13, item["ai"], 13)
            xx += 110
            c.text(xx+12, yy+18, "离线可用" if item["local"] else "未保留", 13, GREEN if item["local"] else MUTED)
    yy = y+41+len(ITEMS)*row_h
    c.text(x+13, yy+17, "+  新增记录", 14, MUTED)
    c.text(x+13, bottom+13, "8 条记录 · 2026 年 11 月 · 所有文章与处理状态均为演示", 12, MUTED)


def table_page():
    c = Canvas("01 / 电脑端 · 以表格为中心", "保留熟悉的页面树、封面、属性列和视图栏；不是另外做一个固定栏目阅读器。", "01")
    c.shell()
    c.db_header()
    c.views(308, 436)
    c.toolbar(1717, 428)
    draw_table(c, (306, 486, 1717, 964))
    c.pin(279, 464, 1)
    c.pin(799, 444, 2)
    c.text(1684, 497, "+", 20, MUTED)
    c.pin(1710, 479, 3)
    c.notes([
        ("页面树，而不是固定分类", "自己的笔记、子页面和资料库放在同一侧栏；库内记录不全挤进树里。"),
        ("同一份资料，六种视图", "筛选、排序、列宽和展示属性按视图保存；切换视图不复制内容。"),
        ("本机状态与云端状态分开", "“已存档”不等于手机已下载；标签、阅读状态可编辑，处理结果不可伪造。"),
    ])
    c.save("01-desktop-table.png")


def reader_page():
    c = Canvas("02 / 电脑端 · 点击文章，侧边阅读", "不离开原来的表格位置；看完关掉侧栏，就能继续整理下一篇。", "02")
    c.shell()
    c.cover(270, 1090)
    c.icon("db", 306, 301, INK, 24)
    c.text(306, 340, "微信公众号剪藏", 30, INK, True)
    c.text(307, 387, "同一资料库 · 选中的文章在右侧打开", 14, MUTED)
    c.views(308, 436, compact=True)
    draw_table(c, (306, 486, 1075, 964), True, True)
    c.rect((1090, 183, 1759, 999), PAPER)
    c.line((1090, 183, 1090, 999), "#D9DDD7", 2)
    c.text(1121, 207, "文章详情", 13, MUTED)
    c.text(1530, 204, "展开为整页", 13, MUTED)
    c.text(1685, 201, "···", 20, MUTED)
    c.text(1723, 202, "×", 22, MUTED)
    c.wrap(1121, 254, ITEMS[0]["title"], 592, 26, INK, True, leading=38)
    c.text(1121, 345, "云原生手记  ·  收藏于 2026/11/02 09:42", 13, MUTED)
    c.text(1121, 376, "查看原文 ↗", 13, BLUE)
    c.status(1242, 368, "已存档", 13)
    c.text(1340, 375, "快照 v1", 13, MUTED)
    c.line((1121, 408, 1727, 408))
    c.text(1121, 428, "阅读状态", 13, MUTED)
    c.status(1220, 420, "阅读中", 13)
    c.text(1410, 428, "计划阅读", 13, MUTED)
    c.text(1510, 428, "11/03 — 11/05", 13)
    c.text(1121, 464, "标签", 13, MUTED)
    c.tag(1220, 456, "Docker")
    c.tag(1295, 456, "网络")
    c.text(1510, 464, "展开全部属性", 13, MUTED)
    c.rect((1121, 503, 1727, 557), "#F7F8F5", radius=4)
    c.icon("download", 1138, 521, MUTED)
    c.text(1167, 516, "保存在此设备", 14)
    c.text(1167, 538, "未保留 · 联网可读", 11, MUTED)
    c.rect((1653, 518, 1706, 543), "#D9DDD6", radius=13)
    c.d.ellipse((1656, 521, 1675, 540), fill=PAPER)
    c.text(1121, 587, "文章快照", 15, INK, True)
    c.text(1231, 587, "AI 解读", 15, MUTED)
    c.text(1611, 589, "创建关联笔记", 13, BLUE)
    c.line((1121, 617, 1727, 617))
    c.line((1121, 617, 1186, 617), INK, 2)
    c.text(1121, 639, "一、先理解容器如何连接网络", 20, INK, True)
    c.wrap(1121, 679, "这是一段用于评审阅读布局的示例正文，不是真实剪藏内容。正文保留标题、段落、代码和图片；原文失效后，仍可读取已保存的快照。", 600, 16, "#555D55", leading=29)
    c.rect((1121, 786, 1727, 886), "#F4F6F3", LINE, 4)
    for xx, label in ((1142, "容器"), (1370, "网桥"), (1598, "外部网络")):
        c.rect((xx, 816, xx+104, 853), PAPER, "#CCD4C9", 4)
        c.text(xx+16, 827, label, 14)
    c.line((1246, 835, 1370, 835), "#A4B19E", 2)
    c.line((1474, 835, 1598, 835), "#A4B19E", 2)
    c.text(1134, 868, "示意图片 · 完整存档后图片也须保存在自己的存储中", 10, MUTED)
    c.text(1121, 916, "引用本页  2", 14, MUTED)
    c.text(1280, 916, "Linux 学习计划   ·   网络排障笔记", 13, BLUE)
    c.pin(1101, 211, 1)
    c.pin(1714, 514, 2)
    c.pin(1724, 603, 3)
    c.notes([
        ("侧边打开，也能展开整页", "表格的选中行、滚动位置和筛选条件不变；阅读与整理衔接更自然。"),
        ("开关仅影响当前设备", "开启后下载正文与图片；完成前显示进度，关闭不删除云端存档。"),
        ("原文、AI、自己的想法分开", "快照只读；AI 解读单独显示；自己的想法写进关联笔记并形成引用。"),
    ])
    c.save("02-desktop-reader.png")


def mini_frame(c, y, title, active, note):
    c.rect((40, y, 1760, y+475), PAPER, LINE)
    c.text(65, y+20, "微信公众号剪藏", 21, INK, True)
    c.text(326, y+26, note, 13, MUTED)
    c.text(1544, y+26, "同一份 8 条示例数据", 12, MUTED)
    c.views(66, y+65, active)
    c.toolbar(1727, y+58, active == "看板")
    return y+118


def board_timeline():
    c = Canvas("03 / 同一资料库 · 看板与时间轴", "阅读状态和计划日期是记录的属性；换一种视图，不会创建另一份文章。", "03", 1370)
    top = mini_frame(c, 136, "阅读看板", "看板", "分组依据：阅读状态")
    groups = [("未读", 5, [1, 2, 3, 5, 6]), ("阅读中", 1, [0]), ("已读", 2, [4, 7])]
    for idx, (label, count, ids) in enumerate(groups):
        xx = 66+idx*554
        c.rect((xx, top, xx+530, top+321), "#F8F9F6", radius=4)
        c.status(xx+14, top+12, label, 13)
        c.text(xx+107, top+19, str(count), 13, MUTED)
        c.text(xx+493, top+10, "+", 22, MUTED)
        for j, item_id in enumerate(ids):
            item = ITEMS[item_id]
            yy = top+51+j*48
            c.rect((xx+12, yy, xx+518, yy+42), PAPER, LINE, 4)
            c.fit(xx+25, yy+9, item["title"], 377, 13)
            c.text(xx+25, yy+27, " · ".join(item["tags"]), 10, MUTED)
            if item["saved"] == "存档失败":
                c.text(xx+424, yy+15, "存档失败", 11, RED)
            elif item["saved"] == "存档中":
                c.text(xx+424, yy+15, "存档中", 11, AMBER)
            elif item["ai"] == "生成失败":
                c.text(xx+424, yy+15, "AI 失败", 11, RED)
            elif item["ai"] == "处理中":
                c.text(xx+424, yy+15, "AI 处理中", 11, AMBER)
            else:
                c.text(xx+424, yy+15, item["added"][:5], 11, MUTED)
    c.text(68, 592, "操作规则：拖动到另一列 = 修改阅读状态；系统存档与 AI 处理状态不会被拖动修改。", 12, MUTED)
    top = mini_frame(c, 642, "阅读时间轴", "时间轴", "日期依据：计划阅读（起止日期）")
    x, end = 410, 1727
    cw = (end-x)/14
    c.rect((65, top, end, top+35), "#F8F9F6")
    c.text(79, top+12, "标题", 13, MUTED)
    for i in range(14):
        xx = x+i*cw
        c.text(xx+27, top+11, f"11/{i+1:02d}", 12, MUTED)
        c.line((xx, top+35, xx, top+286))
    c.rect((x+cw, top+35, x+2*cw, top+286), "#F1F6FD")
    c.line((x+cw, top+35, x+cw, top+286), "#A9CAE9")
    c.text(x+cw+12, top+290, "今天", 11, BLUE)
    for row, item_id in enumerate((4, 0, 1, 6, 3)):
        item = ITEMS[item_id]
        yy = top+35+row*50
        c.line((65, yy+50, end, yy+50))
        c.fit(80, yy+18, item["title"], 310, 13)
        bx = x+(item["start"]-1)*cw+4
        br = x+item["end"]*cw-4
        c.rect((bx, yy+10, br, yy+39), "#DCE9D9" if item["read"] == "已读" else "#DCEBFB", radius=4)
        c.fit(bx+10, yy+18, "已读" if item["read"] == "已读" else item["title"], br-bx-16, 11, GREEN if item["read"] == "已读" else BLUE)
    c.chip(78, top+309, "未安排  3", "gray", 12)
    c.text(202, top+315, "包括未设置本月日期的记录；不会因为缺少日期而被隐藏。", 12, MUTED)
    c.notes([
        ("看板是同一份数据的分组", "改变分组属性，表格中的状态也随之更新；不是在不同文件夹间复制。"),
        ("时间轴依据明确的日期", "移动或调整时间条会修改计划日期；不会修改原始收藏时间。"),
        ("无日期记录有明确入口", "“未安排”保留入口；没有日期，不代表资料被删掉或不属于这个库。"),
    ], 1195)
    c.text(40, 1333, "本页为两个不同视图的并列说明，不是要求在应用里同时堆放这两块区域。", 13, MUTED)
    c.save("03-board-and-timeline.png")


def note_page():
    c = Canvas("04 / 普通笔记 · 嵌入资料库 + 基础双链", "笔记里的表格仍引用原资料库；页面链接负责跳转，反向引用负责找回关系。", "04")
    c.shell("学习计划")
    c.text(1532, 208, "已保存在本机 · 已同步", 12, GREEN)
    c.text(352, 235, "学习计划", 36, INK, True)
    c.text(352, 293, "本周主题：容器网络与排障", 17, MUTED)
    c.text(352, 350, "学习目标", 23, INK, True)
    c.text(352, 395, "先建立清晰的网络路径，再用实际案例验证每一层的判断。", 17)
    for i, label in enumerate(("读懂容器网络的基本工作方式", "整理一份可复用的网络排障清单")):
        yy = 438+i*37
        c.rect((354, yy, 370, yy+16), PAPER, "#BBC2B7", 3)
        c.text(385, yy, label, 16)
    c.icon("link", 353, 533, BLUE)
    c.text(382, 531, "服务器配置笔记", 16, BLUE)
    c.text(558, 533, "页面引用 · 点击打开原页", 13, MUTED)
    c.line((351, 579, 1665, 579))
    c.text(352, 609, "本周阅读资料", 22, INK, True)
    c.icon("db", 353, 657, MUTED)
    c.text(381, 656, "微信公众号剪藏", 15, INK, True)
    c.text(580, 658, "嵌入视图 · 原库 ↗", 12, MUTED)
    c.chip(1113, 649, "筛选：标签包含 网络", "blue", 12)
    c.button(1395, 645, "视图设置")
    c.button(1510, 645, "新增记录", True, 104)
    tx, ty, tr = 352, 696, 1665
    cols = [("标题", 620), ("阅读状态", 185), ("计划阅读", 270), ("标签", 238)]
    c.rect((tx, ty, tr, ty+36), "#FAFBF9")
    xx = tx
    for label, ww in cols:
        c.text(xx+12, ty+12, label, 13, MUTED)
        c.line((xx, ty, xx, ty+142))
        xx += ww
    c.line((tx, ty, tr, ty))
    c.line((tx, ty+36, tr, ty+36))
    for row, item_id in enumerate((0, 4)):
        item = ITEMS[item_id]
        yy = ty+36+row*52
        c.icon("doc", tx+13, yy+17)
        c.text(tx+42, yy+18, item["title"], 15)
        c.status(tx+632, yy+12, item["read"], 13)
        c.text(tx+818, yy+18, f"11/{item['start']:02d} — 11/{item['end']:02d}", 14, MUTED)
        c.tag(tx+1088, yy+12, "网络")
        c.line((tx, yy+52, tr, yy+52))
    c.text(352, 856, "修改这里的记录会同步到原资料库；移除嵌入区域不会删除原资料。", 12, MUTED)
    c.line((352, 901, 1665, 901))
    c.text(352, 927, "引用本页  2", 15, INK, True)
    c.text(500, 928, "技术知识  /  本月学习安排", 14, BLUE)
    c.text(1070, 929, "反向引用自动形成；改名或移动后仍能跳转", 12, MUTED)
    c.pin(1694, 670, 1)
    c.pin(333, 543, 2)
    c.pin(333, 937, 3)
    c.notes([
        ("嵌入视图不是复制表格", "此处只筛选网络相关资料；布局可以独立调整，数据仍是原库的同一条记录。"),
        ("页面引用只建立联系", "点链接进入已有页面，不自动同步两篇笔记的正文，也不会复制一份新页面。"),
        ("引用关系可以往回找", "某页引用了本页，会在“引用本页”中出现；点击可回到引用位置。"),
    ])
    c.save("04-note-and-backlinks.png")


def more_views():
    c = Canvas("05 / 其余视图 · 列表、画廊与日历", "同样的示例文章，只是密度、封面与日期组织方式不同。", "05", 1420)
    c.rect((40, 136, 875, 713), PAPER, LINE)
    c.text(66, 158, "列表视图", 23, INK, True)
    c.text(66, 199, "标题 + AI 简介，适合快速筛读", 14, MUTED)
    c.line((65, 236, 850, 236))
    for i in range(4):
        item = ITEMS[i]
        yy = 258+i*104
        c.icon("doc", 66, yy+2)
        c.fit(96, yy, item["title"], 585, 17, INK, True)
        c.text(717, yy+3, item["added"][:5], 12, MUTED)
        c.wrap(96, yy+32, item["summary"], 699, 14, MUTED, leading=23, limit=2)
        c.line((96, yy+85, 850, yy+85))
    c.rect((900, 136, 1760, 713), PAPER, LINE)
    c.text(926, 158, "画廊视图", 23, INK, True)
    c.text(926, 199, "封面 + 标题 + 摘要；无封面时不伪造原文图片", 14, MUTED)
    for i, item in enumerate(ITEMS[:4]):
        xx = 925+(i%2)*407
        yy = 243+(i//2)*223
        c.rect((xx, yy, xx+382, yy+202), PAPER, LINE, 4)
        c.rect((xx+1, yy+1, xx+381, yy+70), "#EFF2EB" if i%2 else "#EAF0F3", radius=3)
        c.text(xx+16, yy+22, "封面示意" if i != 3 else "暂无封面", 12, MUTED)
        c.wrap(xx+15, yy+86, item["title"], 352, 16, INK, True, leading=25, limit=2)
        c.wrap(xx+15, yy+145, item["summary"], 350, 12, MUTED, leading=19, limit=2)
    cy = 740
    c.rect((40, cy, 1760, 1255), PAPER, LINE)
    c.text(65, cy+22, "日历视图", 23, INK, True)
    c.text(220, cy+28, "日期依据：计划阅读（开始日期）", 14, MUTED)
    c.text(1304, cy+26, "2026 年 11 月", 18, INK, True)
    c.button(1512, cy+19, "今天", False, 58)
    c.text(1612, cy+28, "‹       ›", 19, MUTED)
    gx, gy, gw = 65, cy+82, 1668
    cw, ch = gw/7, 58
    days = ["一", "二", "三", "四", "五", "六", "日"]
    for i, label in enumerate(days):
        c.text(gx+i*cw+108, gy, label, 13, MUTED)
    gridy = gy+30
    weeks = calendar.Calendar(firstweekday=0).monthdayscalendar(2026, 11)
    for row, week in enumerate(weeks):
        for col, day in enumerate(week):
            xx, yy = gx+col*cw, gridy+row*ch
            c.rect((xx, yy, xx+cw, yy+ch), "#F4F8FE" if day == 2 else PAPER, LINE)
            if day:
                c.text(xx+10, yy+8, str(day), 12, BLUE if day == 2 else MUTED, day == 2)
                ids = [j for j, item in enumerate(ITEMS) if item["start"] == day]
                for j, item_id in enumerate(ids[:1]):
                    c.rect((xx+6, yy+25, xx+cw-7, yy+51), BLUE_LIGHT, radius=3)
                    c.fit(xx+13, yy+32, ITEMS[item_id]["title"], cw-25, 11, BLUE)
    c.text(65, 1231, "未安排 / 不在本月  3 条   ·   无日期资料仍保留入口", 12, MUTED)
    c.notes([
        ("列表：先看标题和简介", "保留足够的阅读线索，不需要下载全文才能决定要不要打开。"),
        ("画廊：封面是可选线索", "这里的图块为占位示意；实际使用文章图片或清楚显示无封面。"),
        ("日历：日期来源自己选", "可按收藏日期或计划阅读日期展示；只允许编辑可修改的日期属性。"),
    ], 1290)
    c.save("05-list-gallery-calendar.png")


def phone_shell(c, x, y, title):
    w, h = 408, 828
    c.rect((x-9, y-9, x+w+9, y+h+9), "#D9DDD6", radius=29)
    c.rect((x, y, x+w, y+h), PAPER, radius=22)
    c.text(x+19, y+16, "09:42", 12, INK, True)
    c.text(x+w-98, y+16, "5G   86%", 11, MUTED)
    c.line((x, y+43, x+w, y+43))
    c.line((x+163, y+h-14, x+245, y+h-14), "#BBC2B8", 4)
    c.text(x, y-49, title, 20, INK, True)
    return x, y, w, h


def mobile_page():
    c = Canvas("06 / 安卓手机 · 同一套页面，重新安排触屏操作", "表格不缩水成不可读的小字；查看文章、AI 简介和离线状态均有清楚的入口。", "06", 1230)
    y = 231
    x, y, w, h = phone_shell(c, 116, y, "A · 资料库表格")
    c.icon("menu", x+18, y+60, INK)
    c.text(x+54, y+61, "我的知识库", 14)
    c.icon("search", x+332, y+59)
    c.text(x+372, y+55, "···", 20, MUTED)
    c.text(x+18, y+112, "微信公众号剪藏", 24, INK, True)
    c.text(x+18, y+154, "目录与属性已同步 · 全文按需读取", 12, MUTED)
    c.rect((x+14, y+190, x+81, y+226), "#F0F3ED", radius=4)
    c.text(x+25, y+201, "表格", 14, INK, True)
    c.text(x+101, y+201, "看板", 14, MUTED)
    c.text(x+178, y+201, "列表", 14, MUTED)
    c.text(x+253, y+201, "画廊", 14, MUTED)
    c.text(x+333, y+201, "更多", 14, MUTED)
    c.line((x+373, y+206, x+377, y+210, x+381, y+206), MUTED)
    c.text(x+20, y+249, "筛选    排序    属性", 13, MUTED)
    c.button(x+310, y+238, "新建 +", True, 82, 36)
    ty = y+292
    c.rect((x, ty, x+w, ty+38), "#F8FAF6")
    c.text(x+18, ty+12, "标题", 13, MUTED)
    c.text(x+285, ty+12, "阅读状态", 13, MUTED)
    for i, item in enumerate(ITEMS[:5]):
        yy = ty+38+i*68
        c.line((x, yy+68, x+w, yy+68))
        c.wrap(x+18, yy+13, item["title"], 244, 14, INK, leading=22, limit=2)
        c.status(x+286, yy+19, item["read"], 12)
    c.line((x+273, ty, x+273, ty+378))
    c.rect((x+288, ty, x+408, ty+378), None)
    c.line((x+22, y+731, x+181, y+731), "#BEC7B8", 4)
    c.text(x+18, y+754, "← 横向查看其他列 · 标题列保留", 12, MUTED)
    c.text(x+18, y+789, "点击标题看全文 · 点击属性修改值", 11, MUTED)

    x, y, w, h = phone_shell(c, 695, y, "B · 文章与 AI 简介")
    c.text(x+18, y+59, "‹  返回", 15, INK)
    c.text(x+287, y+61, "稍后读", 13, MUTED)
    c.text(x+371, y+56, "···", 20, MUTED)
    c.wrap(x+20, y+112, "Docker 容器网络：\n从原理到排障", 365, 25, INK, True, leading=38)
    c.text(x+20, y+207, "云原生手记  ·  11/02 收藏", 12, MUTED)
    c.status(x+20, y+238, "已存档", 12)
    c.status(x+105, y+238, "阅读中", 12)
    c.text(x+291, y+244, "查看属性", 12, MUTED)
    c.line((x+360, y+248, x+364, y+252, x+368, y+248), MUTED)
    c.line((x+20, y+287, x+388, y+287))
    c.text(x+20, y+313, "文章快照", 15, MUTED)
    c.text(x+137, y+313, "AI 解读", 15, INK, True)
    c.line((x+135, y+343, x+200, y+343), INK, 2)
    c.text(x+20, y+374, "简短介绍", 18, INK, True)
    c.wrap(x+20, y+414, ITEMS[0]["summary"], 365, 16, "#535D51", leading=29)
    c.text(x+20, y+508, "内容要点", 18, INK, True)
    for i, text in enumerate(("先区分网络模式与地址分配。", "沿 DNS、路由、端口逐层检查。", "把排查过程整理成可复用清单。")):
        c.text(x+21, y+553+i*39, str(i+1)+".", 15, MUTED)
        c.text(x+46, y+553+i*39, text, 14)
    c.text(x+20, y+696, "示例 AI 内容 · 不覆盖原始快照", 11, MUTED)
    c.line((x, y+741, x+w, y+741))
    c.icon("download", x+22, y+764, MUTED)
    c.text(x+51, y+759, "保存在此设备", 14)
    c.text(x+51, y+783, "未开启 · 当前联网可读", 11, MUTED)
    c.rect((x+330, y+762, x+383, y+788), "#D9DDD6", radius=13)
    c.d.ellipse((x+333, y+765, x+353, y+785), fill=PAPER)

    x, y, w, h = phone_shell(c, 1274, y, "C · 选择离线保存")
    c.text(x+18, y+59, "‹  返回", 15, INK)
    c.text(x+20, y+112, "Docker 容器网络", 25, INK, True)
    c.text(x+20, y+159, "正文与图片均已下载到这台手机", 14, MUTED)
    c.rect((x+20, y+208, x+388, y+313), "#F3F7EF", radius=4)
    c.icon("check", x+38, y+231, GREEN)
    c.text(x+70, y+233, "离线可用", 19, GREEN, True)
    c.text(x+38, y+274, "快照 v1 · 正文与图片完整 · 示例状态", 12, MUTED)
    c.text(x+20, y+355, "一、先理解容器如何连接网络", 18, INK, True)
    c.wrap(x+20, y+397, "这是示例快照正文。开启离线保存后，断网也能查看已下载的正文和图片，不依赖原文热链。", 365, 16, "#535D51", leading=29)
    c.rect((x+20, y+521, x+388, y+616), "#F3F5F1", LINE, 4)
    c.text(x+54, y+558, "容器    →    网桥    →    外部网络", 14, MUTED)
    c.text(x+20, y+647, "出现新版本时，下载完成前保留旧版。", 12, MUTED)
    c.text(x+20, y+681, "关闭仅清理本机副本，不删除云端文章。", 12, MUTED)
    c.line((x, y+741, x+w, y+741))
    c.icon("download", x+22, y+764, GREEN)
    c.text(x+51, y+759, "保存在此设备", 14)
    c.text(x+51, y+783, "已完成 · 仅影响这台手机", 11, MUTED)
    c.rect((x+330, y+762, x+383, y+788), BLUE, radius=13)
    c.d.ellipse((x+360, y+765, x+380, y+785), fill=PAPER)

    c.text(592, 630, "→", 40, "#B5BDB0")
    c.text(1171, 630, "→", 40, "#B5BDB0")
    c.notes([
        ("不是把桌面版缩小", "使用相同资料与视图；触屏编辑用面板，其他列通过横向滚动查看。"),
        ("先同步简介，再按需读全文", "收到目录摘要不代表全文下载；AI 解读、快照、属性分开查看。"),
        ("完成下载后才叫离线可用", "等待或下载中必须单独提示；未同步的个人修改不能被清理。"),
    ], 1113)
    c.save("06-android-flow.png")


if __name__ == "__main__":
    table_page()
    reader_page()
    board_timeline()
    note_page()
    more_views()
    mobile_page()
    images = []
    labels = []
    for p in sorted(ROOT.glob("0*.png")):
        im = Image.open(p)
        im.thumbnail((840, 670), Image.Resampling.LANCZOS)
        images.append(im.copy())
        labels.append(p.name)
    sheet = Image.new("RGB", (1800, 2130), BG)
    sd = ImageDraw.Draw(sheet)
    sd.text((40, 24), "个人知识库 · 第一轮草图总览", fill=INK, font=ImageFont.truetype(BOLD, 30))
    sd.text((40, 72), "FlowUs 式布局与多视图 / 全部为静态示例，不代表功能已实现", fill=MUTED, font=ImageFont.truetype(FONT, 17))
    for idx, im in enumerate(images):
        xx = 40+(idx%2)*880
        yy = 120+(idx//2)*660
        sheet.paste(im, (xx, yy))
        sd.text((xx+5, yy+im.height+9), labels[idx], fill=MUTED, font=ImageFont.truetype(FONT, 13))
    sheet.save(ROOT / "00-overview.png")
    print("Rendered 6 wireframe boards plus overview:")
    for p in sorted(ROOT.glob("*.png")):
        with Image.open(p) as im:
            print(p.name, im.size)
