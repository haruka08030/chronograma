import 'package:flutter/material.dart';

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
  });

  final Task task;
  final VoidCallback onToggle;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  Color _priorityDotColor(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    switch (task.priority) {
      case TaskPriority.high:
        return cs.primary;
      case TaskPriority.medium:
        return cs.secondary;
      case TaskPriority.low:
        return cs.tertiary;
      case TaskPriority.none:
        return cs.outline;
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
    final bg = task.completed
        ? cs.surfaceContainer.withValues(alpha: 0.5)
        : cs.surfaceContainerLowest;

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
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
                  onTap: onToggle,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  child: Center(
                    child: AnimatedContainer(
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
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
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
              PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'delete') {
                    _confirmDelete(context);
                  }
                },
                itemBuilder: (context) => [
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
