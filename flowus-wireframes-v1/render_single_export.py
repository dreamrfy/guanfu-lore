from render_wireframes import Canvas, INK, MUTED, LINE, PAPER, BLUE, BLUE_LIGHT, GREEN
from render_details import check, input_field
from render_reliability import notice


def single_export():
    c = Canvas(
        "18 / 单篇导出 · 给别人一份能直接打开的文件",
        "文章与笔记页 → 更多 → 导出当前页。只带走明确选择的内容，不公开知识库，也不生成在线分享链接。",
        "18", 1360, version="V0.5",
    )
    c.rect((40, 136, 1760, 1117), PAPER, LINE)
    c.text(65, 160, "导出当前页", 27, INK, True)
    c.text(65, 208, "示例：Docker 容器网络 · 我的阅读笔记", 15, MUTED)
    c.text(1455, 174, "静态设计 · 非真实导出文件", 12, MUTED)
    c.line((65, 249, 1735, 249))

    c.text(65, 280, "1  选择格式", 19, INK, True)
    for x, title, subtitle, selected in (
        (65, "HTML · 完整离线网页", "一个文件，浏览器打开", True),
        (465, "PDF · 阅读与打印", "分页排版，文字可复制", False),
    ):
        c.rect((x, 326, x+377, 416), BLUE_LIGHT if selected else PAPER, BLUE if selected else LINE, 5)
        c.text(x+18, 343, title, 17, BLUE if selected else INK, True)
        c.text(x+18, 380, subtitle, 13, MUTED)
        if selected:
            c.icon("check", x+337, 345, BLUE)
    c.text(65, 449, "2  选择包含哪些内容", 19, INK, True)
    options = [
        ("当前页正文与图片", "必含 · 不能只导出链接或文字", True),
        ("来源说明与原始链接", "转载内容保留来源，不混淆作者", True),
        ("AI 解读", "默认不带；选择后独立注明 AI 生成", False),
        ("页面属性与标签", "默认不带，防止私人备注意外外发", False),
        ("引用本页的页面清单", "默认不带，不暴露整库关联目录", False),
    ]
    for i, (title, desc, active) in enumerate(options):
        yy = 497+i*48
        check(c, 65, yy, active)
        c.text(98, yy, title, 14, INK, True)
        c.text(377, yy+1, desc, 12, MUTED)
    notice(c, (65, 762, 843, 877), "只导出当前页，不自动带走关联页面", "嵌入表格转成已选范围的静态表格，预览时检查；页面引用不递归打包正文。视频、外部嵌入与原附件不冒充已完整包含。", "blue")
    c.text(65, 906, "3  预览并检查", 19, INK, True)
    c.text(65, 946, "检查图片、宽表格、代码、来源和私人信息后再保存文件。", 14, MUTED)
    c.button(65, 1003, "预览导出效果", False, 146, 39)
    c.button(226, 1003, "保存 HTML 文件", True, 171, 39)
    c.text(65, 1071, "资源缺失时暂停完整导出，列出缺失项；不显示“完整导出成功”。", 12, MUTED)

    c.line((880, 276, 880, 1090))
    c.text(909, 280, "HTML 阅读效果示意", 19, INK, True)
    c.rect((909, 326, 1735, 589), "#FCFDFB", LINE, 4)
    c.rect((910, 327, 1734, 362), "#F1F3EE", radius=3)
    c.text(927, 338, "本地文件 · Docker 容器网络-阅读笔记.html", 12, MUTED)
    c.text(934, 389, "Docker 容器网络 · 我的阅读笔记", 23, INK, True)
    c.text(934, 435, "个人笔记  /  引用来源：云原生手记  /  导出版本与日期", 12, MUTED)
    c.text(934, 477, "从 DNS、路由到端口映射，按路径记录检查方法。", 16)
    c.rect((934, 519, 1708, 568), "#EDF1E8", LINE, 4)
    c.text(968, 535, "正文图片随文件保存  ·  断网打开，不需要登录本软件", 14, GREEN)
    c.text(909, 617, "PDF 阅读效果示意（另一种格式，不是网页长截图）", 17, INK, True)
    for i, x in enumerate((998, 1358)):
        c.rect((x+4, 663, x+307, 1064), "#EBEEE5")
        c.rect((x, 659, x+303, 1060), PAPER, "#CBD3C3")
        if i == 0:
            c.text(x+20, 685, "Docker 容器网络", 18, INK, True)
            c.text(x+20, 717, "我的阅读笔记", 15)
            c.line((x+20, 758, x+283, 758))
            c.text(x+20, 785, "一、排查顺序", 15, INK, True)
            c.wrap(x+20, 821, "先看域名解析，再看路由与端口映射。保留文字，不把整篇转成图片。", 259, 14, MUTED, leading=25)
            c.rect((x+20, 929, x+283, 993), "#EFF3EB", LINE, 3)
            c.text(x+44, 951, "容器 → 网桥 → 网络", 13, MUTED)
        else:
            c.text(x+20, 685, "二、验证与记录", 17, INK, True)
            c.wrap(x+20, 727, "长表格按宽度与分页规则处理；代码避免裁切，图片按比例保留。", 259, 14, MUTED, leading=25)
            c.text(x+20, 846, "来源与引用", 15, INK, True)
            c.wrap(x+20, 883, "外部来源保留说明。未包含的关联内容明确标注，不伪造可用链接。", 259, 13, MUTED, leading=24)
        c.line((x+20, 1017, x+283, 1017))
        c.text(x+20, 1031, "个人阅读笔记", 10, MUTED)
        c.text(x+263, 1031, str(i+1), 10, MUTED)
    c.pin(855, 335, 1)
    c.pin(855, 774, 2)
    c.pin(1740, 670, 3)
    c.notes([
        ("HTML 以单文件为默认", "正文、图片和样式内嵌；不依赖原文热链、登录或在线字体。缺失资源要提示。"),
        ("只导出你选择的内容", "不带整库、不带版本历史；AI 与私人属性默认不带，引用不递归泄露关联资料。"),
        ("PDF 以阅读体验为目标", "文字可搜索、可复制，图片清楚，合理分页；不是要求像素级复刻来源网页。"),
    ], 1150)
    c.text(40, 1310, "本页仅展示单篇导出功能设计，未生成真实 HTML/PDF 成品。传播第三方内容仍需注意作者授权与使用范围。", 13, MUTED)
    c.save("18-single-page-export.png")


if __name__ == "__main__":
    single_export()
    print("Rendered 18-single-page-export.png")
