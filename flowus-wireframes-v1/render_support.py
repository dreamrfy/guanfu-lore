from PIL import Image, ImageDraw, ImageFont

from render_wireframes import (
    Canvas, ROOT, FONT, BOLD, ITEMS, INK, MUTED, LINE, PAPER,
    BLUE, BLUE_LIGHT, GREEN, AMBER, RED, BG,
)
from render_details import input_field, check
from render_reliability import notice, progress


def search_page():
    c = Canvas(
        "13 / 搜索 · 找到内容，也说清楚查到了哪里",
        "先按关键词查找，再按属性缩小范围；联网全文搜索与离线本机搜索不能假装完全相同。",
        "13", 1250, version="V0.4",
    )
    c.shell("搜索")
    c.rect((50, 207, 260, 240), "#E6EBF6", radius=4)
    c.icon("search", 62, 215, INK)
    c.text(89, 215, "搜索", 14, INK, True)
    c.text(307, 218, "搜索知识库", 30, INK, True)
    input_field(c, 307, 279, 778, "Linux", True)
    c.icon("search", 1046, 292, BLUE)
    xx = 307
    for label in ("类型：全部", "标签：不限", "来源：不限", "时间：不限"):
        xx += c.chip(xx, 341, label, "gray", 13)+10
    c.text(307, 393, "找到 3 项", 15, INK, True)
    c.text(467, 395, "相关程度排序", 13, MUTED)
    c.text(867, 395, "联网 · 云端索引", 13, GREEN)
    c.line((306, 429, 1094, 429))
    results = [
        ("Linux 日志排查的 10 个实用方法", "文章 · 微信公众号剪藏", "标题", "从 Linux 系统日志入手，结合时间窗口和关键字定位问题。", "原始快照正文", "本机未保留 · 联网可读"),
        ("Linux 学习计划", "笔记 · 技术知识", "标题与正文", "本周先了解 Linux 网络工具，再把排障经验整理成清单。", "自己的笔记", "本机已保存"),
        ("Docker 容器网络：从原理到排障", "文章 · 微信公众号剪藏", "AI 解读", "关联 Linux 网络命令，梳理 DNS、路由与端口映射的检查顺序。", "AI 生成内容", "本机未保留 · 联网可读"),
    ]
    for i, (title, path, match, snippet, kind, local) in enumerate(results):
        y = 455+i*157
        c.icon("doc", 309, y+1, MUTED)
        c.fit(338, y, title, 610, 18, INK, True)
        c.text(338, y+37, path, 12, MUTED)
        c.text(338, y+65, "命中："+match, 12, BLUE)
        c.wrap(338, y+91, snippet, 725, 14, "#5D665B", leading=23)
        c.text(338, y+126, kind, 11, MUTED)
        c.text(800, y+126, local, 11, MUTED)
        c.line((338, y+146, 1094, y+146))
    c.text(308, 959, "点结果打开原内容；AI 命中会进入 AI 解读，不冒充原文证据。", 12, MUTED)

    c.line((1121, 183, 1121, 999))
    c.text(1149, 219, "断网时，范围缩小但不误导", 20, INK, True)
    notice(c, (1149, 270, 1726, 399), "离线搜索 · 使用本机已有数据", "可查已同步标题、标签与摘要，以及本机已保存并建立索引的正文。尚未下载的全文不在本次搜索范围。", "blue")
    c.button(1149, 432, "仅看本机可打开", False, 171, 36)
    c.text(1149, 501, "无结果时，不写“知识库没有”", 19, INK, True)
    c.rect((1149, 550, 1726, 755), "#FAFBF8", LINE, 4)
    c.icon("search", 1171, 574, MUTED, 21)
    c.text(1213, 577, "当前范围没有匹配结果", 17, INK, True)
    c.wrap(1171, 622, "可以换个关键词、清除筛选；若当前离线，联网后再查未下载的全文。", 526, 14, MUTED, leading=26)
    c.button(1171, 704, "清除筛选", False, 112)
    c.text(1312, 713, "保留当前关键词", 12, MUTED)
    c.line((1149, 799, 1726, 799))
    c.text(1149, 829, "附件搜索边界", 16, INK, True)
    c.wrap(1149, 868, "第一版先支持文件名、属性和已支持的可提取文本。不承诺所有 Office、扫描件或图片都能搜到正文，也不自动加入 OCR。", 570, 13, MUTED, leading=25)
    c.pin(1100, 396, 1)
    c.pin(1732, 282, 2)
    c.pin(1732, 577, 3)
    c.notes([
        ("搜索范围要看得见", "云端全文需要联网和索引完成；未建索引的内容也应提示，不悄悄漏掉。"),
        ("离线不假装能查全部全文", "目录、摘要和已下载正文分清；命中未下载内容时仍可看到元信息。"),
        ("无结果不等于没有资料", "保留关键词，提供清筛选与重试入口；断网不清空用户已经看到的结果。"),
    ], 1040)
    c.text(40, 1201, "搜索为关键词检索，不是知识库问答；AI 问答与语义检索仍留在后续阶段。", 13, MUTED)
    c.save("13-search-and-scope.png")


def ai_settings():
    c = Canvas(
        "14 / AI 接口 · 用自己的渠道，先测试再启用",
        "配置地址、密钥和模型；测试不发送私人文章，切换模型不自动重跑整个知识库。",
        "14", 1320, version="V0.4",
    )
    c.rect((40, 136, 1760, 1080), PAPER, LINE)
    c.text(65, 161, "设置 / AI 接口与自动解析", 26, INK, True)
    c.text(65, 209, "当前没有接入任何真实渠道。下面只演示配置页面。", 14, MUTED)
    c.line((65, 247, 1735, 247))
    c.text(65, 276, "渠道配置", 20, INK, True)
    c.text(65, 323, "配置名称", 14, MUTED)
    input_field(c, 65, 350, 788, "我的摘要渠道")
    c.text(65, 415, "接口协议", 14, MUTED)
    input_field(c, 65, 443, 788, "常用兼容协议 · 按渠道文档确认")
    c.text(65, 510, "接口地址", 14, MUTED)
    input_field(c, 65, 538, 788, "填写渠道提供的 HTTPS 地址")
    c.text(65, 604, "API 密钥", 14, MUTED)
    input_field(c, 65, 632, 788, "••••••••••••••••")
    c.text(65, 699, "模型名称", 14, MUTED)
    input_field(c, 65, 727, 788, "填写渠道实际支持的模型标识")
    c.button(65, 795, "发送小样本测试", False, 160, 38)
    c.button(239, 795, "保存配置", True, 116, 38)
    c.chip(381, 802, "未测试 · 不自动启用", "amber", 12)
    c.wrap(65, 858, "测试只发送内置短句，可能产生少量调用费用。保存配置不等于连接可用；测试失败保留填写内容，并显示地址、鉴权、模型或网络问题。", 788, 14, MUTED, leading=27)
    c.line((65, 957, 853, 957))
    c.text(65, 984, "可以保存多个渠道配置，再指定默认摘要模型。", 14, INK, True)
    c.text(65, 1022, "切换只作用于后续任务；已有 AI 结果不会被批量替换。", 13, MUTED)

    c.line((892, 271, 892, 1054))
    c.text(923, 276, "自动解析范围", 20, INK, True)
    c.text(1188, 281, "以下为启用后的策略，当前未生效", 12, MUTED)
    for y, title, desc, active in (
        (330, "公开剪藏文章", "正文成功存档后，按预算排队生成摘要与标签。", True),
        (438, "自己的笔记与附件", "默认关闭；只有主动选择后才发送。", False),
    ):
        c.text(923, y, title, 17, INK, True)
        c.wrap(923, y+36, desc, 680, 13, MUTED, leading=23)
        if active:
            c.rect((1668, y-1, 1721, y+25), BLUE, radius=13)
            c.d.ellipse((1698, y+2, 1718, y+22), fill=PAPER)
        else:
            c.chip(1606, y-1, "默认不自动发送", "gray", 12)
    c.text(923, 547, "模型、输入量、输出上限与重试次数都要有限制。", 14)
    c.wrap(923, 585, "失败自动重试不得无限循环；用户手动重新生成也计入同一预算。模型不可用时提示处理，不偷偷切换到更贵的渠道。", 797, 14, MUTED, leading=27)
    notice(c, (923, 697, 1735, 840), "后台处理意味着内容会交给你选择的渠道", "密钥需加密保存供后台调用，不出现在日志或普通导出中。这不等于端到端加密；使用客户资料前仍需先脱敏并主动授权。", "blue")
    c.text(923, 885, "价格与额度", 18, INK, True)
    c.text(923, 925, "可填写渠道费率，或接入渠道可提供的用量数据。", 14, MUTED)
    c.text(923, 961, "价格未知时不按 0 元处理，先暂停自动处理并提示配置。", 14, AMBER)
    c.text(923, 1006, "临时测试成功，也不代表长期稳定或任何协议都完全兼容。", 12, MUTED)
    c.pin(870, 800, 1)
    c.pin(1738, 709, 2)
    c.pin(1738, 963, 3)
    c.notes([
        ("测试与真实内容分开", "使用短样本确认接口；不为了测试，把文章、附件或整库内容发送出去。"),
        ("后台用密钥的边界透明", "只用于选定渠道的任务；不泄露到界面、日志、导出，撤销或更换可控。"),
        ("未知成本不是免费", "不同模型分别定价和限额；未能计价时不盲目自动调用。"),
    ], 1120)
    c.text(40, 1274, "本图中的地址、密钥与模型均为演示，不是真实配置；未向任何模型发送请求。", 13, MUTED)
    c.save("14-ai-configuration.png")


def usage_budget():
    c = Canvas(
        "15 / 用量与预算 · 估算不是账单，提醒不是停费",
        "总费用目标仍约 30 元 / 月；AI 预计 2–5 元。以下限额为可调整的建议值，所有用量均为示例。",
        "15", 1320, version="V0.4",
    )
    c.rect((40, 136, 1760, 1080), PAPER, LINE)
    c.text(65, 160, "设置 / 用量、费用与提醒", 26, INK, True)
    c.text(1450, 175, "2026 年 11 月 · 示例", 13, MUTED)
    c.line((65, 221, 1735, 221))
    c.text(65, 252, "AI 费用", 22, INK, True)
    c.chip(205, 252, "按配置费率估算", "amber", 12)
    c.text(65, 304, "已记录估算", 14, MUTED)
    c.text(65, 338, "2.30 元", 36, INK, True)
    c.text(318, 304, "处理中预留", 14, MUTED)
    c.text(318, 344, "+ 0.12 元", 25, MUTED)
    c.text(596, 304, "建议月度限额", 14, MUTED)
    c.text(596, 344, "5.00 元", 25)
    progress(c, 65, 410, 788, 2.42/5)
    c.text(65, 435, "预算占用 2.42 元（48%） · 完成后按返回用量核算", 13, MUTED)
    c.line((65, 485, 853, 485))
    for y, label, value in (
        (511, "提前提醒（建议值）", "4.00 元"),
        (559, "达到应用预算", "暂停新 AI 任务，并说明处理原因"),
        (607, "适用范围", "自动、手动生成、测试与失败重试"),
        (655, "未计价的任务", "暂停；不当成 0 元继续运行"),
    ):
        c.text(65, y, label, 14, MUTED)
        c.fit(320, y, value, 525, 14)
    notice(c, (65, 713, 853, 850), "应用限额不等于服务商账单硬上限", "请求前预留估算额度并限制输出；已发出的请求可能继续收费。账单延迟、费率差异和应用外用量，要到渠道后台核对。")
    c.text(65, 886, "用量明细", 18, INK, True)
    c.text(65, 925, "时间    渠道 / 模型    输入 / 输出用量    重试    估算费用", 13, MUTED)
    c.text(65, 963, "11/02 09:42    我的摘要渠道    记录已返回用量    0 次    0.01 元", 13)
    c.text(65, 1007, "查看逐次记录  →                 已确认账单与估算值分别显示", 13, BLUE)

    c.line((892, 249, 892, 1054))
    c.text(923, 252, "云存储与整体费用", 22, INK, True)
    c.text(923, 307, "总运行费目标", 14, MUTED)
    c.text(1207, 307, "约 30 元 / 月 · 不是报价保证", 15)
    c.text(923, 355, "接近 50 元提醒", 14, MUTED)
    c.text(1207, 355, "建议设为 45 元，可自行调整", 15)
    c.line((923, 402, 1735, 402))
    for y, name, value in (
        (432, "云端内容体积", "1.2 GB（示例测量值）"),
        (477, "本月下载流量", "1.8 GB（示例测量值）"),
        (522, "云服务账单 / 计价", "未接入 · 费用暂未知"),
        (567, "AI 服务商最终账单", "需核对 · 当前只有估算"),
    ):
        c.text(923, y, name, 14, MUTED)
        c.text(1207, y, value, 14, AMBER if "未知" in value else INK)
    notice(c, (923, 635, 1735, 785), "当前不能确认总费用，也不能保证总额提醒完整", "云服务计价或账单尚未接入，不拼出一个看似精确的总数。后续显示估算来源与更新时间，并建议同时开启云平台自身的费用告警。", "blue")
    c.text(923, 822, "超预算时不做这些事", 18, INK, True)
    c.text(923, 864, "不自动删文章、不停掉未同步修改的本机保存。", 14)
    c.text(923, 903, "可暂停新 AI 任务，但已占用存储仍可能继续计费。", 14, MUTED)
    c.wrap(923, 951, "免费额度、余额和账单不能混为一谈。渠道外其他软件使用同一密钥的费用，也不能冒充本应用可控制的用量。", 798, 13, MUTED, leading=25)
    c.pin(866, 420, 1)
    c.pin(866, 725, 2)
    c.pin(1738, 646, 3)
    c.notes([
        ("先预留，再结算", "运行中的任务也占预算，不能多个任务同时看到余额就各自无上限调用。"),
        ("尽力控调用，不承诺账单封顶", "应用内先控制请求；服务商的余额与硬限额能开则开，账单仍需核对。"),
        ("统计不完整就明说", "未知费用、延迟账单和缺失用量醒目提示；不会用虚假的 0 元制造安心感。"),
    ], 1120)
    c.text(40, 1274, "2.30 元、容量和流量仅用于演示状态，不是实际用量、服务报价或已经发生的扣费。", 13, MUTED)
    c.save("15-cost-and-budget.png")


def backup_export():
    c = Canvas(
        "16 / 备份与导出 · 带走内容，也保留恢复所需结构",
        "单篇阅读优先 HTML / PDF；这里管理整库迁移与备份。日常传文件与恢复数据库是不同入口。",
        "16", 1360, version="V0.5",
    )
    c.rect((40, 136, 1760, 1117), PAPER, LINE)
    c.text(65, 160, "设置 / 备份与导出", 26, INK, True)
    c.text(65, 208, "不导出应用保存的 API 密钥和登录凭据；文档本身可能仍含敏感信息，请妥善保存导出包。", 14, MUTED)
    c.line((65, 249, 1735, 249))
    c.text(65, 278, "A · 整库迁移与恢复", 21, INK, True)
    c.chip(65, 324, "范围：整个知识库", "blue", 13)
    c.text(299, 332, "也可选资料库或页面", 13, MUTED)
    c.text(65, 387, "通用格式导出", 18, INK, True)
    generic = [
        ("笔记", "HTML / PDF 阅读版；Markdown 保留迁移用途"),
        ("文章快照", "离线 HTML 或 PDF，保留图片与来源说明"),
        ("资料库", "CSV 数据 + JSON 属性与视图说明"),
        ("思维导图", "可读大纲 + 节点结构数据，不只给一张图片"),
        ("附件与 AI", "原始文件、独立 AI 结果，与原文分开放置"),
    ]
    for i, (title, body) in enumerate(generic):
        y = 433+i*53
        check(c, 65, y)
        c.text(97, y, title, 14, INK, True)
        c.wrap(229, y, body, 620, 13, MUTED, leading=23)
    c.text(65, 697, "只导出某篇？在内容页“更多 → 导出当前页”选择 HTML 或 PDF。", 13, BLUE)
    notice(c, (65, 730, 853, 851), "通用格式不保证完整复刻编辑体验", "Markdown、CSV 不能完整还原所有块布局、双链和多视图。结构数据另外提供，并附格式说明；需要完整恢复时选完整备份。")
    c.text(65, 889, "完整备份另保留", 18, INK, True)
    c.wrap(65, 931, "页面身份、层级、属性、视图、引用、版本及资源清单。备份包含格式版本，恢复前校验；不把同步副本自动称作独立备份。", 784, 14, MUTED, leading=27)
    c.button(65, 1045, "开始通用导出", True, 146, 38)
    c.button(226, 1045, "生成完整备份", False, 146, 38)

    c.line((892, 276, 892, 1088))
    c.text(923, 278, "B · 完整性与恢复检查", 21, INK, True)
    c.text(923, 330, "打包状态示例：18 / 20 项完成", 16)
    progress(c, 923, 373, 812, .9)
    notice(c, (923, 411, 1735, 546), "有 2 项资源未成功，不能显示完整成功", "保留失败清单，可重试缺失项；如果选择只导出已完成部分，文件名与清单都必须标注“部分导出”。", "red")
    c.button(923, 579, "重试缺失项", True, 132, 36)
    c.button(1070, 579, "仅导出可用部分", False, 160, 36)
    c.line((923, 660, 1735, 660))
    c.text(923, 692, "恢复不是直接覆盖当前知识库", 18, INK, True)
    for i, label in enumerate(("检查备份版本、校验值、资源是否齐全", "预览恢复范围，先恢复为独立恢复集", "核对页面、附件与引用后，再决定如何整理")):
        y = 739+i*44
        c.chip(923, y, str(i+1), "gray", 12)
        c.text(970, y+3, label, 14)
    c.text(923, 894, "导出与备份能包含什么时间点？", 17, INK, True)
    c.wrap(923, 936, "显示所用云端版本和打包时间；当前设备未同步内容单独列入并保留来源。其他设备未上传的修改无法包含，必须提醒。", 800, 13, MUTED, leading=25)
    c.text(923, 1033, "完整备份另存到独立位置后，才有另一份可用的恢复来源。", 13, GREEN)
    c.pin(867, 741, 1)
    c.pin(1738, 423, 2)
    c.pin(1738, 704, 3)
    c.notes([
        ("可读与可恢复分别保证", "通用包附格式和损失说明；恢复包保留结构，不能用 CSV 代替完整知识库备份。"),
        ("漏图片就不叫完整成功", "校验资源并列出缺失项；只导出部分内容必须由你明确选择，不能默认跳过。"),
        ("恢复先预览，避免二次损失", "校验并恢复到独立恢复集；不清空当前资料，引用映射与冲突单独报告。"),
    ], 1150)
    c.text(40, 1310, "自动备份频率、保留周期与独立存储位置将在实现方案中明确，并计入存储费用，不假设无限保留免费。", 13, MUTED)
    c.save("16-backup-and-export.png")


def onboarding_page():
    c = Canvas(
        "17 / 首次使用 · 先能记笔记，再逐步接入服务",
        "只有本人账号，没有公开注册、邀请成员或团队创建；AI 与微信接入不阻塞本机笔记使用。",
        "17", 1320, version="V0.4",
    )
    c.rect((40, 136, 1760, 1080), PAPER, LINE)
    c.text(65, 161, "首次进入本人知识库", 26, INK, True)
    c.text(65, 208, "账号由本人初始化，多端登录同一账号；具体登录与找回方式留给技术方案，不预设必须微信登录。", 14, MUTED)
    c.line((65, 250, 1735, 250))
    c.text(65, 282, "可以先使用，不用一次填完设置", 25, INK, True)
    c.text(65, 331, "你已经熟悉 FlowUs，只介绍这里不同的地方。", 15, MUTED)
    steps = [
        ("先写一页笔记", "创建普通页面即可开始，本机保存与同步状态分开显示。", "创建第一篇笔记", True),
        ("使用多视图资料库", "预置公众号剪藏库；也可加载可移除的示例，不混入真实收藏。", "查看示例资料库", False),
        ("之后再配置后台能力", "AI 可跳过，微信入口须逐项验证；未接入就明确显示未接入。", "稍后再设置", False),
    ]
    for i, (title, desc, action, primary) in enumerate(steps):
        y = 400+i*184
        c.chip(65, y, str(i+1), "blue" if primary else "gray", 15)
        c.text(118, y+2, title, 20, INK, True)
        c.wrap(118, y+44, desc, 681, 14, MUTED, leading=26)
        c.button(118, y+98, action, primary, 173, 38)
    c.text(65, 1000, "已有备份？先校验并预览，再导入，不覆盖现有资料。", 13, BLUE)

    c.line((892, 277, 892, 1054))
    c.text(923, 282, "微信接入检查 · 不把未验证当成功", 23, INK, True)
    notice(c, (923, 336, 1735, 459), "当前：未接入 / 待验证", "这里展示目标入口的状态，不要求你现在修改公众号配置。账号权限、实际消息接收、正文图片存档需要分别验证。", "amber")
    checkpoints = [
        ("1 账号权限", "已找到消息推送入口；入口存在不等于功能已可用。"),
        ("2 接收测试", "经你授权配置后，用测试文章验证是否收到有效链接。"),
        ("3 存档测试", "单独核验正文与图片是否完整、合规保存。"),
    ]
    for i, (title, desc) in enumerate(checkpoints):
        y = 501+i*102
        c.text(923, y, title, 17, INK, True)
        c.chip(1602, y-2, "待验证", "gray", 12)
        c.wrap(923, y+36, desc, 792, 13, MUTED, leading=24)
    c.line((923, 836, 1735, 836))
    c.text(923, 866, "没有内容的资料库，也提供下一步", 18, INK, True)
    c.wrap(923, 907, "空白页提供新建或导入入口；没有搜索结果提供清除筛选；配置失败保留已填内容，不让用户重来一遍。", 800, 14, MUTED, leading=27)
    c.text(923, 1019, "引导可跳过、可再次打开，不反复弹出，不强制购买服务号。", 13, GREEN)
    c.pin(868, 406, 1)
    c.pin(1738, 347, 2)
    c.pin(1738, 879, 3)
    c.notes([
        ("第一步完成真实的小任务", "先写笔记，不强迫先填服务密钥；已初始化的本机内容断网仍可用。"),
        ("微信是核心风险，不藏起来", "接收与存档分开验收；不把未完成能力画成成功，不把复杂入口当一键收藏已实现。"),
        ("没有内容也不让人迷路", "空白、筛选无结果、首次配置失败各有不同文案与下一步，不共用“暂无数据”。"),
    ], 1120)
    c.text(40, 1274, "这不是面向外部用户的注册流程；登录恢复与设备移除将在需求文档中保留安全要求，后续选型确定具体方式。", 13, MUTED)
    c.save("17-first-use.png")


def support_overview():
    paths = [ROOT/name for name in (
        "13-search-and-scope.png", "14-ai-configuration.png", "15-cost-and-budget.png",
        "16-backup-and-export.png", "17-first-use.png",
    )]
    sheet = Image.new("RGB", (1800, 2210), BG)
    d = ImageDraw.Draw(sheet)
    d.text((40, 26), "第四轮草图 · 搜索、AI、费用与数据自主权", fill=INK, font=ImageFont.truetype(BOLD, 30))
    d.text((40, 77), "V0.4 / 静态设计，不是真实账单、服务配置或已实现功能", fill=MUTED, font=ImageFont.truetype(FONT, 17))
    for i, path in enumerate(paths):
        with Image.open(path) as im:
            preview = im.copy()
            preview.thumbnail((840, 670), Image.Resampling.LANCZOS)
            x, y = 40+(i%2)*880, 125+(i//2)*690
            sheet.paste(preview, (x, y))
            d.text((x+5, y+preview.height+10), path.name, fill=MUTED, font=ImageFont.truetype(FONT, 13))
    sheet.save(ROOT/"support-overview.png")


if __name__ == "__main__":
    search_page()
    ai_settings()
    usage_budget()
    backup_export()
    onboarding_page()
    support_overview()
    print("Rendered boards 13-17 and support-overview.png")
