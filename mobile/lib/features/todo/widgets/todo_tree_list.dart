import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design/design.dart';
import '../../../l10n/app_strings.dart';
import '../../../shared/widgets/schedule_task_draggable.dart';
import '../models/list_section_meta.dart';
import '../models/task.dart';
import '../providers/todo_providers.dart';
import '../widgets/task_card.dart';

class TodoTreeList extends ConsumerWidget {
  const TodoTreeList({
    super.key,
    required this.listId,
    required this.onOpenTask,
    required this.onToggle,
    required this.onDelete,
  });

  final String? listId;
  final void Function(Task task) onOpenTask;
  final void Function(String id) onToggle;
  final void Function(String id) onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(todoListProvider);
    final filtered = ref.watch(filteredTasksProvider);
    final filteredIds = filtered.map((t) => t.id).toSet();
    final roots = rootTasksForList(all, listId: listId)
        .where((t) => filteredIds.contains(t.id))
        .toList();

    if (roots.isEmpty) {
      final s = S(ref.watch(appLocaleProvider));
      return ChronogramaEmptyState(
        message: s.noTasks,
        hint: s.emptyHint,
      );
    }

    final selectedIds = ref.watch(taskSelectionProvider);
    final selectionMode = selectedIds.isNotEmpty;
    void onSelect(String id) =>
        ref.read(taskSelectionProvider.notifier).toggle(id);

    // 特定リスト選択時、そのリストにセクションがあればグルーピング表示。
    final sections = listId == null
        ? <ListSectionMeta>[]
        : (ref.watch(listSectionsProvider).where((s) => s.listId == listId).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)));

    if (sections.isNotEmpty) {
      return _GroupedBody(
        roots: roots,
        all: all,
        sections: sections,
        selectedIds: selectedIds,
        selectionMode: selectionMode,
        onSelect: onSelect,
        onOpenTask: onOpenTask,
        onToggle: onToggle,
        onDelete: onDelete,
      );
    }

    return ReorderableListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      buildDefaultDragHandles: false,
      itemCount: roots.length,
      onReorder: (oldIndex, newIndex) {
        final lid = listId ?? Task.inboxListId;
        ref.read(todoListProvider.notifier).reorderRootTasks(lid, oldIndex, newIndex);
      },
      itemBuilder: (context, index) {
        final root = roots[index];
        return _RootBlock(
          key: ValueKey(root.id),
          root: root,
          all: all,
          depth: 0,
          reorderIndex: index,
          selectedIds: selectedIds,
          selectionMode: selectionMode,
          onSelect: onSelect,
          onOpenTask: onOpenTask,
          onToggle: onToggle,
          onDelete: onDelete,
        );
      },
    );
  }
}

class _GroupedBody extends StatelessWidget {
  const _GroupedBody({
    required this.roots,
    required this.all,
    required this.sections,
    required this.selectedIds,
    required this.selectionMode,
    required this.onSelect,
    required this.onOpenTask,
    required this.onToggle,
    required this.onDelete,
  });

  final List<Task> roots;
  final List<Task> all;
  final List<ListSectionMeta> sections;
  final Set<String> selectedIds;
  final bool selectionMode;
  final void Function(String id) onSelect;
  final void Function(Task task) onOpenTask;
  final void Function(String id) onToggle;
  final void Function(String id) onDelete;

  Widget _header(BuildContext context, String label) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 6),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.zinc500,
            ),
      ),
    );
  }

  List<Widget> _rowsFor(String? sectionId) {
    final group = roots.where((t) => t.sectionId == sectionId).toList();
    return [
      for (final root in group)
        _RootBlock(
          key: ValueKey(root.id),
          root: root,
          all: all,
          depth: 0,
          selectedIds: selectedIds,
          selectionMode: selectionMode,
          onSelect: onSelect,
          onOpenTask: onOpenTask,
          onToggle: onToggle,
          onDelete: onDelete,
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final validSectionIds = sections.map((s) => s.id).toSet();
    final noneRows = _rowsFor(null)
      ..addAll([
        // 孤児（存在しないセクション参照）も「セクションなし」に寄せる。
        for (final root in roots
            .where((t) => t.sectionId != null && !validSectionIds.contains(t.sectionId)))
          _RootBlock(
            key: ValueKey('orphan-${root.id}'),
            root: root,
            all: all,
            depth: 0,
            selectedIds: selectedIds,
            selectionMode: selectionMode,
            onSelect: onSelect,
            onOpenTask: onOpenTask,
            onToggle: onToggle,
            onDelete: onDelete,
          ),
      ]);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        if (noneRows.isNotEmpty) ...[
          _header(context, 'セクションなし'),
          ...noneRows,
        ],
        for (final s in sections) ...[
          _header(context, s.name.isEmpty ? '(無題)' : s.name),
          ..._rowsFor(s.id),
        ],
      ],
    );
  }
}

class _RootBlock extends StatelessWidget {
  const _RootBlock({
    super.key,
    required this.root,
    required this.all,
    required this.depth,
    this.reorderIndex,
    required this.selectedIds,
    required this.selectionMode,
    required this.onSelect,
    required this.onOpenTask,
    required this.onToggle,
    required this.onDelete,
  });

  final Task root;
  final List<Task> all;
  final int depth;
  final int? reorderIndex;
  final Set<String> selectedIds;
  final bool selectionMode;
  final void Function(String id) onSelect;
  final void Function(Task task) onOpenTask;
  final void Function(String id) onToggle;
  final void Function(String id) onDelete;

  bool get _canSchedule =>
      !selectionMode && !root.completed && !root.isTimeLog;

  Widget _taskCard(BuildContext context) {
    return ScheduleTaskDraggable(
      task: root,
      enabled: _canSchedule,
      child: TaskCard(
        task: root,
        selectionMode: selectionMode,
        selected: selectedIds.contains(root.id),
        onSelect: () => onSelect(root.id),
        onTap: () => onOpenTask(root),
        onToggle: () => onToggle(root.id),
        onDelete: () => onDelete(root.id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final children = childrenOf(all, root.id);
    final card = Padding(
      padding: EdgeInsets.only(left: depth * 16.0),
      child: reorderIndex != null && depth == 0
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ReorderableDragStartListener(
                  index: reorderIndex!,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12, right: 4),
                    child: Icon(
                      Icons.drag_handle,
                      size: 20,
                      color: AppColors.zinc400,
                    ),
                  ),
                ),
                Expanded(child: _taskCard(context)),
              ],
            )
          : _taskCard(context),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        card,
        for (final child in children)
          _RootBlock(
            root: child,
            all: all,
            depth: depth + 1,
            selectedIds: selectedIds,
            selectionMode: selectionMode,
            onSelect: onSelect,
            onOpenTask: onOpenTask,
            onToggle: onToggle,
            onDelete: onDelete,
          ),
      ],
    );
  }
}
