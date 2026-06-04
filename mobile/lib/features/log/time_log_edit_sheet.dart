import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';
import '../todo/models/task.dart';

String _formatHm(TimeOfDay t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

TimeOfDay? _parseHm(String? s) {
  if (s == null || s.isEmpty) return null;
  final parts = s.split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0].trim());
  final m = int.tryParse(parts[1].trim());
  if (h == null || m == null) return null;
  return TimeOfDay(hour: h.clamp(0, 23), minute: m.clamp(0, 59));
}

DateTime _dateTimeOn(DateTime day, TimeOfDay t) =>
    DateTime(day.year, day.month, day.day, t.hour, t.minute);

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

Future<void> showTimeLogEditSheet({
  required BuildContext context,
  required DateTime initialDay,
  Task? existing,
  required void Function(Task task) onSave,
  required VoidCallback onDelete,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return _TimeLogEditBody(
        initialDay: initialDay,
        existing: existing,
        onSave: onSave,
        onDelete: onDelete,
      );
    },
  );
}

class _TimeLogEditBody extends StatefulWidget {
  const _TimeLogEditBody({
    required this.initialDay,
    required this.existing,
    required this.onSave,
    required this.onDelete,
  });

  final DateTime initialDay;
  final Task? existing;
  final void Function(Task task) onSave;
  final VoidCallback onDelete;

  @override
  State<_TimeLogEditBody> createState() => _TimeLogEditBodyState();
}

class _TimeLogEditBodyState extends State<_TimeLogEditBody> {
  final _uuid = const Uuid();
  late final TextEditingController _title;
  late final TextEditingController _tags;
  late final TextEditingController _description;
  late DateTime _day;
  late DateTime _endDay;
  late TimeOfDay _start;
  late TimeOfDay _end;
  bool _completed = true;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _title = TextEditingController(text: e?.title ?? '');
    _tags = TextEditingController(text: e?.tags.join(', ') ?? '');
    _description = TextEditingController(text: e?.description ?? '');
    _day = e?.dueDate != null
        ? DateTime(e!.dueDate!.year, e.dueDate!.month, e.dueDate!.day)
        : DateTime(
            widget.initialDay.year,
            widget.initialDay.month,
            widget.initialDay.day,
          );
    _endDay = e?.endDate != null
        ? DateTime(e!.endDate!.year, e.endDate!.month, e.endDate!.day)
        : _day;
    _start = _parseHm(e?.startTime) ?? const TimeOfDay(hour: 9, minute: 0);
    _end = _parseHm(e?.endTime) ?? const TimeOfDay(hour: 10, minute: 0);
    _completed = e?.completed ?? true;
  }

  @override
  void dispose() {
    _title.dispose();
    _tags.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickStartDay() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(_day.year - 2),
      lastDate: DateTime(_day.year + 3),
    );
    if (d != null) {
      setState(() {
        _day = DateTime(d.year, d.month, d.day);
        if (_endDay.isBefore(_day)) _endDay = _day;
      });
    }
  }

  Future<void> _pickEndDay() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _endDay,
      firstDate: _day,
      lastDate: DateTime(_day.year + 3),
    );
    if (d != null) setState(() => _endDay = DateTime(d.year, d.month, d.day));
  }

  Future<void> _pickStart() async {
    final t = await showTimePicker(context: context, initialTime: _start);
    if (t != null) setState(() => _start = t);
  }

  Future<void> _pickEnd() async {
    final t = await showTimePicker(context: context, initialTime: _end);
    if (t != null) setState(() => _end = t);
  }

  Task _buildTask() {
    final tags = _tags.text
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    final id = widget.existing?.id ?? _uuid.v4();
    final endDate =
        _dateOnly(_endDay) != _dateOnly(_day) ? _endDay : null;
    final base = widget.existing;
    if (base != null) {
      return base.copyWith(
        title: _title.text.trim(),
        completed: _completed,
        dueDate: _day,
        endDate: endDate,
        tags: tags,
        startTime: _formatHm(_start),
        endTime: _formatHm(_end),
        description: _description.text.trim(),
      );
    }
    return newLocalTask(
      id: id,
      title: _title.text.trim(),
      completed: _completed,
      dueDate: _day,
      endDate: endDate,
      tags: tags,
      isTimeLog: true,
      startTime: _formatHm(_start),
      endTime: _formatHm(_end),
      description: _description.text.trim(),
    );
  }

  void _submit() {
    final startAt = _dateTimeOn(_day, _start);
    final endAt = _dateTimeOn(_endDay, _end);
    final dur = endAt.difference(startAt).inMinutes;
    if (dur <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('開始と終了を別の時刻にしてください。')),
      );
      return;
    }
    if (_title.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('タイトルを入力してください。')),
      );
      return;
    }
    widget.onSave(_buildTask());
    Navigator.pop(context);
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
                  widget.existing == null ? 'ログを追加' : 'ログを編集',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: AppSpacing.lg),
                TextField(
                  controller: _title,
                  decoration: const InputDecoration(
                    labelText: 'タイトル',
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  '開始',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: OutlinedButton.icon(
                        onPressed: _pickStartDay,
                        icon: const Icon(Icons.event_outlined, size: 18),
                        label: Text(
                          '${_day.year}-${_day.month.toString().padLeft(2, '0')}-${_day.day.toString().padLeft(2, '0')}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      flex: 2,
                      child: OutlinedButton(
                        onPressed: _pickStart,
                        child: Text(_formatHm(_start)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  '終了',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: OutlinedButton.icon(
                        onPressed: _pickEndDay,
                        icon: const Icon(Icons.event_outlined, size: 18),
                        label: Text(
                          '${_endDay.year}-${_endDay.month.toString().padLeft(2, '0')}-${_endDay.day.toString().padLeft(2, '0')}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      flex: 2,
                      child: OutlinedButton(
                        onPressed: _pickEnd,
                        child: Text(_formatHm(_end)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  '終了が開始より早い時刻のときは、翌日までの記録（睡眠など）として扱います。',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: AppSpacing.md),
                TextField(
                  controller: _tags,
                  decoration: const InputDecoration(
                    labelText: 'タグ（カンマ区切り）',
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                TextField(
                  controller: _description,
                  decoration: const InputDecoration(
                    labelText: 'メモ（任意）',
                  ),
                  minLines: 2,
                  maxLines: 4,
                ),
                const SizedBox(height: AppSpacing.sm),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('完了として記録'),
                  value: _completed,
                  onChanged: (v) => setState(() => _completed = v),
                ),
                const SizedBox(height: AppSpacing.lg),
                FilledButton(
                  onPressed: _submit,
                  child: const Text('保存'),
                ),
                if (widget.existing != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  OutlinedButton(
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('削除'),
                          content: const Text('このログを削除しますか？'),
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
              ],
            ),
          ),
        ),
      ),
    );
  }
}
