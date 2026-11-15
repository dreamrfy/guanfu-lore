# 本目录已废弃（2026-11-15，A01 决策 · 不删除）

按《docs/安卓客户端架构设计.md》§1：安卓完整客户端以 `android-shell/` 为主体原地生长，
本目录（Flutter 模板壳）**标记废弃，不再投入**。

废弃原因（A01 实证）：
- `MainActivity` 只有 130 字节的 `FlutterActivity` 继承，无任何业务代码；
- gradle 绑定 flutter plugin loader，与「原生 Kotlin 全功能」目标相悖；
- 用户指令「不凭空重开工程」，android-shell 已有 VIEW/SEND 接入、设置页、签名流程等真资产。

本目录保留但不进任何构建流程。历史沿革见 git log。
