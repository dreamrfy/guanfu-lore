# M2-T21 证据 · 块手柄 overlay 化 + 「＋」插块

日期：2026-11-10　执行者：watchdog 会话（run-1794293818）

## 1 问题与解法

M2-T07 那版把 `⠿`/`＋` 画在块内部（`blockWrapper` 的 Stack 里），两个后果：
① 块外那 20/22px 被内核裁掉；② Flutter 的 hit test 出不了父边界 → 看得见、点不到。

这版改成 **OverlayPortal**：图标挂到根 Overlay（整屏坐标），位置按 hovered 块的**全局矩形**算。
因为 `Positioned` 坐标已经是屏幕坐标，块左外的 20px 也在屏内 → **画得出也点得到**。
块本身只负责"报到"（hover 进来/出去、块内 dx），不再画任何东西。

## 2 证据

| 文件 | 内容 |
| --- | --- |
| `真FlowUs-悬停手柄2x.png` | 真 FlowUs（liunx命令页）悬停第二行的块：内容列左缘 716，手柄 6 点 ⠿ 出现在 x≈700..707、行中偏下的位置 |
| `我们实现-悬停手柄与加号2x.png` | 我们 release：正文段落左外出现手柄 + 「＋」（同一块，2× 放大） |
| `我们实现-悬停出＋.png` | release 全屏，贴块左缘时的原始像素 |
| `我们实现-点＋插入空段落.png` | 点「＋」之后：该段下面插出一个空段落（灰色占位「写点什么…」+ 光标） |

像素实测（`hover-plus.png`，x 692..726）：
```
338-350  x≈706..712      三横 = 手柄（16×16 盒在 700..716，内容列 720 → 左外 20）
354-368  x≈709 竖线 + 360 行横线 702..717  = 「＋」（20×20 盒在 698..718 → 左外 22、手柄下 14）
```

## 3 自动化验收（真实输出）

```
flutter test test/block_handle_test.dart            → 9 条全绿
flutter test test/editor_handle_overlay_test.dart   → 2 条全绿（真编辑器里：手柄在块外 + 点＋插块）
flutter test                                        → +326 通过，1 skip
flutter analyze lib/                                 → No issues found!
flutter build windows --release -t lib/main_shell.dart --no-tree-shake-icons → 成功 43.4s
```

release 实测：点「＋」后正文块数 11 → 12（新块是空段落，光标进去了）。

## 4 没做的（已拆任务）

| 项 | 去向 |
| --- | --- |
| 拖拽排序 + 插入位置指示线 | **M2-T26**（新任务） |
| 「＋」真身图标 `IcBlockAdd` 采集（现在用 `IcAdd` 代用，字形可能有差） | M2-T26 一起做 |
| 点手柄打开块菜单 | **M2-T08**（手柄现在可点、已留 `onHandleTap` 回调，菜单未接） |

## 5 顺手修的通道问题

截图脚本要先把窗口置顶（`HWND_TOPMOST`）：Chrome 在前台时会把鼠标事件抢走，
鼠标 hover 进不了我们的窗口（表现为"画面里根本没有手柄"）。两条脚本已改：
`capture_hover.ps1`（PrintWindow，带 hover/click 参数）、`capture_screen_hover.ps1`（屏幕抓取）。