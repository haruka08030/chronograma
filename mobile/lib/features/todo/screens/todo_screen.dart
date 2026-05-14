import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design/app_spacing.dart';
import '../../../shared/widgets/kinetic_gradient_fab.dart';
import '../models/task_priority.dart';
import '../providers/search_provider.dart';
import '../providers/todo_providers.dart';
import '../sheets/quick_add_sheet.dart';
import '../sheets/task_detail_sheet.dart';
import '../widgets/smart_view_segment.dart';
import '../widgets/task_card.dart';

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
    final tasks = ref.watch(filteredTasksProvider);
    final view = ref.watch(smartViewProvider);

    return Stack(
      children: [
        Column(
          children: [
            const _FixedSearchBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.xl,
                  AppSpacing.lg,
                  AppSpacing.xl,
                  120,
                ),
                children: [
                  Text(
                    _todayLabel(),
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          letterSpacing: 2,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  SmartViewSegment(
                    value: view,
                    onChanged: (v) =>
                        ref.read(smartViewProvider.notifier).state = v,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  if (tasks.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 48),
                      child: Center(
                        child: Text(
                          '該当するタスクがありません',
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                      ),
                    )
                  else
                    ...tasks.map(
                      (t) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: TaskCard(
                          task: t,
                          onToggle: () => ref
                              .read(todoListProvider.notifier)
                              .toggleComplete(t.id),
                          onTap: () => showTaskDetailSheet(
                            context: context,
                            task: t,
                            onSave: (updated) => ref
                                .read(todoListProvider.notifier)
                                .updateTask(updated),
                            onDelete: () {
                              ref.read(todoListProvider.notifier).deleteTaskWithUndo(
                                    t.id,
                                    showUndo: (msg, undo) =>
                                        _showUndoSnack(context, msg, undo),
                                  );
                            },
                          ),
                          onDelete: () {
                            ref.read(todoListProvider.notifier).deleteTaskWithUndo(
                                  t.id,
                                  showUndo: (msg, undo) =>
                                      _showUndoSnack(context, msg, undo),
                                );
                          },
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        KineticGradientFab(
          onPressed: () => showQuickAddSheet(
            context: context,
            onSubmit:
                ({required String title, DateTime? dueDate, required TaskPriority priority}) {
              ref.read(todoListProvider.notifier).addTaskQuick(
                    title: title,
                    dueDate: dueDate,
                    priority: priority,
                  );
            },
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
    final cs = Theme.of(context).colorScheme;

    ref.listen<String>(searchQueryProvider, (prev, next) {
      if (_controller.text != next) {
        _controller.value = TextEditingValue(
          text: next,
          selection: TextSelection.collapsed(offset: next.length),
        );
      }
    });

    return Material(
      color: cs.surface.withValues(alpha: 0.92),
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: cs.outline.withValues(alpha: 0.12),
              ),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: TextField(
              controller: _controller,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: '検索…',
                prefixIcon: Icon(
                  Icons.search,
                  size: 22,
                  color: cs.onSurfaceVariant,
                ),
                suffixIcon: _controller.text.trim().isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'クリア',
                        icon: Icon(Icons.close, color: cs.onSurfaceVariant),
                        onPressed: () {
                          _controller.clear();
                          ref.read(searchQueryProvider.notifier).state = '';
                          setState(() {});
                        },
                      ),
                filled: true,
                fillColor: cs.surfaceContainerHighest.withValues(alpha: 0.85),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: cs.primary.withValues(alpha: 0.45),
                    width: 1,
                  ),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.md,
                ),
                isDense: true,
              ),
              onChanged: (v) {
                ref.read(searchQueryProvider.notifier).state = v;
                setState(() {});
              },
            ),
          ),
        ),
      ),
    );
  }
}
