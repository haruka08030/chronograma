import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design/design.dart';
import '../../../shared/pickers/native_pickers.dart';
import '../../../shared/widgets/kinetic_gradient_fab.dart';
import '../../../l10n/app_strings.dart';
import '../data/list_color_palettes.dart';
import '../models/task.dart';
import '../models/task_list_meta.dart';
import '../models/task_priority.dart';
import '../providers/search_provider.dart';
import '../providers/todo_providers.dart';
import '../sheets/quick_add_sheet.dart';
import '../sheets/task_detail_sheet.dart';
import '../widgets/smart_view_segment.dart';
import '../widgets/todo_tree_list.dart';

class TodoScreen extends ConsumerWidget {
  const TodoScreen({super.key});

  void _showUndoSnack(
    BuildContext context,
    String message,
    VoidCallback onUndo,
  ) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        action: SnackBarAction(
          label: '取り消し',
          onPressed: onUndo,
        ),
        duration: const Duration(seconds: 6),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(smartViewProvider);
    final listId = ref.watch(selectedTaskListIdProvider);
    final selectionMode = ref.watch(taskSelectionProvider).isNotEmpty;

    return Stack(
      children: [
        Column(
          children: [
            const _FixedSearchBar(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.lg,
                AppSpacing.xl,
                0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    _todayLabel(),
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          letterSpacing: 1.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.zinc500,
                        ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SmartViewSegment(
                    value: view,
                    onChanged: (v) =>
                        ref.read(smartViewProvider.notifier).state = v,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _TaskListFilterChips(),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: () => _showListManager(context, ref),
                      icon: const Icon(Icons.list, size: 18),
                      label: Text(S(ref.watch(appLocaleProvider)).manageLists),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: TodoTreeList(
                listId: listId,
                onOpenTask: (t) => showTaskDetailSheet(
                  context: context,
                  task: t,
                  onSave: (updated) =>
                      ref.read(todoListProvider.notifier).updateTask(updated),
                  onDelete: () {
                    ref.read(todoListProvider.notifier).deleteTaskWithUndo(
                          t.id,
                          showUndo: (msg, undo) =>
                              _showUndoSnack(context, msg, undo),
                        );
                  },
                ),
                onToggle: (id) =>
                    ref.read(todoListProvider.notifier).toggleComplete(id),
                onDelete: (id) {
                  ref.read(todoListProvider.notifier).deleteTaskWithUndo(
                        id,
                        showUndo: (msg, undo) =>
                            _showUndoSnack(context, msg, undo),
                      );
                },
              ),
            ),
          ],
        ),
        if (!selectionMode)
          KineticGradientFab(
            onPressed: () => showQuickAddSheet(
              context: context,
              onSubmit:
                  ({required String title, DateTime? dueDate, required TaskPriority priority}) {
                final ja = ref.read(appLocaleProvider) == AppLocale.ja;
                ref.read(todoListProvider.notifier).addTaskQuick(
                      title: title,
                      dueDate: dueDate,
                      priority: priority,
                      localeJa: ja,
                    );
              },
            ),
          ),
        if (selectionMode)
          Align(
            alignment: Alignment.bottomCenter,
            child: _BulkActionBar(
              onUndo: (msg, undo) => _showUndoSnack(context, msg, undo),
            ),
          ),
      ],
    );
  }

  String _todayLabel() {
    final d = DateTime.now();
    const w = ['月', '火', '水', '木', '金', '土', '日'];
    return '${d.year}年${d.month}月${d.day}日（${w[d.weekday - 1]}）';
  }

  void _showListManager(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _ListManagerSheet(),
    );
  }
}

class _ListManagerSheet extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lists = [...ref.watch(taskListsProvider)]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final sections = ref.watch(listSectionsProvider);
    final listsNotifier = ref.read(taskListsProvider.notifier);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('リスト', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.md),
              ReorderableListView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                onReorder: (oldIndex, newIndex) =>
                    listsNotifier.reorderLists(oldIndex, newIndex),
                children: [
                  for (var i = 0; i < lists.length; i++)
                    _listTile(context, ref, lists[i], i),
                ],
              ),
              FilledButton.icon(
                onPressed: () async {
                  final name = await _promptName(context, '新しいリスト');
                  if (name != null && name.isNotEmpty) {
                    listsNotifier.addList(name: name);
                  }
                },
                icon: const Icon(Icons.add),
                label: const Text('リストを追加'),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('セクション', style: Theme.of(context).textTheme.titleMedium),
              ...sections.map((s) {
                final match = lists.where((l) => l.id == s.listId);
                final listName = match.isNotEmpty ? match.first.name : s.listId;
                return ListTile(
                  dense: true,
                  title: Text(s.name.isEmpty ? '(無題)' : s.name),
                  subtitle: Text(listName),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 20),
                        onPressed: () async {
                          final name =
                              await _promptName(context, 'セクション名', initial: s.name);
                          if (name != null) {
                            ref
                                .read(listSectionsProvider.notifier)
                                .updateSection(s.copyWith(name: name));
                          }
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        onPressed: () => ref
                            .read(listSectionsProvider.notifier)
                            .deleteSection(s.id),
                      ),
                    ],
                  ),
                );
              }),
              OutlinedButton.icon(
                onPressed: () async {
                  final listId =
                      ref.read(selectedTaskListIdProvider) ?? Task.inboxListId;
                  final name = await _promptName(context, 'セクション名');
                  if (name != null) {
                    ref
                        .read(listSectionsProvider.notifier)
                        .addSection(listId: listId, name: name);
                  }
                },
                icon: const Icon(Icons.add),
                label: const Text('セクションを追加'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _listTile(
    BuildContext context,
    WidgetRef ref,
    TaskListMeta l,
    int index,
  ) {
    final isInbox = l.id == Task.inboxListId;
    final notifier = ref.read(taskListsProvider.notifier);
    return ListTile(
      key: ValueKey(l.id),
      leading: GestureDetector(
        onTap: isInbox ? null : () => _pickColor(context, ref, l),
        child: Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            color: hexToColor(l.color),
            shape: BoxShape.circle,
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
        ),
      ),
      title: Text(l.name),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!isInbox)
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 20),
              onPressed: () async {
                final name =
                    await _promptName(context, 'リスト名', initial: l.name);
                if (name != null && name.isNotEmpty) {
                  notifier.updateList(l.copyWith(name: name));
                }
              },
            ),
          if (!isInbox)
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 20),
              onPressed: () =>
                  ref.read(todoListProvider.notifier).deleteListAndReassign(l.id),
            ),
          ReorderableDragStartListener(
            index: index,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4),
              child: Icon(Icons.drag_handle, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickColor(
    BuildContext context,
    WidgetRef ref,
    TaskListMeta l,
  ) async {
    final paletteId = ref.read(listColorPaletteProvider);
    final colors = paletteColors(paletteId);
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('色を選択', style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final c in colors)
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx, c),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: hexToColor(c),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: c.toLowerCase() == l.color.toLowerCase()
                                ? Theme.of(ctx).colorScheme.primary
                                : Theme.of(ctx).dividerColor,
                            width: c.toLowerCase() == l.color.toLowerCase() ? 3 : 1,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) {
      ref.read(taskListsProvider.notifier).updateList(l.copyWith(color: picked));
    }
  }

  Future<String?> _promptName(
    BuildContext context,
    String label, {
    String initial = '',
  }) async {
    final c = TextEditingController(text: initial);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(label),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('キャンセル')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK')),
        ],
      ),
    );
    if (ok != true) return null;
    return c.text;
  }
}

class _BulkActionBar extends ConsumerWidget {
  const _BulkActionBar({required this.onUndo});

  final void Function(String message, VoidCallback onUndo) onUndo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(taskSelectionProvider);
    final notifier = ref.read(todoListProvider.notifier);
    final selectionNotifier = ref.read(taskSelectionProvider.notifier);
    final cs = Theme.of(context).colorScheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Material(
          elevation: 6,
          color: cs.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(AppRadius.xl),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                IconButton(
                  tooltip: '選択を解除',
                  icon: const Icon(Icons.close),
                  onPressed: selectionNotifier.clear,
                ),
                Text('${selected.length}', style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                IconButton(
                  tooltip: '完了',
                  icon: const Icon(Icons.check_circle_outline),
                  onPressed: () {
                    notifier.bulkSetCompleted(selected, true);
                    selectionNotifier.clear();
                  },
                ),
                IconButton(
                  tooltip: 'リスト移動',
                  icon: const Icon(Icons.drive_file_move_outline),
                  onPressed: () => _pickList(context, ref, selected),
                ),
                IconButton(
                  tooltip: '優先度',
                  icon: const Icon(Icons.flag_outlined),
                  onPressed: () => _pickPriority(context, ref, selected),
                ),
                IconButton(
                  tooltip: '期限',
                  icon: const Icon(Icons.event_outlined),
                  onPressed: () => _pickDue(context, ref, selected),
                ),
                IconButton(
                  tooltip: '削除',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () {
                    notifier.bulkDeleteWithUndo(selected, showUndo: onUndo);
                    selectionNotifier.clear();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pickList(
    BuildContext context,
    WidgetRef ref,
    Set<String> ids,
  ) async {
    final lists = [...ref.read(taskListsProvider)]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final l in lists)
              ListTile(
                leading: Icon(Icons.circle, size: 14, color: hexToColor(l.color)),
                title: Text(l.name),
                onTap: () => Navigator.pop(ctx, l.id),
              ),
          ],
        ),
      ),
    );
    if (picked != null) {
      ref.read(todoListProvider.notifier).bulkMoveToList(ids, picked);
      ref.read(taskSelectionProvider.notifier).clear();
    }
  }

  Future<void> _pickPriority(
    BuildContext context,
    WidgetRef ref,
    Set<String> ids,
  ) async {
    final picked = await showModalBottomSheet<TaskPriority>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final p in TaskPriority.values)
              ListTile(
                title: Text(p.label),
                onTap: () => Navigator.pop(ctx, p),
              ),
          ],
        ),
      ),
    );
    if (picked != null) {
      ref.read(todoListProvider.notifier).bulkSetPriority(ids, picked);
      ref.read(taskSelectionProvider.notifier).clear();
    }
  }

  Future<void> _pickDue(
    BuildContext context,
    WidgetRef ref,
    Set<String> ids,
  ) async {
    final now = DateTime.now();
    final d = await pickNativeDate(
      context,
      initialDate: now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (d != null) {
      ref.read(todoListProvider.notifier).bulkSetDue(ids, d);
      ref.read(taskSelectionProvider.notifier).clear();
    }
  }
}

class _TaskListFilterChips extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lists = ref.watch(taskListsProvider);
    if (lists.isEmpty) return const SizedBox.shrink();
    final selected = ref.watch(selectedTaskListIdProvider);
    final s = S(ref.watch(appLocaleProvider));
    final sorted = [...lists]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    return ChronogramaFilterChips(
      selectedId: selected,
      options: [
        (null, s.all),
        for (final l in sorted) (l.id, l.name),
      ],
      onSelected: (id) {
        ref.read(selectedTaskListIdProvider.notifier).state = id;
      },
    );
  }
}

/// PC 同様: 画面上部に常時表示の検索欄。
class _FixedSearchBar extends ConsumerStatefulWidget {
  const _FixedSearchBar();

  @override
  ConsumerState<_FixedSearchBar> createState() => _FixedSearchBarState();
}

class _FixedSearchBarState extends ConsumerState<_FixedSearchBar> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: ref.read(searchQueryProvider));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final s = S(ref.watch(appLocaleProvider));

    ref.listen<String>(searchQueryProvider, (prev, next) {
      if (_controller.text != next) {
        _controller.value = TextEditingValue(
          text: next,
          selection: TextSelection.collapsed(offset: next.length),
        );
      }
    });

    return Material(
      color: (isDark ? AppColors.zinc950 : AppColors.surface)
          .withValues(alpha: 0.92),
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: (isDark ? AppColors.zinc800 : AppColors.zinc200)
                    .withValues(alpha: 0.7),
              ),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ChronogramaScreenHeader(),
                const SizedBox(height: AppSpacing.sm),
                ChronogramaSearchBar(
                  controller: _controller,
                  hintText: s.searchPlaceholder,
                  onChanged: (v) {
                    ref.read(searchQueryProvider.notifier).state = v;
                    setState(() {});
                  },
                  onClear: () {
                    _controller.clear();
                    ref.read(searchQueryProvider.notifier).state = '';
                    setState(() {});
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
