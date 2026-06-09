import 'package:flutter/material.dart';

import '../../../design/app_colors.dart';
import '../../../design/app_radius.dart';
import '../../../design/app_spacing.dart';
import '../models/task.dart';
import '../models/task_priority.dart';

class TaskCard extends StatelessWidget {
  const TaskCard({
    super.key,
    required this.task,
    required this.onToggle,
    required this.onTap,
    required this.onDelete,
    this.selectionMode = false,
    this.selected = false,
    this.onSelect,
  });

  final Task task;
  final VoidCallback onToggle;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  /// 一括選択モード中か。
  final bool selectionMode;

  /// このタスクが選択済みか。
  final bool selected;

  /// 長押し（選択開始）／選択モード中のタップで呼ばれる。
  final VoidCallback? onSelect;

  Color _priorityDotColor(BuildContext context) {
    switch (task.priority) {
      case TaskPriority.high:
        return AppColors.priorityHigh;
      case TaskPriority.medium:
        return AppColors.priorityMedium;
      case TaskPriority.low:
        return AppColors.priorityLow;
      case TaskPriority.none:
        return AppColors.zinc400;
    }
  }

  String _metaLine() {
    final parts = <String>[];
    if (task.tags.isNotEmpty) {
      parts.add(task.tags.first.toUpperCase());
    }
    return parts.join(' • ');
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('タスクを削除'),
        content: const Text('このタスクを削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('削除'),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      onDelete();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final metaLine = _metaLine();
    final bg = selected
        ? cs.primary.withValues(alpha: 0.14)
        : task.completed
            ? cs.surfaceContainer.withValues(alpha: 0.5)
            : cs.surfaceContainerLowest;

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: selectionMode ? onSelect : onTap,
        onLongPress: onSelect,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 44,
                height: 44,
                child: InkWell(
                  onTap: selectionMode ? onSelect : onToggle,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  child: Center(
                    child: selectionMode
                        ? Icon(
                            selected
                                ? Icons.check_circle
                                : Icons.radio_button_unchecked,
                            color: selected ? cs.primary : cs.outline,
                          )
                        : AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: task.completed
                                    ? cs.primary
                                    : cs.primary.withValues(alpha: 0.35),
                                width: 2,
                              ),
                              color: task.completed
                                  ? cs.primary.withValues(alpha: 0.12)
                                  : Colors.transparent,
                            ),
                            child: task.completed
                                ? Icon(Icons.check, size: 16, color: cs.primary)
                                : null,
                          ),
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.title,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w400,
                            decoration: task.completed
                                ? TextDecoration.lineThrough
                                : null,
                            color: task.completed
                                ? cs.onSurfaceVariant
                                : cs.onSurface,
                          ),
                    ),
                    if (metaLine.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(right: 8, top: 2),
                            decoration: BoxDecoration(
                              color: _priorityDotColor(context),
                              shape: BoxShape.circle,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              metaLine,
                              style: Theme.of(context)
                                  .textTheme
                                  .labelLarge
                                  ?.copyWith(
                                    fontSize: 11,
                                    letterSpacing: 0.6,
                                    fontWeight: FontWeight.w600,
                                  ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (!selectionMode)
                PopupMenuButton<String>(
                  onSelected: (v) {
                    if (v == 'delete') {
                      _confirmDelete(context);
                    } else if (v == 'select') {
                      onSelect?.call();
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'select',
                      child: Text('選択'),
                    ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Text('削除'),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
