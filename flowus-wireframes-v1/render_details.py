from render_wireframes import (
    Canvas, ROOT, ITEMS, INK, MUTED, LINE, PAPER, BLUE, BLUE_LIGHT,
    GREEN, AMBER, SIDEBAR,
)


def input_field(c, x, y, width, value, focused=False):
    c.rect((x, y, x+width, y+42), PAPER, BLUE if focused else "#D8DDD3", 4, 2 if focused else 1)
    c.text(x+13, y+13, value, 15)


def check(c, x, y, active=True):
    c.rect((x, y, x+17, y+17), BLUE if active else PAPER, BLUE if active else "#C7CEC0", 3)
    if active:
        c.line((x+3, y+8, x+7, y+12, x+14, y+4), PAPER, 2)


def property_board():
    c = Canvas(
        "07 / 表格细节 · 直接编辑属性，也能自己加列",
        "延续 FlowUs 的就地操作：改一个值不用打开整页；新增属性和当前视图显示分开管理。",
        "07", 1250, version="V0.2",
    )
    c.rect((40, 136, 1060, 930), PAPER, LINE)
    c.text(65, 159, "A · 点击单元格，直接修改阅读状态", 22, INK, True)
    c.text(65, 202, "微信公众号剪藏  /  全部文章〔表格〕", 14, MUTED)
    c.text(826, 204, "示例数据 · 静态草图", 12, MUTED)
    x, y, right = 65, 248, 1036
    cols = [("标题", 449), ("阅读状态", 175), ("标签", 347)]
    c.rect((x, y, right, y+40), "#F8FAF6")
    xx = x
    for label, width in cols:
        c.text(xx+12, y+13, label, 14, MUTED)
        c.line((xx, y, xx, y+295))
        xx += width
    for i, item in enumerate(ITEMS[:4]):
        yy = y+40+i*62
        c.line((x, yy+62, right, yy+62))
        c.icon("doc", x+12, yy+23)
        c.fit(x+39, yy+23, item["title"], 398, 15)
        c.status(x+462, yy+18, item["read"], 13)
        tx = x+639
        for tag in item["tags"]:
            tx += c.tag(tx, yy+18, tag)+5
    c.rect((514, 288, 689, 350), None, BLUE, 0, 2)
    c.pin(697, 296, 1)
    px, py, pw = 514, 353, 335
    c.rect((px+3, py+5, px+pw+3, py+326), "#EDF0E9", radius=5)
    c.rect((px, py, px+pw, py+322), PAPER, "#CCD4C5", 5)
    c.text(px+16, py+17, "阅读状态", 14, INK, True)
    input_field(c, px+13, py+49, pw-26, "搜索选项…")
    for i, label in enumerate(("未读", "阅读中", "已读")):
        yy = py+104+i*46
        if label == "阅读中":
            c.rect((px+8, yy-5, px+pw-8, yy+34), BLUE_LIGHT, radius=3)
        c.status(px+20, yy, label, 14)
        if label == "阅读中":
            c.icon("check", px+pw-38, yy+5, BLUE)
    c.line((px+12, py+246, px+pw-12, py+246))
    c.text(px+19, py+262, "清空此单元格", 13, MUTED)
    c.text(px+19, py+293, "选择即保存 · Esc 关闭", 11, MUTED)
    c.text(65, 725, "不同属性，用对应的编辑方式", 19, INK, True)
    for i, (a, b) in enumerate((
        ("文本 / 数字", "原位输入，Enter 确认，Esc 放弃本次编辑"),
        ("单选 / 多选", "弹出选项；多选可连续勾选，保留已有值"),
        ("日期 / 起止日期", "使用日期面板；有起止日期才展示跨度"),
    )):
        yy = 770+i*42
        c.text(65, yy, a, 14, INK, True)
        c.text(230, yy, b, 14, MUTED)

    c.rect((1083, 136, 1760, 930), PAPER, LINE)
    c.text(1108, 159, "B · 点表头末尾的 ＋，新增属性", 22, INK, True)
    c.text(1108, 202, "属性属于这个资料库，其他视图也可以选用。", 14, MUTED)
    c.rect((1121, 242, 1722, 888), "#FAFBF9", "#D8DED2", 5)
    c.text(1145, 264, "新增属性", 19, INK, True)
    c.text(1674, 259, "×", 23, MUTED)
    c.text(1145, 309, "属性名称", 14, MUTED)
    input_field(c, 1145, 337, 553, "掌握程度", True)
    c.text(1145, 402, "属性类型", 14, MUTED)
    choices = [("文本", "随手记录"), ("单选", "选择一个值"), ("多选", "选择多个值"), ("日期", "含起止日期"), ("勾选", "是 / 否"), ("数字", "评分、优先级"), ("链接", "参考地址")]
    for i, (label, detail) in enumerate(choices):
        col, row = i % 2, i // 2
        xx, yy = 1145+col*285, 433+row*49
        selected = label == "单选"
        c.rect((xx, yy, xx+268, yy+41), BLUE_LIGHT if selected else PAPER, BLUE if selected else LINE, 3)
        c.text(xx+12, yy+13, label, 14, BLUE if selected else INK, selected)
        c.text(xx+80, yy+14, detail, 12, MUTED)
        if selected:
            c.icon("check", xx+239, yy+11, BLUE)
    c.text(1145, 653, "单选选项", 14, MUTED)
    xx = 1145
    for label, tone in (("未学习", "gray"), ("学习中", "blue"), ("已掌握", "green")):
        xx += c.chip(xx, 683, label, tone, 13)+9
    c.text(xx+2, 689, "+ 添加选项", 12, MUTED)
    check(c, 1145, 741)
    c.text(1175, 741, "在当前视图中显示", 14)
    c.text(1145, 780, "其他视图的显示列不自动改变。", 12, MUTED)
    c.button(1500, 829, "取消", False, 70)
    c.button(1582, 829, "创建属性", True, 116)
    c.pin(1736, 270, 2)

    c.rect((40, 950, 1760, 1022), "#E9EEE4", radius=4)
    c.text(65, 969, "手机沿用相同规则", 15, INK, True)
    c.text(250, 969, "点击属性后使用底部编辑面板，不把桌面小菜单原样缩小；可用“完成”关闭面板。", 15, MUTED)
    c.text(65, 996, "已确认：整体采用页面树与多视图布局；文章默认右侧打开，并可展开为整页。", 12, GREEN)
    c.notes([
        ("日常编辑直接在单元格完成", "更改先保存到本机，再同步；断网不阻止编辑，冲突必须保留双方值。"),
        ("属性定义与显示列分开", "创建的是库内属性；某个视图隐藏一列，不代表删除数据。"),
        ("危险操作另做保护", "删除属性、改成不兼容类型需说明影响；系统状态只读，不当成普通属性。"),
    ], 1060)
    c.text(40, 1201, "本轮仅确认主要操作位置；这是静态演示，不包含实际保存、同步或可点击菜单。", 13, MUTED)
    c.save("07-property-editing.png")


def view_board():
    c = Canvas(
        "08 / 视图细节 · 建一个视图，不复制一份数据",
        "区分四个动作：新建视图、调整视图、编辑记录、删除视图。筛选后的内容仍来自原资料库。",
        "08", 1250, version="V0.2",
    )
    c.rect((40, 136, 878, 1000), PAPER, LINE)
    c.text(65, 159, "A · 点击视图栏 ＋", 23, INK, True)
    c.views(66, 218, "表格")
    c.pin(558, 225, 1)
    px, py, pw = 305, 275, 510
    c.rect((px+4, py+5, px+pw+4, py+664), "#EDF0E9", radius=5)
    c.rect((px, py, px+pw, py+660), PAPER, "#CCD4C5", 5)
    c.text(px+20, py+22, "新增视图", 20, INK, True)
    c.text(px+20, py+70, "视图名称", 14, MUTED)
    input_field(c, px+20, py+99, pw-40, "Linux 待读", True)
    c.text(px+20, py+165, "选择表现形式", 14, MUTED)
    types = [("表格", "table"), ("看板", "board"), ("列表", "list"), ("画廊", "gallery"), ("日历", "calendar"), ("时间轴", "timeline")]
    for i, (label, icon) in enumerate(types):
        yy = py+205+i*51
        active = label == "表格"
        if active:
            c.rect((px+12, yy-8, px+pw-12, yy+33), BLUE_LIGHT, radius=3)
        c.icon(icon, px+23, yy+2, BLUE if active else MUTED)
        c.text(px+56, yy, label, 16, BLUE if active else INK, active)
        if active:
            c.icon("check", px+pw-43, yy+1, BLUE)
    c.line((px+20, py+523, px+pw-20, py+523))
    c.text(px+20, py+543, "数据来源：微信公众号剪藏", 13, MUTED)
    c.text(px+20, py+571, "创建后设置筛选，不会另建资料库。", 12, MUTED)
    c.button(px+20, py+608, "创建视图", True, pw-40, 34)
    c.text(65, 964, "可以建立多个表格视图；名字、类型与筛选条件分别保存。", 13, MUTED)

    c.rect((901, 136, 1760, 1000), PAPER, LINE)
    c.text(926, 159, "B · 设置“Linux 待读”表格视图", 23, INK, True)
    c.chip(926, 207, "当前视图：Linux 待读", "blue", 13)
    c.text(1265, 215, "数据源：微信公众号剪藏", 13, MUTED)
    c.line((925, 250, 1735, 250))
    c.text(928, 274, "筛选", 16, INK, True)
    c.text(1114, 277, "同时满足以下条件", 13, MUTED)
    for yy, label in ((311, "标签    包含    Linux"), (362, "阅读状态    等于    未读")):
        c.rect((1114, yy, 1707, yy+40), "#F7F9F4", LINE, 4)
        c.text(1128, yy+12, label, 14)
        c.text(1671, yy+10, "×", 19, MUTED)
    c.text(1115, 422, "+ 添加条件", 13, BLUE)
    c.line((925, 462, 1735, 462))
    c.text(928, 486, "排序", 16, INK, True)
    c.text(1115, 489, "收藏时间    从新到旧", 14)
    c.line((925, 533, 1735, 533))
    c.text(928, 558, "显示属性", 16, INK, True)
    rows = [("标题", True, "必显"), ("AI 简介", True, ""), ("标签", True, ""), ("阅读状态", True, ""), ("原始链接", False, "隐藏不删除"), ("掌握程度", False, "其他视图可显示")]
    for i, (label, active, suffix) in enumerate(rows):
        yy = 558+i*38
        for dx in (0, 5):
            for dy in (3, 8, 13):
                c.rect((1117+dx, yy+dy, 1118+dx, yy+dy+1), MUTED)
        c.text(1145, yy+1, label, 14)
        c.text(1320, yy+2, suffix, 12, MUTED)
        check(c, 1682, yy, active)
    c.line((925, 807, 1735, 807))
    c.text(928, 831, "显示细节", 16, INK, True)
    c.text(1115, 832, "行高：紧凑       标题换行：关闭", 14)
    c.text(928, 883, "删除此视图", 13, "#AD5C55")
    c.text(1115, 883, "仅移除“Linux 待读”，不删除库中的文章。", 13, MUTED)
    c.line((925, 924, 1735, 924))
    c.text(928, 947, "视图设置自动保存并同步；各设备分别记住当前选中的视图。", 13, MUTED)
    c.pin(1725, 275, 2)
    c.pin(1725, 884, 3)

    c.notes([
        ("这是一个新的查看入口", "同一资料库可保存多个同类型视图；不复制文章，也不额外生成快照。"),
        ("筛选不会移动或删除资料", "已读文章会退出“待读”筛选，但仍在原库；界面应给出明确提示。"),
        ("删除视图与删除记录分开", "设置仅调整展示；记录的删除属于数据操作，仍要进入回收站。"),
    ], 1040)
    c.text(40, 1196, "看板设置分组属性；日历与时间轴设置日期属性。只在对应视图显示适用选项，不堆无效按钮。", 13, MUTED)
    c.save("08-view-settings.png")


if __name__ == "__main__":
    property_board()
    view_board()
    print("Rendered 07-property-editing.png and 08-view-settings.png")
