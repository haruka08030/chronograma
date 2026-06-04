import 'package:flutter/material.dart';

import '../../../design/app_radius.dart';
import '../../../design/app_spacing.dart';
import '../models/task.dart';
import '../models/task_priority.dart';

Future<void> showTaskDetailSheet({
  required BuildContext context,
  required Task task,
  required void Function(Task updated) onSave,
  required VoidCallback onDelete,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return _TaskDetailBody(
        task: task,
        onSave: onSave,
        onDelete: onDelete,
      );
    },
  );
}

class _TaskDetailBody extends StatefulWidget {
  const _TaskDetailBody({
    required this.task,
    required this.onSave,
    required this.onDelete,
  });

  final Task task;
  final void Function(Task updated) onSave;
  final VoidCallback onDelete;

  @override
  State<_TaskDetailBody> createState() => _TaskDetailBodyState();
}

class _TaskDetailBodyState extends State<_TaskDetailBody> {
  late final TextEditingController _title;
  late final TextEditingController _tags;
  TaskPriority _priority = TaskPriority.medium;
  DateTime? _due;
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.task.title);
    _tags = TextEditingController(text: widget.task.tags.join(', '));
    _priority = widget.task.priority;
    _due = widget.task.dueDate;
    _completed = widget.task.completed;
  }

  @override
  void dispose() {
    _title.dispose();
    _tags.dispose();
    super.dispose();
  }

  Task _buildTask() {
    final tags = _tags.text
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    return widget.task.copyWith(
      title: _title.text.trim(),
      priority: _priority,
      dueDate: _due,
      tags: tags,
      completed: _completed,
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final first = DateTime(now.year - 1);
    final last = DateTime(now.year + 3);
    final d = await showDatePicker(
      context: context,
      initialDate: _due ?? now,
      firstDate: first,
      lastDate: last,
    );
    if (d != null) setState(() => _due = d);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AppRadius.xl),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                    decoration: BoxDecoration(
                      color: cs.outlineVariant,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                Text(
                  'タスク',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: AppSpacing.lg),
                TextField(
                  controller: _title,
                  decoration: const InputDecoration(
                    labelText: 'タイトル',
                  ),
                  textInputAction: TextInputAction.done,
                ),
                const SizedBox(height: AppSpacing.lg),
                TextField(
                  controller: _tags,
                  decoration: const InputDecoration(
                    labelText: 'タグ（カンマ区切り）',
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.event_outlined),
                        label: Text(
                          _due == null
                              ? '期限を設定'
                              : '${_due!.year}-${_due!.month.toString().padLeft(2, '0')}-${_due!.day.toString().padLeft(2, '0')}',
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    if (_due != null)
                      IconButton(
                        onPressed: () => setState(() => _due = null),
                        icon: const Icon(Icons.close),
                        tooltip: '期限をクリア',
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  '優先度',
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: AppSpacing.sm),
                SegmentedButton<TaskPriority>(
                  segments: TaskPriority.values
                      .map(
                        (p) => ButtonSegment<TaskPriority>(
                          value: p,
                          label: Text(p.label),
                        ),
                      )
                      .toList(),
                  selected: {_priority},
                  onSelectionChanged: (s) =>
                      setState(() => _priority = s.first),
                ),
                const SizedBox(height: AppSpacing.lg),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('完了'),
                  value: _completed,
                  onChanged: (v) => setState(() => _completed = v),
                ),
                const SizedBox(height: AppSpacing.xl),
                FilledButton(
                  onPressed: () {
                    widget.onSave(_buildTask());
                    Navigator.pop(context);
                  },
                  child: const Text('保存'),
                ),
                const SizedBox(height: AppSpacing.sm),
                OutlinedButton(
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('削除'),
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
                      Navigator.pop(context);
                      widget.onDelete();
                    }
                  },
                  child: const Text('削除'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
