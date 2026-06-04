import 'package:flutter/material.dart';

import '../../../design/app_radius.dart';
import '../../../design/app_spacing.dart';
import '../models/task_priority.dart';

Future<void> showQuickAddSheet({
  required BuildContext context,
  required void Function({
    required String title,
    DateTime? dueDate,
    required TaskPriority priority,
  }) onSubmit,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return _QuickAddBody(onSubmit: onSubmit);
    },
  );
}

class _QuickAddBody extends StatefulWidget {
  const _QuickAddBody({required this.onSubmit});

  final void Function({
    required String title,
    DateTime? dueDate,
    required TaskPriority priority,
  }) onSubmit;

  @override
  State<_QuickAddBody> createState() => _QuickAddBodyState();
}

class _QuickAddBodyState extends State<_QuickAddBody> {
  final _title = TextEditingController();
  DateTime? _due;
  TaskPriority _priority = TaskPriority.medium;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
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
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'クイック追加',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: AppSpacing.lg),
            TextField(
              controller: _title,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'タイトル',
                hintText: 'やることを入力',
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _pickDate,
                    icon: const Icon(Icons.event_outlined),
                    label: Text(
                      _due == null ? '期限' : '期限あり',
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                if (_due != null)
                  IconButton(
                    onPressed: () => setState(() => _due = null),
                    icon: const Icon(Icons.close),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
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
              onSelectionChanged: (s) => setState(() => _priority = s.first),
            ),
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              onPressed: _submit,
              child: const Text('追加'),
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    final t = _title.text.trim();
    if (t.isEmpty) return;
    widget.onSubmit(
      title: t,
      dueDate: _due,
      priority: _priority,
    );
    Navigator.pop(context);
  }
}
