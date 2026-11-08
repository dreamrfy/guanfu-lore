import '../data/asset_store.dart';
import '../data/database.dart';
import '../data/pages_table.dart';
import '../editor/block_model.dart';
import '../table/table_model.dart';

/// 剪藏拉取（V2.1 ④）：从服务端读清单索引 → 逐条取记录 JSON → 写入用户指定的多维表。
/// HTTP 全部注入（真实现用 package:http，测试用假函数），本文件不含网络调用。

/// 清单条目（服务端 clips/index.json 元素的最小子集）。
class ClipIndexItem {
  const ClipIndexItem({
    required this.id,
    required this.title,
    required this.source,
    required this.savedAt,
    required this.status,
  });

  final String id;
  final String title;
  final String source;
  final String savedAt;
  final String status;
}

/// 服务端资产引用（G1：只存编号与扩展名，地址由本层拼装）。
class ServerClipAsset {
  const ServerClipAsset({required this.assetId, required this.ext});

  final String assetId;
  final String ext;
}

/// 服务端单条剪藏记录（clips/{id}.json 的最小解析子集）。
class ServerClip {
  const ServerClip({
    required this.id,
    required this.title,
    required this.source,
    required this.account,
    required this.savedAt,
    required this.status,
    required this.text,
    required this.sourceUrl,
    required this.assets,
  });

  final String id;
  final String title;
  final String source;
  final String account;
  final String savedAt;
  final String status;
  final String text;
  final String sourceUrl;
  final List<ServerClipAsset> assets;

  /// 记录页来源行的展示文案。
  String get sourceLabel => account.isNotEmpty ? account : source;
}

/// 解析清单 JSON（App 端容错：结构不符 → 空表）。
List<ClipIndexItem> parseClipIndex(Object? decoded) {
  if (decoded is! List) return const [];
  final out = <ClipIndexItem>[];
  for (final e in decoded) {
    if (e is! Map) continue;
    final id = e['id'];
    if (id is! String || id.isEmpty) continue;
    out.add(ClipIndexItem(
      id: id,
      title: e['title'] is String ? e['title'] as String : '',
      source: e['source'] is String ? e['source'] as String : 'unknown',
      savedAt: e['savedAt'] is String ? e['savedAt'] as String : '',
      status: e['status'] is String ? e['status'] as String : 'unknown',
    ));
  }
  return out;
}

/// 解析单条剪藏 JSON（结构不符/缺 id → null）。
ServerClip? parseServerClip(Object? decoded) {
  if (decoded is! Map) return null;
  final id = decoded['id'];
  if (id is! String || id.isEmpty) return null;
  final rawAssets = decoded['assets'];
  final assets = <ServerClipAsset>[
    if (rawAssets is List)
      for (final a in rawAssets)
        if (a is Map && a['assetId'] is String)
          ServerClipAsset(
            assetId: a['assetId'] as String,
            ext: a['ext'] is String ? a['ext'] as String : 'png',
          ),
  ];
  return ServerClip(
    id: id,
    title: decoded['title'] is String ? decoded['title'] as String : '',
    source: decoded['source'] is String ? decoded['source'] as String : 'unknown',
    account: decoded['account'] is String ? decoded['account'] as String : '',
    savedAt: decoded['savedAt'] is String ? decoded['savedAt'] as String : '',
    status: decoded['status'] is String ? decoded['status'] as String : 'unknown',
    text: decoded['text'] is String ? decoded['text'] as String : '',
    sourceUrl: decoded['sourceUrl'] is String ? decoded['sourceUrl'] as String : '',
    assets: assets,
  );
}

/// 记录页正文（块 JSON）：来源行 + 正文按行转段落（空行略过）。
String clipContentBlocks(ServerClip clip) {
  final blocks = <BlockData>[
    BlockData(id: newBlockId(), type: BlockType.p, text: '来源：${clip.sourceLabel} · ${clip.savedAt} · 状态 ${clip.status}'),
    if (clip.sourceUrl.isNotEmpty)
      BlockData(id: newBlockId(), type: BlockType.p, text: '原文链接：${clip.sourceUrl}'),
    for (final line in clip.text.split('\n'))
      if (line.trim().isNotEmpty)
        BlockData(id: newBlockId(), type: BlockType.p, text: line),
    if (clip.text.trim().isEmpty)
      BlockData(id: newBlockId(), type: BlockType.p, text: '（服务端未抓到正文——该来源需浏览器渲染或原文为空）'),
  ];
  return encodeBlocks(blocks);
}

/// 拼服务端对象地址：base 可带「?t=令牌」查询（令牌跟随每个请求），path 为桶内键。
String clipUrl(String base, String path) {
  var b = base.trim();
  while (b.endsWith('/')) {
    b = b.substring(0, b.length - 1);
  }
  final q = b.indexOf('?');
  if (q < 0) return '$b/$path';
  return '${b.substring(0, q)}/$path${b.substring(q)}';
}

/// HTTP 注入点（测试用假实现；生产真实现见 ClipPullDeps.real）。
typedef FetchJson = Future<Object?> Function(String url);
typedef FetchBytes = Future<List<int>> Function(String url);

class ClipPullDeps {
  const ClipPullDeps({required this.fetchIndex, required this.fetchClip, this.fetchAsset});

  final FetchJson fetchIndex;
  final FetchJson fetchClip;

  /// null = 不下载图片（记录仍会入库，只是记录页没有图）。
  final FetchBytes? fetchAsset;
}

/// 拉取结果报告（给界面提示用）。
class ClipPullReport {
  int total = 0;
  int imported = 0;
  int skipped = 0;
  final List<String> failed = [];
  int assetsOk = 0;
  int assetsFailed = 0;

  String get summary => '清单 $total 条：新入库 $imported、已在库跳过 $skipped、失败 ${failed.length}；'
      '图片成功 $assetsOk、失败 $assetsFailed';
}

/// ④ 主入口：把服务端剪藏写入指定多维表（单向拉取）。
/// [baseUrl] 形如 https://pub-xxx.r2.dev（方案 A）或 http://host:port?t=令牌（方案 B）。
Future<ClipPullReport> pullClips({
  required AppDatabase db,
  required AssetStore store,
  required String baseUrl,
  required String tablePageId,
  required ClipPullDeps deps,
  bool downloadAssets = true,
  int assetCapPerClip = 20,
}) async {
  final tablePage = await db.pageById(tablePageId);
  if (tablePage == null || tablePage.type != PageTypes.table) {
    throw ArgumentError('剪藏目标表不存在或不是多维表');
  }
  final index = parseClipIndex(await deps.fetchIndex(clipUrl(baseUrl, 'clips/index.json')));
  final report = ClipPullReport();
  report.total = index.length;
  if (index.isEmpty) return report;

  var table = decodeTable(tablePage.content);
  // 列保障：标题=首列；来源/时间/状态 缺则自动补（文本列）
  final colIds = <String, String>{};
  for (final name in const ['来源', '时间', '状态']) {
    var id = colIdByName(table, name);
    if (id == null) {
      table = addColumn(table, name: name);
      id = table.cols.last.id;
    }
    colIds[name] = id;
  }
  final titleCol = table.cols.first.id;

  for (final item in index) {
    if (table.rows.any((r) => r.clip == item.id)) {
      report.skipped++;
      continue;
    }
    final ServerClip? clip;
    try {
      clip = parseServerClip(await deps.fetchClip(clipUrl(baseUrl, 'clips/${item.id}.json')));
    } catch (e) {
      report.failed.add('${item.id}：读取失败（$e）');
      continue;
    }
    if (clip == null) {
      report.failed.add('${item.id}：记录格式无法解析');
      continue;
    }
    // 记录页（物化：挂到表下，批注可写）
    final rec = await db.createPage(
      title: clip.title.trim().isEmpty ? '未命名剪藏' : clip.title.trim(),
      parentId: tablePageId,
      type: PageTypes.record,
    );
    await db.updatePageContent(rec.id, clipContentBlocks(clip));
    // 图片本地化（G1：只存编号；单图失败不阻塞入库）
    final fetchAsset = deps.fetchAsset;
    if (downloadAssets && fetchAsset != null) {
      var n = 0;
      for (final a in clip.assets) {
        if (n >= assetCapPerClip) break;
        n++;
        try {
          final bytes = await fetchAsset(clipUrl(baseUrl, 'assets/${a.assetId}.${a.ext}'));
          final stored = await store.save(bytes, a.ext);
          await db.recordAsset(stored);
          await db.attachAssetToPage(rec.id, stored.id);
          report.assetsOk++;
        } catch (_) {
          report.assetsFailed++;
        }
      }
    }
    // 表行：标题/来源/时间/状态 + clip 锚点 + 记录页绑定
    table = addRowFilled(table, cells: {
      titleCol: clip.title,
      colIds['来源']!: clip.sourceLabel,
      colIds['时间']!: clip.savedAt,
      colIds['状态']!: clip.status,
    }, clip: clip.id, pid: rec.id);
    report.imported++;
  }

  // 写回表 JSON（设置页路径：表页面不在前台，直接落库；前台同表由「返回后刷新」兜底）
  await db.updatePageContent(tablePageId, encodeTable(table));
  return report;
}
