import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../design/app_spacing.dart';
import '../../shared/widgets/kinetic_gradient_fab.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';
import 'log_providers.dart';
import 'log_tag_colors.dart';
import 'time_log_edit_sheet.dart';

class LogScreen extends ConsumerStatefulWidget {
  const LogScreen({super.key});

  @override
  ConsumerState<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends ConsumerState<LogScreen> {
  static const _uuid = Uuid();
  late final TextEditingController _timerTitle;
  late final TextEditingController _timerTag;
  Timer? _ticker;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timerTitle = TextEditingController();
    _timerTag = TextEditingController();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _timerTitle.dispose();
    _timerTag.dispose();
    super.dispose();
  }

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

  void _stopTimerToLog(WidgetRef ref, DateTime _) {
    final timer = ref.read(activeLogTimerProvider);
    if (timer == null) return;
    final start = timer.startedAt;
    final end = DateTime.now();
    final startDate = DateTime(start.year, start.month, start.day);
    final endDateOnly = DateTime(end.year, end.month, end.day);
    final startHm = '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}';
    final endHm = '${end.hour.toString().padLeft(2, '0')}:${end.minute.toString().padLeft(2, '0')}';
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

    return Stack(
      children: [
        SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.xl,
                  AppSpacing.lg,
                  AppSpacing.xl,
                  AppSpacing.sm,
                ),
                child: Text(
                  'Log',
                  style: Theme.of(context).textTheme.displaySmall,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: '前の日',
                      onPressed: () => shiftDay(-1),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Expanded(
                      child: FilledButton.tonal(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
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
                          style: Theme.of(context).textTheme.titleMedium,
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
              const SizedBox(height: AppSpacing.sm),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: _TimerCard(
                  timer: timer,
                  elapsedLabel: _formatElapsed(timer),
                  titleController: _timerTitle,
                  tagController: _timerTag,
                  onStart: () {
                    final title = _timerTitle.text.trim();
                    ref.read(activeLogTimerProvider.notifier).start(
                          title: title,
                          tag: _timerTag.text.trim(),
                        );
                  },
                  onStop: () => _stopTimerToLog(ref, day),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.xl,
                    AppSpacing.md,
                    AppSpacing.xl,
                    120,
                  ),
                  children: [
                    if (entries.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 48),
                        child: Center(
                          child: Text(
                            'この日のログはまだありません',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ),
                      )
                    else
                      ...entries.map(
                        (logTask) => Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: _LogEntryCard(
                            task: logTask,
                            accent: logAccentColorForTags(logTask.tags, brightness),
                            onTap: () => showTimeLogEditSheet(
                              context: context,
                              initialDay: day,
                              existing: logTask,
                              onSave: (updated) => ref
                                  .read(todoListProvider.notifier)
                                  .putTimeLog(updated),
                              onDelete: () {
                                ref.read(todoListProvider.notifier).deleteTaskWithUndo(
                                      logTask.id,
                                      showUndo: (msg, undo) =>
                                          _showUndoSnack(context, msg, undo),
                                    );
                              },
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        KineticGradientFab(
          onPressed: () => showTimeLogEditSheet(
            context: context,
            initialDay: day,
            existing: null,
            onSave: (task) =>
                ref.read(todoListProvider.notifier).putTimeLog(task),
            onDelete: () {},
          ),
        ),
      ],
    );
  }
}

class _TimerCard extends StatelessWidget {
  const _TimerCard({
    required this.timer,
    required this.elapsedLabel,
    required this.titleController,
    required this.tagController,
    required this.onStart,
    required this.onStop,
  });

  final ActiveLogTimer? timer;
  final String elapsedLabel;
  final TextEditingController titleController;
  final TextEditingController tagController;
  final VoidCallback onStart;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final running = timer != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    running ? 'タイマー実行中: $elapsedLabel' : 'タイマー停止中',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                if (running)
                  FilledButton.tonalIcon(
                    onPressed: onStop,
                    icon: const Icon(Icons.stop),
                    label: const Text('停止して記録'),
                  )
                else
                  FilledButton.tonalIcon(
                    onPressed: onStart,
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('開始'),
                  ),
              ],
            ),
            if (!running) ...[
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: titleController,
                decoration: const InputDecoration(labelText: 'タイトル'),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: tagController,
                decoration: const InputDecoration(labelText: 'タグ（任意）'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LogEntryCard extends StatelessWidget {
  const _LogEntryCard({
    required this.task,
    required this.accent,
    required this.onTap,
  });

  final Task task;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final timeRange = '${task.startTime ?? '—'} – ${task.endTime ?? '—'}';
    final desc = task.description.trim();

    return Material(
      color: cs.surfaceContainerLowest,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 4,
                decoration: BoxDecoration(
                  color: accent,
                  borderRadius: const BorderRadius.horizontal(left: Radius.circular(12)),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        timeRange,
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              color: cs.primary,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 4),
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
                      if (desc.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          desc,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: cs.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
