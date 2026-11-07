/// 网页端降级实现：无本地文件系统，迁移/回滚演示不可用（真实迁移仍由 drift 执行）。
Future<String> runMigrationDemo() async {
  return '网页端没有本地文件系统，迁移/回滚演示请在安卓或 Windows 端运行。';
}
