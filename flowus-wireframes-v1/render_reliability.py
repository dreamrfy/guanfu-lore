from PIL import Image, ImageDraw, ImageFont

from render_wireframes import (
    Canvas, ROOT, FONT, BOLD, ITEMS, INK, MUTED, LINE, PAPER, BLUE,
    BLUE_LIGHT, GREEN, AMBER, RED, BG,
)


def notice(c, box, title, body, tone="amber"):
    colors = {
        "amber": ("#FCF5E9", AMBER),
        "green": ("#EFF5EC", GREEN),
        "blue": (BLUE_LIGHT, BLUE),
        "red": ("#FAEFEC", RED),
    }
    fill, color = colors[tone]
    x, y, right, bottom = box
    c.rect(box, fill, radius=4)
    c.rect((x, y, x+3, bottom), color)
    c.text(x+17, y+14, title, 15, color, True)
    c.wrap(x+17, y+42, body, right-x-34, 13, MUTED, leading=23)


def progress(c, x, y, width, ratio, color=BLUE):
    c.rect((x, y, x+width, y+6), "#E5EADD", radius=3)
    if ratio:
        c.rect((x, y, x+max(6, width*ratio), y+6), color, radius=3)


def task_failure():
    c = Canvas(
        "09 / 任务与同步 · 哪一步失败，就处理哪一步",
        "收到链接、完整存档、AI 解析是不同阶段；不能用一个成功标记把它们混在一起。",
        "09", 1250, version="V0.3",
    )
    c.shell("任务与同步")
    c.rect((50, 869, 260, 904), "#E6EBF6", radius=4)
    c.icon("download", 62, 877, INK)
    c.text(89, 877, "任务与同步", 14, INK, True)
    c.text(307, 216, "任务与同步", 31, INK, True)
    c.text(307, 263, "处理问题，不打断正常阅读。", 15, MUTED)
    c.chip(307, 306, "全部  4", "blue", 14)
    c.text(421, 313, "需处理  2", 14, AMBER)
    c.text(543, 313, "进行中  1", 14, MUTED)
    c.text(665, 313, "已完成  1", 14, MUTED)
    c.text(946, 314, "云端处理任务", 12, MUTED)
    c.line((306, 351, 1092, 351))
    tasks = [
        (5, "正文与图片存档", "存档失败", "未获得完整内容；不能标记为已存档。", "查看原因"),
        (6, "AI 摘要与标签", "生成失败", "正文与图片已存好，仍可正常阅读。", "查看原因"),
        (3, "正文与图片存档", "存档中", "正在下载图片；完整校验后才算成功。", "查看进度"),
        (0, "正文与图片 + AI", "已完成", "存档 v1 与 AI 解读分别保存。", "打开文章"),
    ]
    for i, (idx, stage, status, body, action) in enumerate(tasks):
        yy = 375+i*128
        if i == 0:
            c.rect((298, yy-10, 1096, yy+105), BLUE_LIGHT, radius=4)
        c.fit(316, yy+4, ITEMS[idx]["title"], 559, 17, INK, True)
        if status == "已完成":
            c.chip(964, yy+1, status, "green", 13)
        else:
            c.status(964, yy+1, status, 13)
        c.text(316, yy+39, stage, 13, MUTED)
        c.text(316, yy+67, body, 13, MUTED)
        c.text(977, yy+70, action, 13, BLUE)
        c.line((306, yy+115, 1092, yy+115))
    c.text(309, 917, "打开资料库时，记录本身也显示异常；不要求你总来任务页检查。", 13, MUTED)

    c.line((1120, 183, 1120, 999))
    c.text(1147, 218, "存档未完成", 24, INK, True)
    c.fit(1147, 263, ITEMS[5]["title"], 575, 15)
    notice(c, (1147, 306, 1726, 409), "没有完整快照", "示例原因：来源页面要求访问验证，系统已停止获取。不会尝试绕过验证或访问限制。", "red")
    stages = [("已收到链接", "已记录标题与来源，不代表内容已保存", "green"), ("正文与图片存档", "未完成 · 原因已保留，可稍后再次检查", "red"), ("AI 解析", "尚未开始 · 需要先获得可处理的正文", "gray")]
    for i, (title, body, tone) in enumerate(stages):
        yy = 447+i*83
        c.chip(1147, yy, str(i+1), tone, 13)
        c.text(1193, yy+1, title, 16, INK, True)
        c.wrap(1193, yy+31, body, 518, 13, MUTED, leading=22)
    c.button(1147, 717, "再次尝试存档", True, 146, 38)
    c.button(1306, 717, "查看原文", False, 108, 38)
    c.text(1147, 775, "仅对临时网络问题有限重试；访问受限时暂停。", 13, MUTED)
    c.text(1147, 805, "再次失败仍保留这条记录，不显示“收藏成功”。", 13, MUTED)
    c.line((1147, 852, 1726, 852))
    c.text(1147, 878, "如果失败的是 AI 呢？", 17, INK, True)
    c.wrap(1147, 912, "只重新生成 AI 结果，不重复剪藏；重试同样受预算限制，已有摘要保留为历史版本。", 570, 13, MUTED, leading=24)
    c.pin(1100, 380, 1)
    c.pin(1732, 319, 2)
    c.pin(1732, 887, 3)
    c.notes([
        ("成功要具体到阶段", "收到链接只说明接收成功；图片或正文不完整，就不能显示完整存档成功。"),
        ("失败说明原因与下一步", "验证、限流与删除不是一回事；不确定的原因明确说不确定，不承诺重试能解决。"),
        ("AI 失败不影响原文", "摘要单独重试且限制费用；不重新下载、不覆盖已有快照和历史 AI 结果。"),
    ], 1041)
    c.text(40, 1201, "静态状态设计：不代表微信接收、云端获取正文图片或通知接口已经验证可用。", 13, MUTED)
    c.save("09-task-failures.png")


def offline_states():
    c = Canvas(
        "10 / 本机离线 · 开了开关，也要等完整下载",
        "云端存档是完整书库；离线保存是这台设备的一份副本。先同步目录，不等于全文已下载。",
        "10", 1250, version="V0.3",
    )
    blocks = [
        (40, 590, "A · 正在下载", "还没存完整，暂不能保证离线阅读"),
        (614, 1164, "B · 云端有更新", "新版未下好时，旧版仍然能读"),
        (1188, 1760, "C · 清理本机副本", "只清理本机，不碰云端与未同步修改"),
    ]
    for left, right, title, desc in blocks:
        c.rect((left, 136, right, 1010), PAPER, LINE)
        c.text(left+24, 161, title, 23, INK, True)
        c.wrap(left+24, 205, desc, right-left-48, 14, MUTED, leading=23)

    x = 64
    c.wrap(x, 280, ITEMS[0]["title"], 500, 21, INK, True, leading=32)
    c.text(x, 340, "云端：快照 v1 已存档", 14, GREEN)
    c.line((x, 380, 565, 380))
    c.text(x, 408, "保存在此设备", 17, INK, True)
    c.rect((505, 403, 558, 429), BLUE, radius=13)
    c.d.ellipse((535, 406, 555, 426), fill=PAPER)
    c.status(x, 454, "下载中", 14)
    c.text(400, 460, "12 / 18 项", 14, MUTED)
    progress(c, x, 504, 493, 12/18)
    c.text(x, 533, "正文已下载，图片尚未齐全。", 15)
    c.text(x, 569, "下载完成并校验后，才显示“离线可用”。", 13, MUTED)
    c.button(x, 626, "暂停下载", False, 115, 38)
    notice(c, (x, 700, 565, 819), "网络断开时暂停", "保留已下载进度，联网后继续。下载失败只重试未完成资源，不把半份快照标成完整。")
    c.text(x, 857, "等待下载 → 下载中 → 离线可用", 14)
    c.text(x, 894, "也可能显示：已暂停 / 下载失败 / 空间不足", 12, MUTED)
    c.text(x, 938, "正文、图片和附件大小均为演示信息。", 12, MUTED)

    x = 638
    c.wrap(x, 280, ITEMS[0]["title"], 500, 21, INK, True, leading=32)
    c.text(x, 340, "本机 v1 · 云端 v2", 14, MUTED)
    notice(c, (x, 395, 1138, 499), "旧版离线可读，新版等待下载", "当前显示本机 v1。v2 的正文与图片全部下载并校验后，再切换为新版。", "blue")
    c.button(x, 534, "阅读本机 v1", True, 139, 38)
    c.button(x+151, 534, "下载新版", False, 111, 38)
    c.line((x, 617, 1138, 617))
    c.text(x, 646, "不会先删旧版，再去下载新版", 18, INK, True)
    c.wrap(x, 691, "断网、下载失败或空间不够时，旧版仍保留。切换版本后也保留云端历史记录，不把更新当作覆盖历史。", 494, 15, MUTED, leading=28)
    c.text(x, 827, "当前设备的默认设置", 16, INK, True)
    c.text(x, 865, "新内容：按需下载", 14)
    c.text(x, 899, "离线下载：仅 Wi-Fi，可手动临时继续", 13, MUTED)
    c.text(x, 938, "可逐篇开启；手机和电脑分别设置。", 12, MUTED)

    x = 1212
    c.text(x, 280, "设置 / 本机离线与空间", 19, INK, True)
    c.text(x, 331, "此设备：安卓手机", 14, MUTED)
    c.line((x, 380, 1736, 380))
    c.text(x, 408, "可清理的离线副本", 17, INK, True)
    c.text(x, 447, "8 篇 · 24 MB（示例）", 15, MUTED)
    notice(c, (x, 495, 1736, 621), "2 份内容含未同步修改 · 已保护", "笔记、导图和待上传附件不能随本机缓存一起清理。先同步或导出备份，再决定是否释放空间。")
    c.button(x, 663, "清理可清理副本", False, 161, 38)
    c.wrap(x, 731, "清理后，云端内容仍保留，联网可以重新打开。此操作会取消所选内容在这台设备的离线保留，不影响其他设备。", 514, 14, MUTED, leading=27)
    c.line((x, 848, 1736, 848))
    c.text(x, 877, "网页端要额外说明", 16, INK, True)
    c.wrap(x, 915, "浏览器可能回收本地存储；网页离线副本不能当作永久备份。", 510, 13, MUTED, leading=24)
    c.pin(567, 450, 1)
    c.pin(1140, 403, 2)
    c.pin(1740, 503, 3)
    c.notes([
        ("开关表示意愿，状态表示结果", "开启表示希望保留；完整下载并校验，才表示实际可离线阅读。"),
        ("版本更新不切断阅读", "旧版继续可读；新版下载和校验完成后再替换，失败时不清空旧副本。"),
        ("自己的创作优先保护", "未同步笔记、导图和上传任务受保护；清缓存不等于删除资料。"),
    ], 1047)
    c.text(40, 1200, "嵌入的表格不等于下载了全部记录；离线笔记可以展示已有目录，未下载正文仍需明确提示。", 13, MUTED)
    c.save("10-offline-states.png")


def conflict_resolution():
    c = Canvas(
        "11 / 修改冲突 · 两份先保住，再决定怎么合并",
        "同一篇笔记在 Windows 和安卓离线修改：不用“最后上传的”直接覆盖，不把保留两份藏进角落。",
        "11", 1340, version="V0.3",
    )
    c.rect((40, 136, 1760, 1082), PAPER, LINE)
    c.text(65, 160, "学习计划 / 网络排障笔记", 24, INK, True)
    c.text(1418, 170, "版本记录  ·  查看共同版本", 13, BLUE)
    notice(c, (65, 212, 1735, 302), "发现两份不同修改，尚未覆盖任一版本", "共同版本之后，Windows 与安卓都改过正文。以下已收到的两个分支都已留存；其他设备尚未上传的修改只能等联网后再检测。")
    panels = [(65, 883, "Windows · 当前设备", "本机已保存，尚未覆盖云端", "#EDF5FF"), (906, 1735, "安卓 · 已上传的版本", "云端已收到，来源可追溯", "#EFF5EC")]
    for idx, (x, right, title, desc, fill) in enumerate(panels):
        c.rect((x, 330, right, 582), "#FCFDFB", LINE, 4)
        c.text(x+18, 349, title, 18, INK, True)
        c.text(x+18, 384, desc, 13, MUTED)
        c.line((x+18, 417, right-18, 417))
        c.text(x+18, 440, "网络排障先确认 DNS、路由和端口映射。", 16)
        c.rect((x+14, 485, right-14, 531), fill, radius=3)
        c.text(x+26, 500, "补充：记录 DNS 查询命令与返回结果。" if idx == 0 else "补充：检查防火墙规则并记录放行端口。", 16, BLUE if idx == 0 else GREEN)
        c.text(x+18, 550, "示例版本 A · 修改时间仅供参考，不用于判定谁覆盖谁" if idx == 0 else "示例版本 B · 通过设备与版本区分，不靠时钟先后裁决", 12, MUTED)
    c.text(65, 613, "合并草稿", 21, INK, True)
    c.text(211, 620, "手动整理并确认后，保存为一个新版本；不会自动替你做决定。", 13, MUTED)
    c.rect((65, 657, 1735, 817), PAPER, "#AFC5DC", 4)
    c.text(86, 679, "网络排障先确认 DNS、路由和端口映射。", 16)
    c.text(86, 718, "补充：记录 DNS 查询命令与返回结果。", 16, BLUE)
    c.text(86, 757, "补充：检查防火墙规则并记录放行端口。", 16, GREEN)
    c.text(1271, 787, "示例合并稿 · 尚未提交", 12, MUTED)
    c.button(65, 846, "保存合并并同步", True, 161, 40)
    c.button(240, 846, "分别保留为两页", False, 161, 40)
    c.button(415, 846, "稍后处理", False, 105, 40)
    c.text(65, 913, "“分别保留”为原笔记 + 明确标注来源的副本；下一步选择哪份留在原页面，引用不静默改向。", 14, MUTED)
    c.text(65, 949, "同步前再检查云端版本；若出现新的修改，继续提示，不把旧合并稿强行覆盖上去。", 14, MUTED)
    c.line((65, 991, 1735, 991))
    c.text(65, 1017, "版本恢复", 16, INK, True)
    c.text(210, 1018, "预览旧版 → 恢复为新版本；当前版和冲突分支继续保留，历史不会被擦掉。", 14, MUTED)
    c.pin(1740, 225, 1)
    c.pin(1727, 661, 2)
    c.pin(1727, 1024, 3)
    c.notes([
        ("等待处理不等于丢掉修改", "本机编辑持续保存；冲突未解决前，相关内容不显示“全部已同步”。"),
        ("合并是明确的数据操作", "可手动合并、保留两页或稍后处理；保留两页时说明原页面和引用归属。"),
        ("恢复历史也要可撤回", "恢复写成新版本；属性、视图和导图也遵守保留冲突、可预览恢复的原则。"),
    ], 1120)
    c.text(40, 1288, "属性被删除而另一台设备仍在编辑、删除与编辑相撞等情况，同样保留可恢复内容，不静默清空。", 13, MUTED)
    c.save("11-sync-conflicts.png")


def curve(c, start, end, color="#C8D2C2", width=2):
    x0, y0 = start
    x1, y1 = end
    delta = (x1-x0)*0.5
    points = []
    for i in range(41):
        t = i/40
        r = 1-t
        points.append((r**3*x0+3*r*r*t*(x0+delta)+3*r*t*t*(x1-delta)+t**3*x1, r**3*y0+3*r*r*t*y0+3*r*t*t*y1+t**3*y1))
    c.line(points, color, width)


def node(c, box, label, selected=False, root=False, folded=None):
    x, y, right, bottom = box
    c.rect(box, "#EEF2E8" if root else BLUE_LIGHT if selected else PAPER, BLUE if selected else "#C5D0BE", 6, 2 if selected else 1)
    size = 20 if root else 16
    c.text(x+(right-x-c.width(label, size, root))/2, y+(bottom-y-size)/2, label, size, INK, root)
    if folded:
        c.chip(right+6, y+12, folded, "gray", 11)


def mindmap_page():
    c = Canvas(
        "12 / 思维导图 · 先把手动整理做顺手",
        "与笔记使用相同页面树、引用和版本机制；第一版只做节点、层级、折叠与可靠保存。",
        "12", 1250, version="V0.3",
    )
    c.shell("学习路线")
    c.text(307, 215, "容器网络学习路线", 29, INK, True)
    c.text(1430, 222, "已保存在本机 · 等待联网同步", 12, AMBER)
    c.text(307, 263, "技术知识 / 学习路线", 13, MUTED)
    for xx, label, width in ((307, "新增子节点", 117), (436, "新增同级", 103), (551, "修改文字", 103), (667, "调整层级", 103)):
        c.button(xx, 303, label, False, width, 36)
    c.text(814, 314, "撤销    重做", 14, MUTED)
    c.text(1438, 314, "−    100%    +      适应画布", 14, MUTED)
    c.line((286, 354, 1742, 354))
    c.rect((286, 355, 1742, 874), "#FCFDFB")
    for xx in range(303, 1738, 22):
        for yy in range(374, 866, 22):
            c.d.ellipse((xx, yy, xx+1, yy+1), fill="#E8ECE3")
    root = (337, 555, 561, 619)
    parents = [(739, 416, 933, 466), (739, 562, 933, 612), (739, 709, 933, 759)]
    leaves = [(1116, 384, 1394, 430), (1116, 450, 1394, 496), (1116, 530, 1394, 576), (1116, 596, 1394, 642), (1116, 676, 1394, 722), (1116, 742, 1394, 788)]
    for p in parents:
        curve(c, (root[2], 587), (p[0], (p[1]+p[3])/2))
    for i, p in enumerate(parents):
        for leaf in leaves[i*2:i*2+2]:
            curve(c, (p[2], (p[1]+p[3])/2), (leaf[0], (leaf[1]+leaf[3])/2))
    node(c, root, "容器网络", root=True)
    for i, (box, label) in enumerate(zip(parents, ("核心概念", "排查路径", "阅读与实践"))):
        node(c, box, label, selected=i == 1)
    for box, label in zip(leaves, ("网络模式", "地址与路由", "DNS 查询", "端口与防火墙", "整理排障笔记", "待展开的实践案例")):
        node(c, box, label, folded="+ 3" if label == "待展开的实践案例" else None)
    c.text(313, 832, "选中节点后按需操作 · 空白区域拖动移动画布", 12, MUTED)

    mx, my, mr = 1466, 384, 1722
    c.rect((mx+3, my+4, mr+3, 805), "#EEF1EA", radius=5)
    c.rect((mx, my, mr, 801), PAPER, "#CFD7C8", 5)
    c.text(mx+16, my+18, "选中：排查路径", 15, INK, True)
    c.line((mx+13, my+53, mr-13, my+53))
    for i, (label, shortcut) in enumerate((("修改文字", "F2"), ("新增子节点", "Tab"), ("新增同级节点", "Enter"), ("提升一级", ""), ("降低一级", ""), ("展开 / 折叠分支", ""))):
        yy = my+75+i*43
        c.text(mx+17, yy, label, 14)
        if shortcut:
            c.text(mr-64, yy+1, shortcut, 12, MUTED)
    c.line((mx+13, 734, mr-13, 734))
    c.text(mx+17, 756, "删除此分支（3 个节点）", 13, RED)
    c.text(307, 905, "引用本页  1", 14, INK, True)
    c.text(462, 905, "Linux 学习计划", 14, BLUE)
    c.text(1127, 907, "版本记录    ·    保存在此设备", 13, MUTED)
    c.text(307, 951, "手机：点选节点后使用底部工具栏；缩放和移动画布，功能不依赖悬停或键盘。", 13, MUTED)
    c.pin(1452, 399, 1)
    c.pin(1730, 766, 2)
    c.pin(1730, 226, 3)
    c.notes([
        ("节点先满足日常整理", "修改文字、增删同级与子级、调整层级和折叠；AI 自动生成导图留到后续。"),
        ("删分支要说明影响范围", "删除包含子节点时说明数量，并可撤销；调整层级也提供菜单，不只靠拖动。"),
        ("离线编辑继续可靠保存", "本机已保存与云端已同步分开；冲突按版本保留，不覆盖另一设备的导图。"),
    ], 1040)
    c.text(40, 1200, "反向引用针对整张导图页面；第一版不做节点级双链、知识关系图谱或复杂自由绘图。", 13, MUTED)
    c.save("12-mindmap-editor.png")


def overview():
    paths = [ROOT / name for name in (
        "09-task-failures.png", "10-offline-states.png",
        "11-sync-conflicts.png", "12-mindmap-editor.png",
    )]
    sheet = Image.new("RGB", (1800, 1510), BG)
    d = ImageDraw.Draw(sheet)
    d.text((40, 26), "第三轮草图 · 异常处理、离线与导图", fill=INK, font=ImageFont.truetype(BOLD, 31))
    d.text((40, 78), "V0.3 / 全部为静态演示，不代表下载、同步或剪藏已实现", fill=MUTED, font=ImageFont.truetype(FONT, 17))
    for i, path in enumerate(paths):
        with Image.open(path) as im:
            preview = im.copy()
            preview.thumbnail((840, 670), Image.Resampling.LANCZOS)
            x, y = 40+(i % 2)*880, 128+(i // 2)*690
            sheet.paste(preview, (x, y))
            d.text((x+5, y+preview.height+10), path.name, fill=MUTED, font=ImageFont.truetype(FONT, 13))
    sheet.save(ROOT / "reliability-overview.png")


if __name__ == "__main__":
    task_failure()
    offline_states()
    conflict_resolution()
    mindmap_page()
    overview()
    print("Rendered boards 09-12 and reliability-overview.png")
