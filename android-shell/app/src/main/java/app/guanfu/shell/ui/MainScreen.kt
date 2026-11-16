package app.guanfu.shell.ui

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.guanfu.shell.SyncContainer
import app.guanfu.shell.db.AppDatabase
import app.guanfu.shell.db.PageEntity
import app.guanfu.shell.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Date

/**
 * 主框架（A04）：抽屉侧栏（集合树/标签/收集箱/回收站）+ 笔记列表 + 全文搜索。
 *
 * 与 web 的对齐点：
 *  - 列表顺序 = Room `ORDER BY sortKey`（web `db.pages.orderBy("sortKey")`，
 *    旧页在前、新页在后；创建时 sortKey=now）
 *  - 树 = `buildTree`（孤儿页兜底 + 防环，复刻 Sidebar.tsx）
 *  - 搜索 = `searchAll`（标题 + 正文块，单页最多 5 条、片段前后 36 字符）
 *  - 收集箱 = 「剪藏库」表 + 「状态」单选（未读/已读），复刻 clipBox.ts
 *
 * A05 才接页面查看器；本期列表项点击进入的是「页面详情占位」（子页列表 + 后续接入说明）。
 */
sealed interface Selection {
    data object AllNotes : Selection
    data class Tag(val name: String) : Selection
    data object ClipBox : Selection
    data object Trash : Selection
    data class Page(val id: String) : Selection
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(clipMessage: String?, onOpenSettings: () -> Unit) {
    val context = LocalContext.current
    val loader = remember { NotesLoader(AppDatabase.get(context)) }
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(DrawerValue.Closed)

    var snapshot by remember { mutableStateOf<NotesSnapshot?>(null) }
    var selection by remember { mutableStateOf<Selection>(Selection.AllNotes) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<SearchGroup>>(emptyList()) }
    var syncStatus by remember { mutableStateOf<String?>(null) }
    var syncing by remember { mutableStateOf(false) }
    var reloadTick by remember { mutableStateOf(0) }

    LaunchedEffect(reloadTick) {
        snapshot = withContext(Dispatchers.IO) { loader.load() }
    }
    LaunchedEffect(query, reloadTick) {
        results = if (query.isBlank()) {
            emptyList()
        } else {
            withContext(Dispatchers.IO) { loader.search(query) }
        }
    }

    fun syncNow() {
        if (syncing) return
        syncing = true
        syncStatus = "同步中…"
        scope.launch {
            val summary = withContext(Dispatchers.IO) { SyncContainer.engine(context).run() }
            syncing = false
            syncStatus = if (summary.error != null) {
                "同步失败：${summary.error}"
            } else {
                "同步完成：拉取 ${summary.pulled} · 推送 ${summary.pushed} · 冲突 ${summary.conflicts}"
            }
            reloadTick += 1
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                SidebarContent(
                    snapshot = snapshot,
                    selection = selection,
                    onSelect = {
                        selection = it
                        query = ""
                        scope.launch { drawerState.close() }
                    },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    navigationIcon = {
                        TextButton(onClick = { scope.launch { drawerState.open() } }) {
                            Text("☰", fontSize = 20.sp)
                        }
                    },
                    title = {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            singleLine = true,
                            placeholder = { Text("搜索标题与正文", fontSize = 14.sp) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    },
                    actions = {
                        TextButton(onClick = ::syncNow, enabled = !syncing) {
                            Text(if (syncing) "同步中" else "同步")
                        }
                        TextButton(onClick = onOpenSettings) { Text("设置") }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize(),
            ) {
                clipMessage?.let {
                    Card(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(it, modifier = Modifier.padding(12.dp), fontSize = 14.sp)
                    }
                }
                syncStatus?.let {
                    Text(
                        it,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }

                val snap = snapshot
                when {
                    snap == null -> CenterHint("正在读取本地库…")
                    query.isNotBlank() -> SearchResults(
                        results = results,
                        onPick = { pageId ->
                            selection = Selection.Page(pageId)
                            query = ""
                        },
                    )
                    else -> when (val selected = selection) {
                        is Selection.ClipBox -> ClipBoxList(snap.clipBox)
                        is Selection.Trash -> PageList(
                            pages = snap.trash,
                            emptyText = "回收站是空的",
                            subtitle = { "删除于 ${formatTime(it.deletedAt ?: 0L)}" },
                            onPick = {},
                        )
                        is Selection.Tag -> PageList(
                            pages = pagesWithTag(snap.pages, selected.name),
                            emptyText = "没有带这个标签的页面",
                            onPick = { selection = Selection.Page(it.id) },
                        )
                        is Selection.Page -> PageDetail(
                            snapshot = snap,
                            pageId = selected.id,
                            onPickChild = { selection = Selection.Page(it) },
                            onChanged = { reloadTick += 1 },
                        )
                        Selection.AllNotes -> PageList(
                            pages = snap.pages,
                            emptyText = "还没有页面。先同步一次，新页面在 A10 的收集箱接入后也会出现在这里。",
                            onPick = { selection = Selection.Page(it.id) },
                        )
                    }
                }
            }
        }
    }
}

/* ---------------- 侧栏 ---------------- */

@Composable
private fun SidebarContent(snapshot: NotesSnapshot?, selection: Selection, onSelect: (Selection) -> Unit) {
    Column(Modifier.fillMaxSize().padding(vertical = 16.dp)) {
        Text(
            "观复 · Lore",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        )
        val pages = snapshot?.pages.orEmpty()
        NavRow(
            label = "全部笔记",
            badge = pages.size.toString(),
            selected = selection == Selection.AllNotes,
            onClick = { onSelect(Selection.AllNotes) },
        )
        NavRow(
            label = "收集箱",
            badge = snapshot?.clipBox?.let { "${it.unread}/${it.total}" } ?: "-",
            selected = selection == Selection.ClipBox,
            onClick = { onSelect(Selection.ClipBox) },
        )
        NavRow(
            label = "回收站",
            badge = snapshot?.trash?.size?.toString() ?: "0",
            selected = selection == Selection.Trash,
            onClick = { onSelect(Selection.Trash) },
        )

        val tags = snapshot?.tags.orEmpty()
        if (tags.isNotEmpty()) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(
                "标签",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            LazyColumn(modifier = Modifier.height(140.dp)) {
                items(tags, key = { it.first }) { (tag, count) ->
                    NavRow(
                        label = "#$tag",
                        badge = count.toString(),
                        selected = selection == Selection.Tag(tag),
                        indent = 8,
                        onClick = { onSelect(Selection.Tag(tag)) },
                    )
                }
            }
        }

        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        Text(
            "页面树",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.outline,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
        )
        val tree = snapshot?.tree.orEmpty()
        if (tree.isEmpty()) {
            Text(
                "（空）",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 6.dp),
            )
        }
        LazyColumn {
            items(tree, key = { it.id }) { item ->
                NavRow(
                    label = (item.icon?.let { "$it " } ?: "") + item.title,
                    selected = selection == Selection.Page(item.id),
                    indent = 8 + item.depth * 14,
                    onClick = { onSelect(Selection.Page(item.id)) },
                )
            }
        }
    }
}

@Composable
private fun NavRow(
    label: String,
    badge: String? = null,
    selected: Boolean = false,
    indent: Int = 8,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
            .padding(start = indent.dp + 12.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (badge != null) {
            Text(badge, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
        }
    }
}

/* ---------------- 列表 ---------------- */

@Composable
private fun PageList(
    pages: List<PageEntity>,
    emptyText: String,
    subtitle: ((PageEntity) -> String)? = null,
    onPick: (PageEntity) -> Unit,
) {
    if (pages.isEmpty()) {
        CenterHint(emptyText)
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(pages, key = { it.id }) { page ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clickable { onPick(page) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(
                    (page.icon?.let { "$it " } ?: "") + pageTitle(page),
                    fontSize = 16.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    subtitle?.invoke(page) ?: "更新于 ${formatTime(page.updatedAt)}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
        }
    }
}

@Composable
private fun ClipBoxList(box: ClipBoxState?) {
    if (box == null) {
        CenterHint("本地还没有「剪藏库」表。同步一次后，微信转发进来的文章会出现在这里（I01 链路）。")
        return
    }
    Column {
        Text(
            "收集箱 · 未读 ${box.unread} / 共 ${box.total}",
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.outline,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        if (box.items.isEmpty()) {
            CenterHint("剪藏库是空的")
            return@Column
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(box.items, key = { it.id }) { item ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (item.unread) "●" else "○", fontSize = 14.sp, modifier = Modifier.width(24.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.title, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(
                            "更新于 ${formatTime(item.updatedAt)}",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.outline,
                        )
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            }
        }
    }
}

/** 页面详情（A05 只读渲染 / A06 就地编辑）+ 子页入口。 */
@Composable
private fun PageDetail(
    snapshot: NotesSnapshot,
    pageId: String,
    onPickChild: (String) -> Unit,
    onChanged: () -> Unit,
) {
    val context = LocalContext.current
    var editing by remember(pageId) { mutableStateOf(false) }
    val page = snapshot.pages.firstOrNull { it.id == pageId }
    if (page == null) {
        CenterHint("页面不在本地（可能已被删除或尚未同步）")
        return
    }

    if (editing) {
        val saver = remember { PageSaver(AppDatabase.get(context), SyncContainer.engine(context)) }
        PageEditorView(
            page = page,
            initialBlocksJson = snapshot.docsByPage[pageId],
            pages = snapshot.pages,
            onSave = { blocksJson ->
                saver.save(page, blocksJson)
                // 改动立刻推一次（同步箱已入队，这里只是尽快发车）
                SyncWorker.enqueueNow(context)
            },
            onExit = {
                editing = false
                onChanged()
            },
        )
        return
    }
    val children = snapshot.pages.filter { it.parentId == pageId }
    val blocks = remember(pageId, snapshot.docsByPage[pageId]) {
        parseBlocks(snapshot.docsByPage[pageId])
    }
    // 反向链接（A09）：扫本机所有正文，看谁 @ 了本页（对齐 web findBacklinks 语义）
    val backlinks = remember(pageId, snapshot.docsByPage) {
        findBacklinks(pageId, snapshot.pages, snapshot.docsByPage)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                (page.icon?.let { "$it " } ?: "") + pageTitle(page),
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { editing = true }) { Text("编辑") }
        }
        Text("更新于 ${formatTime(page.updatedAt)}", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
        val tags = parseTags(page.tags)
        if (tags.isNotEmpty()) {
            Text(tags.joinToString("  ") { "#$it" }, fontSize = 13.sp, color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(12.dp))

        if (blocks.isEmpty()) {
            Text(
                "这一页还没有正文（或正文尚未同步到本地）。",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.outline,
            )
        } else {
            // 正文里的 @提及 可点：点它跳到被提及的页面（A09）
            CompositionLocalProvider(LocalPageOpener provides { onPickChild(it) }) {
                BlockListView(blocks)
            }
        }

        if (children.isNotEmpty()) {
            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Text(
                "子页（${children.size}）",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 12.dp),
            )
            for (child in children) {
                Text(
                    "↳ " + pageTitle(child),
                    fontSize = 14.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPickChild(child.id) }
                        .padding(vertical = 8.dp),
                )
            }
        }

        // 页尾「引用了本页」：谁在正文里 @ 了我（A09，语义对齐 web Backlinks 面板）
        if (backlinks.isNotEmpty()) {
            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("引用了本页", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text(
                    "  ${backlinks.size}",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            for (link in backlinks) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onPickChild(link.pageId) }
                        .padding(vertical = 8.dp),
                ) {
                    Text("📄 ${link.title}", fontSize = 14.sp, color = MaterialTheme.colorScheme.primary)
                    if (link.snippet.isNotBlank()) {
                        Text(
                            link.snippet,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.outline,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

/* ---------------- 搜索 ---------------- */

@Composable
private fun SearchResults(results: List<SearchGroup>, onPick: (String) -> Unit) {
    if (results.isEmpty()) {
        CenterHint("没有匹配的页面")
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(results, key = { it.pageId }) { group ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clickable { onPick(group.pageId) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(group.title, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                for (hit in group.hits) {
                    Text(
                        buildAnnotatedString {
                            append(hit.snippet)
                            if (hit.start in 0..hit.end && hit.end <= hit.snippet.length) {
                                addStyle(
                                    SpanStyle(
                                        background = Color(0xFFFFF59D),
                                        fontWeight = FontWeight.Bold,
                                        color = Color.Black,
                                    ),
                                    hit.start,
                                    hit.end,
                                )
                            }
                        },
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
        }
    }
}

/* ---------------- 小工具 ---------------- */

@Composable
private fun CenterHint(text: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text,
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.outline,
            modifier = Modifier.padding(32.dp),
        )
    }
}

private fun formatTime(ms: Long): String {
    if (ms <= 0L) return "-"
    return DateFormat.format("MM-dd HH:mm", Date(ms)).toString()
}
