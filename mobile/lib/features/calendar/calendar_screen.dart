import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';

final calendarSelectedDateProvider = StateProvider<DateTime>((ref) {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
});

enum CalendarMode { month, week }

final calendarModeProvider = StateProvider<CalendarMode>((_) => CalendarMode.month);

class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(calendarSelectedDateProvider);
    final mode = ref.watch(calendarModeProvider);
    final tasks = ref.watch(todoListProvider);
    final monthStart = DateTime(selected.year, selected.month, 1);
    final gridStart = monthStart.subtract(Duration(days: monthStart.weekday - 1));

    final dueOnSelected = tasks
        .where((t) => !t.isTimeLog && sameCalendarDay(t.dueDate, selected))
        .toList()
      ..sort((a, b) => a.completed == b.completed ? a.title.compareTo(b.title) : (a.completed ? 1 : -1));

    final logsOnSelected = tasks
        .where((t) => t.isTimeLog && sameCalendarDay(t.dueDate, selected))
        .toList()
      ..sort((a, b) => timeLogStartSortMinutes(a).compareTo(timeLogStartSortMinutes(b)));

    final plannedTitles = dueOnSelected
        .map((t) => t.title.trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toSet();
    final loggedTitles = logsOnSelected
        .map((t) => t.title.trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toSet();
    final matched = plannedTitles.intersection(loggedTitles).length;
    final plannedOnly = plannedTitles.difference(loggedTitles).length;
    final loggedOnly = loggedTitles.difference(plannedTitles).length;

    int countForDay(DateTime day) {
      return tasks.where((t) => !t.isTimeLog && sameCalendarDay(t.dueDate, day)).length;
    }

    int logCountForDay(DateTime day) {
      return tasks.where((t) => t.isTimeLog && sameCalendarDay(t.dueDate, day)).length;
    }

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.lg, AppSpacing.xl, 120),
        children: [
          Text('Calendar', style: Theme.of(context).textTheme.displaySmall),
          const SizedBox(height: AppSpacing.md),
          SegmentedButton<CalendarMode>(
            segments: const [
              ButtonSegment(value: CalendarMode.month, label: Text('Month')),
              ButtonSegment(value: CalendarMode.week, label: Text('Week')),
            ],
            selected: {mode},
            onSelectionChanged: (v) {
              ref.read(calendarModeProvider.notifier).state = v.first;
            },
          ),
          const SizedBox(height: AppSpacing.lg),
          _CalendarHeader(
            selected: selected,
            mode: mode,
            onPrevMonth: () {
              final next = mode == CalendarMode.month
                  ? DateTime(selected.year, selected.month - 1, 1)
                  : DateTime(selected.year, selected.month, selected.day - 7);
              ref.read(calendarSelectedDateProvider.notifier).state = next;
            },
            onNextMonth: () {
              final next = mode == CalendarMode.month
                  ? DateTime(selected.year, selected.month + 1, 1)
                  : DateTime(selected.year, selected.month, selected.day + 7);
              ref.read(calendarSelectedDateProvider.notifier).state = next;
            },
            onToday: () {
              final n = DateTime.now();
              ref.read(calendarSelectedDateProvider.notifier).state = DateTime(n.year, n.month, n.day);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          if (mode == CalendarMode.month) ...[
            const _WeekdayRow(),
            const SizedBox(height: AppSpacing.sm),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: 42,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                crossAxisSpacing: AppSpacing.sm,
                mainAxisSpacing: AppSpacing.sm,
                childAspectRatio: 0.82,
              ),
              itemBuilder: (context, index) {
                final day = gridStart.add(Duration(days: index));
                final inMonth = day.month == selected.month;
                final selectedDay = sameCalendarDay(day, selected);
                final dueCount = countForDay(day);
                final logCount = logCountForDay(day);
                return _DayCell(
                  day: day,
                  inMonth: inMonth,
                  selected: selectedDay,
                  dueCount: dueCount,
                  logCount: logCount,
                  onTap: () {
                    ref.read(calendarSelectedDateProvider.notifier).state = DateTime(day.year, day.month, day.day);
                  },
                );
              },
            ),
          ] else ...[
            _WeekTimeline(
              selected: selected,
              tasks: tasks,
              onSelectDay: (d) {
                ref.read(calendarSelectedDateProvider.notifier).state = DateTime(d.year, d.month, d.day);
              },
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          Text(
            '${selected.year}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.md),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Plan vs Log', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _summaryChip(context, '一致', matched),
                      _summaryChip(context, '予定のみ', plannedOnly),
                      _summaryChip(context, 'ログのみ', loggedOnly),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (dueOnSelected.isEmpty && logsOnSelected.isEmpty)
            Text('この日の予定・ログはありません', style: Theme.of(context).textTheme.bodyMedium)
          else ...[
            if (dueOnSelected.isNotEmpty) ...[
              Text('予定 / To-Do', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: AppSpacing.sm),
              ...dueOnSelected.map(
                (t) => _TaskLine(
                  title: t.title,
                  subtitle: t.tags.isEmpty ? null : t.tags.join(', '),
                  done: t.completed,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (logsOnSelected.isNotEmpty) ...[
              Text('ログ', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: AppSpacing.sm),
              ...logsOnSelected.map(
                (t) => _TaskLine(
                  title: t.title,
                  subtitle: [if (t.startTime != null) t.startTime, if (t.endTime != null) t.endTime].join(' - '),
                  done: t.completed,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _CalendarHeader extends StatelessWidget {
  const _CalendarHeader({
    required this.selected,
    required this.mode,
    required this.onPrevMonth,
    required this.onNextMonth,
    required this.onToday,
  });

  final DateTime selected;
  final CalendarMode mode;
  final VoidCallback onPrevMonth;
  final VoidCallback onNextMonth;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(onPressed: onPrevMonth, icon: const Icon(Icons.chevron_left)),
        Expanded(
          child: Center(
            child: Text(
              mode == CalendarMode.month
                  ? '${selected.year}年 ${selected.month}月'
                  : _weekLabel(selected),
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ),
        IconButton(onPressed: onNextMonth, icon: const Icon(Icons.chevron_right)),
        const SizedBox(width: AppSpacing.sm),
        OutlinedButton(onPressed: onToday, child: const Text('今日')),
      ],
    );
  }
}

String _weekLabel(DateTime anchor) {
  final start = anchor.subtract(Duration(days: anchor.weekday - 1));
  final end = start.add(const Duration(days: 6));
  return '${start.month}/${start.day} - ${end.month}/${end.day}';
}

class _WeekdayRow extends StatelessWidget {
  const _WeekdayRow();

  @override
  Widget build(BuildContext context) {
    const labels = ['月', '火', '水', '木', '金', '土', '日'];
    return Row(
      children: [
        for (final l in labels)
          Expanded(
            child: Center(
              child: Text(l, style: Theme.of(context).textTheme.labelMedium),
            ),
          ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.inMonth,
    required this.selected,
    required this.dueCount,
    required this.logCount,
    required this.onTap,
  });

  final DateTime day;
  final bool inMonth;
  final bool selected;
  final int dueCount;
  final int logCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: selected
          ? cs.primary.withValues(alpha: 0.14)
          : cs.surfaceContainerLowest.withValues(alpha: inMonth ? 1 : 0.6),
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${day.day}',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: inMonth ? cs.onSurface : cs.onSurfaceVariant,
                    ),
              ),
              const Spacer(),
              if (dueCount > 0) Text('T:$dueCount', style: Theme.of(context).textTheme.labelSmall),
              if (logCount > 0) Text('L:$logCount', style: Theme.of(context).textTheme.labelSmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskLine extends StatelessWidget {
  const _TaskLine({required this.title, required this.done, this.subtitle});

  final String title;
  final bool done;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  decoration: done ? TextDecoration.lineThrough : null,
                ),
          ),
          if (subtitle != null && subtitle!.trim().isNotEmpty)
            Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

Widget _summaryChip(BuildContext context, String label, int value) {
  final cs = Theme.of(context).colorScheme;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
    decoration: BoxDecoration(
      color: cs.surfaceContainerHighest.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(AppRadius.md),
    ),
    child: Text(
      '$label: $value',
      style: Theme.of(context).textTheme.labelLarge,
    ),
  );
}

class _WeekTimeline extends StatelessWidget {
  const _WeekTimeline({
    required this.selected,
    required this.tasks,
    required this.onSelectDay,
  });

  final DateTime selected;
  final List<Task> tasks;
  final ValueChanged<DateTime> onSelectDay;

  @override
  Widget build(BuildContext context) {
    final start = selected.subtract(Duration(days: selected.weekday - 1));
    final days = List.generate(7, (i) => start.add(Duration(days: i)));
    return SizedBox(
      height: 300,
      child: Row(
        children: [
          for (final d in days)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(right: AppSpacing.sm),
                child: _WeekDayColumn(
                  day: d,
                  selected: sameCalendarDay(d, selected),
                  tasks: tasks,
                  onTap: () => onSelectDay(d),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _WeekDayColumn extends StatelessWidget {
  const _WeekDayColumn({
    required this.day,
    required this.selected,
    required this.tasks,
    required this.onTap,
  });

  final DateTime day;
  final bool selected;
  final List<Task> tasks;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final todos = tasks.where((t) => !t.isTimeLog && sameCalendarDay(t.dueDate, day)).toList();
    final logs = tasks.where((t) => t.isTimeLog && sameCalendarDay(t.dueDate, day)).toList();
    logs.sort((a, b) => timeLogStartSortMinutes(a).compareTo(timeLogStartSortMinutes(b)));
    return Material(
      color: selected ? cs.primary.withValues(alpha: 0.14) : cs.surfaceContainerLowest,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${day.month}/${day.day}', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: AppSpacing.sm),
              Text('T ${todos.length}', style: Theme.of(context).textTheme.labelSmall),
              Text('L ${logs.length}', style: Theme.of(context).textTheme.labelSmall),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: ListView(
                  children: [
                    ...logs.take(3).map(
                      (l) => Text(
                        '${l.startTime ?? '--:--'} ${l.title}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
