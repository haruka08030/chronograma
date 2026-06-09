import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design/app_spacing.dart';
import '../../../shared/pickers/native_pickers.dart';
import '../../../shared/widgets/draggable_sheet.dart';
import '../models/task.dart';
import '../models/task_priority.dart';
import '../providers/todo_providers.dart';

Future<void> showTaskDetailSheet({
  required BuildContext context,
  required Task task,
  required void Function(Task updated) onSave,
  required VoidCallback onDelete,
  bool allowSubtasks = true,
}) {
  return showDraggableBottomSheet<void>(
    context: context,
    initialChildSize: 0.5,
    builder: (ctx, scrollController) {
      return _TaskDetailBody(
        scrollController: scrollController,
        task: task,
        onSave: onSave,
        onDelete: onDelete,
        allowSubtasks: allowSubtasks,
      );
    },
  );
}

class _TaskDetailBody extends ConsumerStatefulWidget {
  const _TaskDetailBody({
    required this.scrollController,
    required this.task,
    required this.onSave,
    required this.onDelete,
    required this.allowSubtasks,
  });

  final ScrollController scrollController;
  final Task task;
  final void Function(Task updated) onSave;
  final VoidCallback onDelete;
  final bool allowSubtasks;

  @override
  ConsumerState<_TaskDetailBody> createState() => _TaskDetailBodyState();
}

class _TaskDetailBodyState extends ConsumerState<_TaskDetailBody> {
  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _tags;
  late final TextEditingController _subtask;
  TaskPriority _priority = TaskPriority.medium;
  DateTime? _due;
  String? _startTime;
  String? _endTime;
  String? _recurrenceType;
  int _recurrenceInterval = 1;
  String? _sectionId;
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.task.title);
    _description = TextEditingController(text: widget.task.description);
    _tags = TextEditingController(text: widget.task.tags.join(', '));
    _subtask = TextEditingController();
    _priority = widget.task.priority;
    _due = widget.task.dueDate;
    _startTime = widget.task.startTime;
    _endTime = widget.task.endTime;
    final rec = widget.task.recurrence;
    if (rec != null) {
      _recurrenceType = rec['type'] as String?;
      _recurrenceInterval = (rec['interval'] as num?)?.toInt() ?? 1;
    }
    _sectionId = widget.task.sectionId;
    _completed = widget.task.completed;
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _tags.dispose();
    _subtask.dispose();
    super.dispose();
  }

  Map<String, dynamic>? _recurrenceMap() {
    if (_due == null) return null;
    if (_recurrenceType == null) return null;
    return {
      'type': _recurrenceType,
      'interval': _recurrenceInterval < 1 ? 1 : _recurrenceInterval,
    };
  }

  Task _buildTask() {
    final tags = _tags.text
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    final hasDue = _due != null;
    final rec = _recurrenceMap();
    return widget.task.copyWith(
      title: _title.text.trim(),
      description: _description.text.trim(),
      priority: _priority,
      dueDate: _due,
      clearDueDate: !hasDue,
      startTime: hasDue ? _startTime : null,
      clearStartTime: !hasDue || _startTime == null,
      endTime: hasDue ? _endTime : null,
      clearEndTime: !hasDue || _endTime == null,
      recurrence: rec,
      clearRecurrence: rec == null,
      sectionId: _sectionId,
      clearSectionId: _sectionId == null,
      tags: tags,
      completed: _completed,
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final first = DateTime(now.year - 1);
    final last = DateTime(now.year + 3);
    final d = await pickNativeDate(
      context,
      initialDate: _due ?? now,
      firstDate: first,
      lastDate: last,
    );
    if (d != null) setState(() => _due = d);
  }

  static String _fmtHm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  static TimeOfDay? _parseHm(String? s) {
    if (s == null || s.isEmpty) return null;
    final p = s.split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0].trim());
    final m = int.tryParse(p[1].trim());
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h.clamp(0, 23), minute: m.clamp(0, 59));
  }

  Future<void> _pickTime({required bool isStart}) async {
    final current = isStart ? _parseHm(_startTime) : _parseHm(_endTime);
    final picked = await pickNativeTime(
      context,
      initialTime: current ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startTime = _fmtHm(picked);
      } else {
        _endTime = _fmtHm(picked);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final isExisting = ref
        .watch(todoListProvider)
        .any((t) => t.id == widget.task.id);
    final showSubtasks = widget.allowSubtasks && isExisting;

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
                  decoration: const InputDecoration(
                    labelText: 'タイトル',
                  ),
                  textInputAction: TextInputAction.done,
                ),
                const SizedBox(height: AppSpacing.lg),
                TextField(
                  controller: _description,
                  decoration: const InputDecoration(
                    labelText: 'メモ',
                  ),
                  maxLines: 3,
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
                        onPressed: () => setState(() {
                          _due = null;
                          _startTime = null;
                          _endTime = null;
                          _recurrenceType = null;
                        }),
                        icon: const Icon(Icons.close),
                        tooltip: '期限をクリア',
                      ),
                  ],
                ),
                if (_due != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _buildTimeRow(),
                  const SizedBox(height: AppSpacing.lg),
                  _buildRecurrenceRow(),
                ],
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
                _buildSectionPicker(),
                const SizedBox(height: AppSpacing.lg),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('完了'),
                  value: _completed,
                  onChanged: (v) => setState(() => _completed = v),
                ),
                if (showSubtasks) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _buildSubtasks(),
                ],
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
    );
  }

  Widget _buildTimeRow() {
    String label(String? v, String fallback) => v == null || v.isEmpty ? fallback : v;
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _pickTime(isStart: true),
            icon: const Icon(Icons.schedule_outlined, size: 18),
            label: Text('開始 ${label(_startTime, '--:--')}'),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _pickTime(isStart: false),
            icon: const Icon(Icons.schedule, size: 18),
            label: Text('終了 ${label(_endTime, '--:--')}'),
          ),
        ),
        if (_startTime != null || _endTime != null)
          IconButton(
            onPressed: () => setState(() {
              _startTime = null;
              _endTime = null;
            }),
            icon: const Icon(Icons.close),
            tooltip: '時刻をクリア',
          ),
      ],
    );
  }

  Widget _buildRecurrenceRow() {
    const types = <String?, String>{
      null: 'なし',
      'daily': '毎日',
      'weekly': '毎週',
      'monthly': '毎月',
      'yearly': '毎年',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(Icons.repeat, size: 18),
            const SizedBox(width: AppSpacing.sm),
            Text('繰り返し', style: Theme.of(context).textTheme.labelLarge),
            const Spacer(),
            DropdownButton<String?>(
              value: _recurrenceType,
              items: [
                for (final e in types.entries)
                  DropdownMenuItem<String?>(
                    value: e.key,
                    child: Text(e.value),
                  ),
              ],
              onChanged: (v) => setState(() => _recurrenceType = v),
            ),
          ],
        ),
        if (_recurrenceType != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Row(
              children: [
                const Text('間隔'),
                const SizedBox(width: AppSpacing.md),
                IconButton(
                  onPressed: _recurrenceInterval > 1
                      ? () => setState(() => _recurrenceInterval -= 1)
                      : null,
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text('$_recurrenceInterval'),
                IconButton(
                  onPressed: () => setState(() => _recurrenceInterval += 1),
                  icon: const Icon(Icons.add_circle_outline),
                ),
                Text(switch (_recurrenceType) {
                  'daily' => '日ごと',
                  'weekly' => '週ごと',
                  'monthly' => 'か月ごと',
                  'yearly' => '年ごと',
                  _ => '',
                }),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildSectionPicker() {
    final sections = ref
        .watch(listSectionsProvider)
        .where((s) => s.listId == widget.task.listId)
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    if (sections.isEmpty) return const SizedBox.shrink();
    final validIds = sections.map((s) => s.id).toSet();
    final value = validIds.contains(_sectionId) ? _sectionId : null;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Row(
        children: [
          const Icon(Icons.segment, size: 18),
          const SizedBox(width: AppSpacing.sm),
          Text('セクション', style: Theme.of(context).textTheme.labelLarge),
          const Spacer(),
          DropdownButton<String?>(
            value: value,
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('なし')),
              for (final s in sections)
                DropdownMenuItem<String?>(
                  value: s.id,
                  child: Text(s.name.isEmpty ? '(無題)' : s.name),
                ),
            ],
            onChanged: (v) => setState(() => _sectionId = v),
          ),
        ],
      ),
    );
  }

  Widget _buildSubtasks() {
    final all = ref.watch(todoListProvider);
    final children = childrenOf(all, widget.task.id);
    final notifier = ref.read(todoListProvider.notifier);

    void addSubtask() {
      final t = _subtask.text.trim();
      if (t.isEmpty) return;
      notifier.addSubtask(widget.task.id, t);
      _subtask.clear();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('サブタスク', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: AppSpacing.sm),
        ...children.map(
          (c) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Checkbox(
                  value: c.completed,
                  onChanged: (_) => notifier.toggleComplete(c.id),
                  visualDensity: VisualDensity.compact,
                ),
                Expanded(
                  child: Text(
                    c.title,
                    style: TextStyle(
                      decoration: c.completed
                          ? TextDecoration.lineThrough
                          : null,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  visualDensity: VisualDensity.compact,
                  onPressed: () => notifier.deleteTaskWithUndo(
                    c.id,
                    showUndo: (msg, undo) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(msg),
                          action: SnackBarAction(label: '取り消し', onPressed: undo),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _subtask,
                decoration: const InputDecoration(
                  hintText: 'サブタスクを追加',
                  isDense: true,
                ),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => addSubtask(),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: addSubtask,
            ),
          ],
        ),
      ],
    );
  }
}
