import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() => runApp(const ProtoApp());

const _keyText = 'p0t2-note-text';
const _keyAt = 'p0t2-note-at';
const _rowCount = 1000;

class ProtoApp extends StatelessWidget {
  const ProtoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'P0-T02 Flutter 原型',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF1d4ed8), useMaterial3: true),
      home: const ProtoPage(),
    );
  }
}

class ProtoPage extends StatefulWidget {
  const ProtoPage({super.key});

  @override
  State<ProtoPage> createState() => _ProtoPageState();
}

class _ProtoPageState extends State<ProtoPage> {
  final _inputCtl = TextEditingController();
  final _noteCtl = TextEditingController();
  String? _savedAt;
  bool _lazyMode = true; // true=懒加载（真实产品做法） false=全量（最坏情况）
  late final List<DataRow> _rows;
  late final int _buildMs;

  @override
  void initState() {
    super.initState();
    final sw = Stopwatch()..start();
    _rows = _makeRows();
    _buildMs = sw.elapsedMilliseconds;
    _loadNote();
  }

  Future<void> _loadNote() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _noteCtl.text = prefs.getString(_keyText) ?? '';
      _savedAt = prefs.getString(_keyAt);
    });
  }

  Future<void> _saveNote() async {
    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now();
    final at =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')} '
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
    await prefs.setString(_keyText, _noteCtl.text);
    await prefs.setString(_keyAt, at);
    if (!mounted) return;
    setState(() => _savedAt = at);
  }

  List<DataRow> _makeRows() {
    const sources = ['公众号', 'B站', '小红书', '抖音'];
    const statuses = ['已读', '未读', '稍后读'];
    return List.generate(_rowCount, (i) {
      final n = i + 1;
      return DataRow(cells: [
        DataCell(Text('$n')),
        DataCell(Text('测试文章标题第$n行——这是一段用于撑宽列的中文文本')),
        DataCell(Text(sources[i % 4])),
        DataCell(Text('标签${i % 17}/${i % 23}')),
        DataCell(Text(statuses[i % 3])),
        DataCell(Text('2026-11-${(i % 28) + 1}')),
        DataCell(Text('${800 + (i * 37) % 4200}', textAlign: TextAlign.right)),
        DataCell(Text(i % 5 == 0 ? '含代码块与表格' : '—')),
        DataCell(Text('https://example.com/a/$n',
            style: const TextStyle(color: Color(0xFF1d4ed8)))),
      ]);
    });
  }

  // —— 懒加载表格：只渲染可见行（真实产品的做法） ——
  static const _colWidths = [56.0, 420.0, 90.0, 110.0, 80.0, 110.0, 80.0, 140.0, 180.0];
  static const _headers = ['#', '名称', '来源', '标签', '状态', '日期', '字数', '备注', '链接'];
  static const _sources = ['公众号', 'B站', '小红书', '抖音'];
  static const _statuses = ['已读', '未读', '稍后读'];

  String _cellText(int col, int i) {
    final n = i + 1;
    return switch (col) {
      0 => '$n',
      1 => '测试文章标题第$n行——这是一段用于撑宽列的中文文本',
      2 => _sources[i % 4],
      3 => '标签${i % 17}/${i % 23}',
      4 => _statuses[i % 3],
      5 => '2026-11-${(i % 28) + 1}',
      6 => '${800 + (i * 37) % 4200}',
      7 => i % 5 == 0 ? '含代码块与表格' : '—',
      _ => 'https://example.com/a/$n',
    };
  }

  Widget _cell(int col, int i, {bool header = false}) {
    final isLink = col == 8 && !header;
    return SizedBox(
      width: _colWidths[col],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        child: Text(
          header ? _headers[col] : _cellText(col, i),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            fontWeight: header ? FontWeight.w600 : FontWeight.w400,
            color: isLink ? const Color(0xFF1d4ed8) : null,
          ),
        ),
      ),
    );
  }

  Widget _lazyTable() {
    return SizedBox(
      height: 420,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SizedBox(
          width: _colWidths.reduce((a, b) => a + b),
          child: ListView.builder(
            padding: EdgeInsets.zero,
            itemCount: _rowCount + 1,
            itemBuilder: (context, i) {
              if (i == 0) {
                return Container(
                  color: const Color(0xFFF6F8FA),
                  child: Row(
                      children: [for (var c = 0; c < 9; c++) _cell(c, 0, header: true)]),
                );
              }
              final r = i - 1;
              return Container(
                decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0)))),
                child: Row(children: [for (var c = 0; c < 9; c++) _cell(c, r)]),
              );
            },
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('P0-T02 Flutter 原型（Flutter 3.47）',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          _card(context, '① 中文输入', [
            TextField(
              controller: _inputCtl,
              decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: '在这里连续输入中文，观察候选框跟随与卡顿',
                  isDense: true),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 4),
            Text('已输入 ${_inputCtl.text.length} 字',
                style: const TextStyle(color: Color(0xFF5c6670), fontSize: 12)),
          ]),
          _card(context, '② 离线读写（shared_preferences）', [
            TextField(
              controller: _noteCtl,
              maxLines: 3,
              decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: '写点内容再点保存，然后重启应用看内容是否还在',
                  isDense: true),
            ),
            const SizedBox(height: 8),
            FilledButton(onPressed: _saveNote, child: const Text('保存到本机')),
            const SizedBox(height: 4),
            Text(_savedAt == null ? '本机还没有存档' : '上次保存于：$_savedAt',
                style: const TextStyle(color: Color(0xFF5c6670), fontSize: 12)),
          ]),
          _card(context, '③ 1000 行 × 8 列表格（画法可切换）', [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text('懒加载（真实产品做法）')),
                ButtonSegment(value: false, label: Text('全量（最坏情况）')),
              ],
              selected: {_lazyMode},
              onSelectionChanged: (s) => setState(() => _lazyMode = s.first),
            ),
            const SizedBox(height: 6),
            Text(
              _lazyMode
                  ? '只渲染屏幕上可见的十几行，滚动到哪画到哪——请快速滑动对比'
                  : '首次构建耗时：$_buildMs ms，1000 行全部排版——请快速滑动对比',
              style: const TextStyle(color: Color(0xFF5c6670), fontSize: 12),
            ),
            const SizedBox(height: 6),
            _lazyMode ? _lazyTable() : _fullTable(),
          ]),
        ]),
      ),
    );
  }

  Widget _fullTable() {
    return SizedBox(
      height: 420,
      child: SingleChildScrollView(
        scrollDirection: Axis.vertical,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            headingRowColor: WidgetStateProperty.all(const Color(0xFFF6F8FA)),
            columns: const [
              DataColumn(label: Text('#')),
              DataColumn(label: Text('名称')),
              DataColumn(label: Text('来源')),
              DataColumn(label: Text('标签')),
              DataColumn(label: Text('状态')),
              DataColumn(label: Text('日期')),
              DataColumn(label: Text('字数')),
              DataColumn(label: Text('备注')),
              DataColumn(label: Text('链接')),
            ],
            rows: _rows,
          ),
        ),
      ),
    );
  }

  Widget _card(BuildContext context, String title, List<Widget> children) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...children,
        ]),
      ),
    );
  }
}
