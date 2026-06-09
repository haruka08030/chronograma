import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../design/design.dart';
import '../../shared/pickers/native_pickers.dart';
import '../../shared/widgets/kinetic_gradient_fab.dart';
import '../calendar/calendar_blocks.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';
import 'log_providers.dart';
import 'time_log_edit_sheet.dart';

class LogScreen extends ConsumerStatefulWidget {
  const LogScreen({super.key});

  @override
  ConsumerState<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends ConsumerState<LogScreen> {
  static const _uuid = Uuid();
  late final TextEditingController _timerTitle;
  Timer? _ticker;
  DateTime _now = DateTime.now();
  String _timerTag = '';

  @override
  void initState() {
    super.initState();
    _timerTitle = TextEditingController();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _timerTitle.dispose();
    super.dispose();
  }

  void _showUndoSnack(BuildContext context, String message, VoidCallback onUndo) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        action: SnackBarAction(label: '取り消し', onPressed: onUndo),
        duration: const Duration(seconds: 6),
      ),
    );
  }

  String _formatElapsed(ActiveLogTimer? timer) {
    if (timer == null) return '00:00';
    final sec = _now.difference(timer.startedAt).inSeconds;
    final h = sec ~/ 3600;
    final m = (sec % 3600) ~/ 60;
    final s = sec % 60;
    if (h > 0) {
      return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    }
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  void _stopTimerToLog() {
    final timer = ref.read(activeLogTimerProvider);
    if (timer == null) return;
    final start = timer.startedAt;
    final end = DateTime.now();
    final startDate = DateTime(start.year, start.month, start.day);
    final endDateOnly = DateTime(end.year, end.month, end.day);
    final startHm =
        '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}';
    final endHm =
        '${end.hour.toString().padLeft(2, '0')}:${end.minute.toString().padLeft(2, '0')}';
    final task = newLocalTask(
      id: _uuid.v4(),
      title: timer.title.isEmpty ? 'Timer Log' : timer.title,
      completed: true,
      dueDate: startDate,
      endDate: endDateOnly != startDate ? endDateOnly : null,
      tags: timer.tag.isEmpty ? const [] : [timer.tag],
      isTimeLog: true,
      startTime: startHm,
      endTime: endHm,
      description: 'timer',
    );
    ref.read(todoListProvider.notifier).putTimeLog(task);
    ref.read(activeLogTimerProvider.notifier).clear();
    _timerTitle.clear();
  }

  void _editLog(Task logTask, DateTime day) {
    showTimeLogEditSheet(
      context: context,
      initialDay: day,
      existing: logTask,
      onSave: (updated) =>
          ref.read(todoListProvider.notifier).putTimeLog(updated),
      onDelete: () {
        ref.read(todoListProvider.notifier).deleteTaskWithUndo(
              logTask.id,
              showUndo: (msg, undo) => _showUndoSnack(context, msg, undo),
            );
      },
    );
  }

  void _createLogAt(DateTime day, int startMinutes) {
    showTimeLogEditSheet(
      context: context,
      initialDay: day,
      initialStartMinutes: startMinutes,
      onSave: (task) => ref.read(todoListProvider.notifier).putTimeLog(task),
      onDelete: () {},
    );
  }

  Widget _buildTimerTagPicker() {
    final presets = ref.watch(timeLogTagPresetsProvider);
    if (presets.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.sm),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Wrap(
          spacing: 6,
          children: [
            for (final tag in presets)
              ChoiceChip(
                label: Text(tag),
                visualDensity: VisualDensity.compact,
                selected: _timerTag.toLowerCase() == tag.toLowerCase(),
                onSelected: (sel) =>
                    setState(() => _timerTag = sel ? tag : ''),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final day = ref.watch(logSelectedDateProvider);
    final entries = ref.watch(logEntriesForSelectedDateProvider);
    final brightness = Theme.of(context).brightness;
    final timer = ref.watch(activeLogTimerProvider);

    void shiftDay(int delta) {
      ref.read(logSelectedDateProvider.notifier).state =
          DateTime(day.year, day.month, day.day + delta);
    }

    final blocks = <TimeBlockData>[
      for (final t in entries)
        if (logBlock(t, day, brightness: brightness, onTap: () => _editLog(t, day))
            case final TimeBlockData b)
          b,
    ];

    final totalMinutes = entries.fold<int>(0, (sum, t) {
      final start = parseHhmmToMinutes(t.startTime);
      final end = parseHhmmToMinutes(t.endTime);
      if (start == null || end == null) return sum;
      final dur = end - start;
      return sum + (dur > 0 ? dur : dur + 24 * 60);
    });

    return Stack(
      children: [
        SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                  0,
                ),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: '前の日',
                      onPressed: () => shiftDay(-1),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Expanded(
                      child: TextButton(
                        onPressed: () async {
                          final picked = await pickNativeDate(
                            context,
                            initialDate: day,
                            firstDate: DateTime(day.year - 2),
                            lastDate: DateTime(day.year + 3),
                          );
                          if (picked != null) {
                            ref.read(logSelectedDateProvider.notifier).state =
                                DateTime(picked.year, picked.month, picked.day);
                          }
                        },
                        child: Text(
                          '${day.year}年${day.month}月${day.day}日',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: '次の日',
                      onPressed: () => shiftDay(1),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  0,
                  AppSpacing.lg,
                  AppSpacing.sm,
                ),
                child: _CompactTimer(
                  timer: timer,
                  elapsedLabel: _formatElapsed(timer),
                  totalMinutes: totalMinutes,
                  titleController: _timerTitle,
                  onStart: () => ref
                      .read(activeLogTimerProvider.notifier)
                      .start(title: _timerTitle.text.trim(), tag: _timerTag),
                  onStop: () {
                    _stopTimerToLog();
                    setState(() => _timerTag = '');
                  },
                ),
              ),
              if (timer == null) _buildTimerTagPicker(),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 78),
                  child: TimeGrid(
                    columns: [
                      TimeGridColumn(
                        isToday: sameCalendarDay(DateTime.now(), day),
                        blocks: blocks,
                        onTapEmptyMinutes: (m) => _createLogAt(day, m),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        KineticGradientFab(
          onPressed: () => _createLogAt(day, 9 * 60),
        ),
      ],
    );
  }
}

/// Compact one-row timer + day total (journal header strip).
class _CompactTimer extends StatelessWidget {
  const _CompactTimer({
    required this.timer,
    required this.elapsedLabel,
    required this.totalMinutes,
    required this.titleController,
    required this.onStart,
    required this.onStop,
  });

  final ActiveLogTimer? timer;
  final String elapsedLabel;
  final int totalMinutes;
  final TextEditingController titleController;
  final VoidCallback onStart;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final running = timer != null;
    final totalLabel = totalMinutes > 0
        ? '合計 ${totalMinutes ~/ 60}h ${(totalMinutes % 60).toString().padLeft(2, '0')}m'
        : '';

    return ChronogramaCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      child: Row(
        children: [
          if (running) ...[
            const Icon(Icons.timer_outlined, size: 18, color: Color(0xFFEF4444)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                elapsedLabel,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: onStop,
              icon: const Icon(Icons.stop, size: 18),
              label: const Text('記録'),
            ),
          ] else ...[
            Expanded(
              child: TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  hintText: '記録するタスク…',
                  isDense: true,
                ),
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => onStart(),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            FilledButton.tonalIcon(
              onPressed: onStart,
              icon: const Icon(Icons.play_arrow, size: 18),
              label: const Text('開始'),
            ),
          ],
          if (totalLabel.isNotEmpty) ...[
            const SizedBox(width: AppSpacing.sm),
            Text(
              totalLabel,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.zinc500,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}
