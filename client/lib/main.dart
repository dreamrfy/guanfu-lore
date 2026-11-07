import 'package:flutter/material.dart';

void main() {
  runApp(const BijiApp());
}

/// P1-T01 三端空壳首页：三端同一画面，验证「一套代码三个入口」。
class BijiApp extends StatelessWidget {
  const BijiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '个人知识库',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF1d4ed8), useMaterial3: true),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.auto_stories, size: 72, color: Color(0xFF1d4ed8)),
            const SizedBox(height: 16),
            const Text('个人知识库', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text('P1-T01 三端空壳 · 骨架已就绪',
                style: TextStyle(fontSize: 14, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
  }
}
