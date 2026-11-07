/// 保存状态机（P1-T04）。需求 §4.2 口径：同步状态独立于其他状态层。
/// 五态与任务表对应：编辑中 / 已保存在本机 / 等待同步 / 保存失败（任务表称"同步失败"，
/// P1 阶段唯一可发生的失败是本地写盘失败，P7 上传失败也归此槽位，文案按实际成因）/ 冲突。
enum SaveStatus {
  editing, // 缓冲区有未落盘的编辑
  savedLocal, // 已落盘且云端已确认（P7 同步落地后才会出现）
  pendingSync, // 已落盘、云端未确认——P1 阶段保存成功后的常态
  saveFailed, // 最近一次写盘失败：绝不显示"已保存"
  conflict, // 存在未处理的冲突（P7 启用；枚举先占位）
}

/// 纯函数：状态不是记住的，是由事实推导出来的（同 SNAP-02 思路）。
SaveStatus deriveSaveStatus({
  required bool dirty, // 缓冲区有未落盘编辑
  required bool writeFailed, // 最近一次落盘失败
  required bool conflict, // 存在未处理冲突
}) {
  if (conflict) return SaveStatus.conflict;
  if (writeFailed) return SaveStatus.saveFailed;
  if (dirty) return SaveStatus.editing;
  return SaveStatus.pendingSync;
}

/// 展示文案（UI 无关，供界面与测试共用）。
String saveStatusLabel(SaveStatus s) => switch (s) {
      SaveStatus.editing => '编辑中…',
      SaveStatus.savedLocal => '已保存在本机',
      SaveStatus.pendingSync => '已保存在本机 · 等待同步',
      SaveStatus.saveFailed => '保存失败 · 内容未写入本机',
      SaveStatus.conflict => '有冲突待处理',
    };
