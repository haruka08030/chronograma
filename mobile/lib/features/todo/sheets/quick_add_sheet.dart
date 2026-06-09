import 'package:flutter/material.dart';

import '../../../design/app_spacing.dart';
import '../../../shared/pickers/native_pickers.dart';
import '../../../shared/widgets/draggable_sheet.dart';
import '../models/task_priority.dart';

Future<void> showQuickAddSheet({
  required BuildContext context,
  required void Function({
    required String title,
    DateTime? dueDate,
    required TaskPriority priority,
  }) onSubmit,
}) {
  return showDraggableBottomSheet<void>(
    context: context,
    initialChildSize: 0.45,
    minChildSize: 0.35,
    builder: (ctx, scrollController) {
      return _QuickAddBody(
        scrollController: scrollController,
        onSubmit: onSubmit,
      );
    },
  );
}

class _QuickAddBody extends StatefulWidget {
  const _QuickAddBody({
    required this.scrollController,
    required this.onSubmit,
  });

  final ScrollController scrollController;
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
    final d = await pickNativeDate(
      context,
      initialDate: now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (d != null) setState(() => _due = d);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return SingleChildScrollView(
      controller: widget.scrollController,
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xl,
        0,
        AppSpacing.xl,
        AppSpacing.xl + bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
              controller: _title,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'タイトル',
                hintText: 'やること #tag 今日 明日',
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
