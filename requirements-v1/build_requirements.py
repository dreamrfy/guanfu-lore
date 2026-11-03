from pathlib import Path
from xml.sax.saxutils import escape
import json
import re
import zipfile

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak,
    LongTable, TableStyle, KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "personal-knowledge-base-requirements-v1.0.md"
PDF = ROOT / "personal-knowledge-base-requirements-v1.0.pdf"
WIRES = ROOT.parent / "flowus-wireframes-v1"
pdfmetrics.registerFont(TTFont("YaHei", "C:/Windows/Fonts/msyh.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("YaHeiBold", "C:/Windows/Fonts/msyhbd.ttc", subfontIndex=0))
pdfmetrics.registerFontFamily("YaHei", normal="YaHei", bold="YaHeiBold", italic="YaHei", boldItalic="YaHeiBold")

W, H = A4
MARGIN = 54
CONTENT = W-2*MARGIN
BLACK = colors.HexColor("#000000")
GRAY = colors.HexColor("#626962")
LIGHT = colors.HexColor("#EAF0F4")
GRID = colors.HexColor("#D9D9D9")

ST = {
    "Title": ParagraphStyle("Title", fontName="YaHeiBold", fontSize=25, leading=37, textColor=BLACK, spaceAfter=18, wordWrap="CJK"),
    "Subtitle": ParagraphStyle("Subtitle", fontName="YaHei", fontSize=15, leading=24, textColor=BLACK, spaceAfter=26, wordWrap="CJK"),
    "Meta": ParagraphStyle("Meta", fontName="YaHei", fontSize=10, leading=19, textColor=GRAY, spaceAfter=5, wordWrap="CJK"),
    "Body": ParagraphStyle("Body", fontName="YaHei", fontSize=10.5, leading=18.5, textColor=BLACK, spaceAfter=9, wordWrap="CJK", allowWidows=0, allowOrphans=0, splitLongWords=1),
    "H1": ParagraphStyle("H1", fontName="YaHeiBold", fontSize=16, leading=25, textColor=BLACK, spaceBefore=21, spaceAfter=11, keepWithNext=True, wordWrap="CJK"),
    "H2": ParagraphStyle("H2", fontName="YaHeiBold", fontSize=12, leading=20, textColor=BLACK, spaceBefore=14, spaceAfter=8, keepWithNext=True, wordWrap="CJK"),
    "Bullet": ParagraphStyle("Bullet", fontName="YaHei", fontSize=10.5, leading=18.5, leftIndent=12, firstLineIndent=-10, spaceAfter=7, wordWrap="CJK", splitLongWords=1),
    "Cell": ParagraphStyle("Cell", fontName="YaHei", fontSize=9, leading=14.5, spaceAfter=0, textColor=BLACK, wordWrap="CJK", splitLongWords=1),
    "CellHeader": ParagraphStyle("CellHeader", fontName="YaHeiBold", fontSize=9, leading=14.5, spaceAfter=0, textColor=BLACK, wordWrap="CJK"),
    "TOC": ParagraphStyle("TOC", fontName="YaHei", fontSize=10.5, leading=21, textColor=BLACK, leftIndent=0, firstLineIndent=0, spaceBefore=1, wordWrap="CJK"),
}


def inline(text):
    text = escape(text)
    # Stable requirement IDs form useful scan anchors without bolding entire paragraphs.
    text = re.sub(r"^([A-Z]+-\d{2})\s+", r"<b>\1</b>  ", text)
    return text


class RequirementsDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            str(filename), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=53, bottomMargin=51,
            title="个人笔记与知识库软件需求规格说明书",
            author="产品需求整理", subject="第一版需求与验收基准 V1.0",
        )
        frame = Frame(MARGIN, 51, CONTENT, H-104, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id="Body", frames=frame, onPage=self.decorate))
        self.primary = []

    def decorate(self, canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setFillColor(GRAY)
        canvas.setFont("YaHei", 8)
        canvas.drawString(MARGIN, H-29, "个人笔记与知识库软件  第一版需求规格说明书")
        canvas.drawRightString(W-MARGIN, H-29, "V1.0")
        canvas.drawString(MARGIN, 27, "2026年11月2日")
        canvas.drawRightString(W-MARGIN, 27, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        level = getattr(flowable, "toc_level", None)
        if level is None:
            return
        name = flowable.anchor_name
        title = flowable.getPlainText()
        self.canv.bookmarkPage(name)
        self.canv.addOutlineEntry(title, name, level=level, closed=True)
        if level == 0:
            self.notify("TOCEntry", (0, title, self.page, name))
            if not any(title == entry[0] for entry in self.primary):
                self.primary.append((title, self.page))


def table_rows(lines):
    result = []
    for line in lines:
        row = [v.strip() for v in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", v) for v in row):
            continue
        result.append(row)
    return result


def make_table(rows):
    n = len(rows[0])
    if n == 3:
        weights = [0.10, 0.28, 0.62] if rows[0][0] == "编号" else [0.19, 0.53, 0.28]
        if rows[0][0] in ("标记", "对象", "类型", "入口", "视图"):
            weights = [.18, .42, .40]
        if rows[0][0] == "草图":
            weights = [.09, .47, .44]
        if rows[0][0] == "顺序":
            weights = [.09, .69, .22]
    elif n == 4:
        weights = [.09, .31, .32, .28]
    else:
        weights = [.43, .57] if n == 2 else [1/n]*n
    widths = [CONTENT*w for w in weights]
    data = []
    for i, row in enumerate(rows):
        data.append([Paragraph(inline(cell), ST["CellHeader" if i == 0 else "Cell"]) for cell in row])
    table = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT", spaceBefore=5, spaceAfter=12, splitByRow=1, rowSplitRange=(3,-3))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), LIGHT),
        ("GRID", (0,0), (-1,-1), .5, GRID),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#FAFBFC")]),
    ]))
    return table


def build_pdf():
    source = SOURCE.read_text(encoding="utf-8")
    lines = source.splitlines()
    story = []
    title = lines[0][2:]
    story.extend([Spacer(1, 51), Paragraph(title, ST["Title"]), Paragraph("第一版需求与验收基准", ST["Subtitle"])])
    for line in ("版本 V1.0", "编制日期 2026年11月2日", "适用平台 安卓手机  Windows电脑  网页端", "使用范围 仅产品所有者本人"):
        story.append(Paragraph(line, ST["Meta"]))
    story.append(Spacer(1, 26))
    intro = [line for line in lines if line.startswith("本文汇总") or line.startswith("本文不表示")]
    for line in intro:
        story.append(Paragraph(inline(line), ST["Body"]))
    story.append(Spacer(1, 16))
    story.append(Paragraph("阅读说明", ST["H2"]))
    story.append(Paragraph("先阅读第2至3章确认目标和范围；第5至17章给出操作与保护规则；第18章为验收基准，第19章列出必须验证的风险。附录保留沟通决定、18张草图索引及参考入口。", ST["Body"]))
    story.append(PageBreak())
    story.append(Paragraph("目录", ST["H1"]))
    toc = TableOfContents()
    toc.levelStyles = [ST["TOC"]]
    toc.tableStyle = TableStyle([
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ])
    story.extend([toc, PageBreak()])
    idx = next(i for i, line in enumerate(lines) if line.startswith("## 1 "))
    heading_number = 0
    while idx < len(lines):
        line = lines[idx].strip()
        if not line:
            idx += 1
            continue
        if line.startswith("## ") or line.startswith("### "):
            level = 0 if line.startswith("## ") else 1
            heading = line[3:] if level == 0 else line[4:]
            heading_number += 1
            para = Paragraph(inline(heading), ST["H1" if level == 0 else "H2"])
            para.toc_level = level
            para.anchor_name = f"section-{heading_number}"
            story.append(para)
        elif line.startswith("|"):
            table = []
            while idx < len(lines) and lines[idx].lstrip().startswith("|"):
                table.append(lines[idx])
                idx += 1
            story.append(make_table(table_rows(table)))
            continue
        elif line.startswith("- "):
            story.append(Paragraph("-  "+inline(line[2:]), ST["Bullet"]))
        else:
            story.append(Paragraph(inline(line), ST["Body"]))
        idx += 1
    doc = RequirementsDoc(PDF)
    doc.multiBuild(story)
    reader = PdfReader(PDF)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    checks = ["六种", "单篇", "HTML", "PDF", "冲突", "备份", "未认证", "30元", "V01", "AC26", "附录D"]
    missing = [s for s in checks if s not in text]
    if missing:
        raise RuntimeError(f"Missing expected text: {missing}")
    report = {
        "pages": len(reader.pages), "source_characters": len(source),
        "pdf_text_characters": len(text), "tables": sum(1 for line in lines if re.match(r"\|\s*-", line)),
        "requirements": sorted(set(re.findall(r"\b[A-Z]+-\d{2}\b", source))),
        "acceptance_cases": len(set(re.findall(r"\bAC\d{2}\b", source))),
        "validation_items": len(set(re.findall(r"\bV\d{2}\b", source))),
        "page_text_characters": [len(page.extract_text() or "") for page in reader.pages],
        "bookmark_count": len(doc.primary),
    }
    (ROOT/"qa"/"content-audit.json").parent.mkdir(exist_ok=True)
    (ROOT/"qa"/"content-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def bundle():
    names = [
        "01-desktop-table.png", "02-desktop-reader.png", "03-board-and-timeline.png",
        "04-note-and-backlinks.png", "05-list-gallery-calendar.png", "06-android-flow.png",
        "07-property-editing.png", "08-view-settings.png", "09-task-failures.png",
        "10-offline-states.png", "11-sync-conflicts.png", "12-mindmap-editor.png",
        "13-search-and-scope.png", "14-ai-configuration.png", "15-cost-and-budget.png",
        "16-backup-and-export.png", "17-first-use.png", "18-single-page-export.png",
    ]
    with zipfile.ZipFile(ROOT/"personal-knowledge-base-requirements-v1.0-bundle.zip", "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(SOURCE, SOURCE.name)
        z.write(PDF, PDF.name)
        z.write(WIRES/"index.html", "wireframes/index.html")
        for name in names:
            z.write(WIRES/name, "wireframes/"+name)
        z.writestr("README.txt", "个人笔记与知识库软件需求资料包 V1.0\n\nPDF为已排版阅读版，Markdown为可编辑源稿。\n打开 wireframes/index.html 查看18张静态草图。\n草图全部是示例，不代表功能已实现；技术可行性见需求文档第19章。\n账号截图、开发脚本、密钥和真实业务资料未包含。\n")
    print("Bundled PDF, editable Markdown and 18 wireframe boards.")


if __name__ == "__main__":
    build_pdf()
    bundle()
