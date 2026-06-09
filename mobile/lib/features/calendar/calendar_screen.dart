import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../design/design.dart';
import '../../l10n/app_strings.dart';
import '../../shared/pickers/native_pickers.dart';
import '../../shared/selected_date_provider.dart';
import '../google/google_calendar_service.dart';
import '../google/google_connection_provider.dart';
import '../log/time_log_edit_sheet.dart';
import '../plan_vs_actual/plan_vs_actual_panel.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';
import '../todo/sheets/task_detail_sheet.dart';
import 'calendar_blocks.dart';
import 'calendar_gcal_provider.dart';

/// タブ共有の選択日（[selectedDateProvider] のエイリアス）。
final calendarSelectedDateProvider = selectedDateProvider;

enum CalendarMode { month, week, day, plan }

final calendarModeProvider = StateProvider<CalendarMode>(
  (_) => CalendarMode.month,
);

const _uuid = Uuid();

String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

bool _isToday(DateTime d) {
  final n = DateTime.now();
  return d.year == n.year && d.month == n.month && d.day == n.day;
}

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeFetchGoogle());
  }

  void _maybeFetchGoogle() {
    final selected = ref.read(calendarSelectedDateProvider);
    final mode = ref.read(calendarModeProvider);
    late DateTime start;
    late DateTime end;
    switch (mode) {
      case CalendarMode.month:
        final monthStart = DateTime(selected.year, selected.month, 1);
        start = monthStart.subtract(Duration(days: monthStart.weekday - 1));
        end = start.add(const Duration(days: 41));
      case CalendarMode.week:
        start = selected.subtract(Duration(days: selected.weekday - 1));
        end = start.add(const Duration(days: 6));
      case CalendarMode.day:
      case CalendarMode.plan:
        start = DateTime(selected.year, selected.month, selected.day);
        end = start;
    }
    unawaited(refreshCalendarEvents(ref, rangeStart: start, rangeEnd: end));
  }

  void _showUndoSnack(String message, VoidCallback onUndo) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        action: SnackBarAction(label: '取り消し', onPressed: onUndo),
        duration: const Duration(seconds: 6),
      ),
    );
  }

  void _openTask(Task t) {
    showTaskDetailSheet(
      context: context,
      task: t,
      onSave: (u) => ref.read(todoListProvider.notifier).updateTask(u),
      onDelete: () => ref.read(todoListProvider.notifier).deleteTaskWithUndo(
            t.id,
            showUndo: _showUndoSnack,
          ),
    );
  }

  void _openLog(Task t) {
    showTimeLogEditSheet(
      context: context,
      initialDay: t.dueDate ?? ref.read(calendarSelectedDateProvider),
      existing: t,
      onSave: (u) => ref.read(todoListProvider.notifier).putTimeLog(u),
      onDelete: () => ref.read(todoListProvider.notifier).deleteTaskWithUndo(
            t.id,
            showUndo: _showUndoSnack,
          ),
    );
  }

  void _createTaskAt(DateTime day, int startMinutes) {
    final start = snapToSlot(startMinutes);
    final t = newLocalTask(
      id: _uuid.v4(),
      title: '',
      dueDate: DateTime(day.year, day.month, day.day),
      startTime: minutesToHhmm(start),
      endTime: minutesToHhmm((start + 60).clamp(0, 24 * 60 - 1)),
    );
    showTaskDetailSheet(
      context: context,
      task: t,
      allowSubtasks: false,
      onSave: (u) {
        if (u.title.trim().isEmpty) return;
        ref.read(todoListProvider.notifier).addTask(u);
      },
      onDelete: () {},
    );
  }

  void _moveBlock(Task t, int newStartMinutes) {
    final start = parseHhmmToMinutes(t.startTime);
    if (start == null) return;
    final end = parseHhmmToMinutes(t.endTime) ?? (start + 60);
    final dur = end - start;
    final newEnd = (newStartMinutes + dur).clamp(0, 24 * 60);
    ref.read(todoListProvider.notifier).updateTask(
          t.copyWith(
            startTime: minutesToHhmm(newStartMinutes),
            endTime: minutesToHhmm(newEnd),
          ),
        );
  }

  void _resizeBlock(Task t, int newEndMinutes) {
    ref.read(todoListProvider.notifier).updateTask(
          t.copyWith(endTime: minutesToHhmm(newEndMinutes)),
        );
  }

  void _scheduleTaskOnDay(String taskId, DateTime day, int minutes) {
    final matches = ref.read(todoListProvider).where((t) => t.id == taskId);
    if (matches.isEmpty) return;
    final t = matches.first;
    final start = parseHhmmToMinutes(t.startTime);
    final end = parseHhmmToMinutes(t.endTime);
    final dur = (start != null && end != null) ? (end - start) : 60;
    final newEnd = (minutes + dur).clamp(0, 24 * 60);
    ref.read(todoListProvider.notifier).updateTask(
          t.copyWith(
            dueDate: DateTime(day.year, day.month, day.day),
            startTime: minutesToHhmm(minutes),
            endTime: minutesToHhmm(newEnd),
          ),
        );
  }

  void _openGoogle(CalendarEventDto e) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(e.summary),
        content: Text(
          e.isAllDay
              ? S(ref.read(appLocaleProvider)).allDay
              : '${e.startTime ?? ''} - ${e.endTime ?? ''}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(S(ref.read(appLocaleProvider)).ok),
          ),
        ],
      ),
    );
  }

  void _shift(int direction, CalendarMode mode, DateTime selected) {
    late DateTime next;
    switch (mode) {
      case CalendarMode.month:
        next = DateTime(selected.year, selected.month + direction, 1);
      case CalendarMode.week:
        next = selected.add(Duration(days: 7 * direction));
      case CalendarMode.day:
      case CalendarMode.plan:
        next = selected.add(Duration(days: direction));
    }
    ref.read(calendarSelectedDateProvider.notifier).state = next;
    _maybeFetchGoogle();
  }

  @override
  Widget build(BuildContext context) {
    final s = S(ref.watch(appLocaleProvider));
    final selected = ref.watch(calendarSelectedDateProvider);
    final mode = ref.watch(calendarModeProvider);

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: Column(
              children: [
                SegmentedButton<CalendarMode>(
                  segments: [
                    ButtonSegment(value: CalendarMode.month, label: Text(s.month)),
                    ButtonSegment(value: CalendarMode.week, label: Text(s.week)),
                    ButtonSegment(value: CalendarMode.day, label: Text(s.day)),
                    ButtonSegment(value: CalendarMode.plan, label: Text(s.plan)),
                  ],
                  selected: {mode},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) {
                    ref.read(calendarModeProvider.notifier).state = v.first;
                    _maybeFetchGoogle();
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                _CalendarHeader(
                  selected: selected,
                  mode: mode,
                  onPrev: () => _shift(-1, mode, selected),
                  onNext: () => _shift(1, mode, selected),
                  onToday: () {
                    final n = DateTime.now();
                    ref.read(calendarSelectedDateProvider.notifier).state =
                        DateTime(n.year, n.month, n.day);
                    _maybeFetchGoogle();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: switch (mode) {
              CalendarMode.month => _MonthBody(
                  selected: selected,
                  onSelectDay: (d) {
                    ref.read(calendarSelectedDateProvider.notifier).state = d;
                  },
                  onOpenTask: _openTask,
                  onOpenLog: _openLog,
                  onOpenGoogle: _openGoogle,
                ),
              CalendarMode.week => _WeekBody(
                  selected: selected,
                  onOpenTask: _openTask,
                  onOpenLog: _openLog,
                  onOpenGoogle: _openGoogle,
                  onCreate: _createTaskAt,
                  onMoveBlock: _moveBlock,
                  onResizeBlock: _resizeBlock,
                  onScheduleTask: _scheduleTaskOnDay,
                  onSelectDay: (d) {
                    ref.read(calendarSelectedDateProvider.notifier).state = d;
                  },
                ),
              CalendarMode.day => _DayBody(
                  selected: selected,
                  onOpenTask: _openTask,
                  onOpenLog: _openLog,
                  onOpenGoogle: _openGoogle,
                  onCreate: _createTaskAt,
                  onMoveBlock: _moveBlock,
                  onResizeBlock: _resizeBlock,
                  onScheduleTask: _scheduleTaskOnDay,
                ),
              CalendarMode.plan => PlanVsActualPanel(anchor: selected),
            },
          ),
          _TodoDock(
            day: selected,
            onSchedule: (id, minutes) => _scheduleTaskOnDay(id, selected, minutes),
            onPickTime: (id) => _pickTimeAndSchedule(id, selected),
          ),
        ],
      ),
    );
  }

  Future<void> _pickTimeAndSchedule(String taskId, DateTime day) async {
    final picked = await pickNativeTime(
      context,
      initialTime: const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked == null) return;
    _scheduleTaskOnDay(taskId, day, picked.hour * 60 + picked.minute);
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

class _CalendarHeader extends ConsumerWidget {
  const _CalendarHeader({
    required this.selected,
    required this.mode,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
  });

  final DateTime selected;
  final CalendarMode mode;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S(ref.watch(appLocaleProvider));
    final label = switch (mode) {
      CalendarMode.month => '${selected.year}年 ${selected.month}月',
      CalendarMode.week => _weekLabel(selected),
      CalendarMode.day ||
      CalendarMode.plan =>
        '${selected.month}月${selected.day}日 (${_weekdayJa(selected.weekday)})',
    };
    return Row(
      children: [
        IconButton(onPressed: onPrev, icon: const Icon(Icons.chevron_left)),
        Expanded(
          child: Center(
            child: Text(
              label,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ),
        IconButton(onPressed: onNext, icon: const Icon(Icons.chevron_right)),
        const SizedBox(width: AppSpacing.xs),
        OutlinedButton(onPressed: onToday, child: Text(s.today)),
      ],
    );
  }
}

String _weekLabel(DateTime anchor) {
  final start = anchor.subtract(Duration(days: anchor.weekday - 1));
  final end = start.add(const Duration(days: 6));
  return '${start.month}/${start.day} - ${end.month}/${end.day}';
}

String _weekdayJa(int weekday) {
  const labels = ['月', '火', '水', '木', '金', '土', '日'];
  return labels[(weekday - 1) % 7];
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

class _MonthBody extends ConsumerWidget {
  const _MonthBody({
    required this.selected,
    required this.onSelectDay,
    required this.onOpenTask,
    required this.onOpenLog,
    required this.onOpenGoogle,
  });

  final DateTime selected;
  final ValueChanged<DateTime> onSelectDay;
  final void Function(Task) onOpenTask;
  final void Function(Task) onOpenLog;
  final void Function(CalendarEventDto) onOpenGoogle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(todoListProvider);
    final events = ref.watch(calendarEventsProvider);
    final monthStart = DateTime(selected.year, selected.month, 1);
    final gridStart = monthStart.subtract(Duration(days: monthStart.weekday - 1));

    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 96),
      children: [
        const _WeekdayRow(),
        const SizedBox(height: AppSpacing.xs),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: 42,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisExtent: 78,
          ),
          itemBuilder: (context, index) {
            final day = gridStart.add(Duration(days: index));
            final inMonth = day.month == selected.month;
            final dayEvents = events
                .where((e) => e.date == _ymd(day) && !e.isAllDay)
                .toList();
            final dayTasks = tasks
                .where((t) =>
                    !t.isTimeLog &&
                    t.parentId == null &&
                    sameCalendarDay(t.dueDate, day))
                .toList();
            return _MonthDayCell(
              day: day,
              inMonth: inMonth,
              isToday: _isToday(day),
              selected: sameCalendarDay(day, selected),
              eventCount: dayEvents.length,
              taskTitles: dayTasks.map((t) => t.title).toList(),
              onTap: () => onSelectDay(DateTime(day.year, day.month, day.day)),
            );
          },
        ),
        const SizedBox(height: AppSpacing.lg),
        _DayAgenda(
          day: selected,
          onOpenTask: onOpenTask,
          onOpenLog: onOpenLog,
          onOpenGoogle: onOpenGoogle,
        ),
      ],
    );
  }
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
              child: Text(
                l,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: AppColors.zinc400,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MonthDayCell extends StatelessWidget {
  const _MonthDayCell({
    required this.day,
    required this.inMonth,
    required this.isToday,
    required this.selected,
    required this.eventCount,
    required this.taskTitles,
    required this.onTap,
  });

  final DateTime day;
  final bool inMonth;
  final bool isToday;
  final bool selected;
  final int eventCount;
  final List<String> taskTitles;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final lineColor = isDark ? AppColors.zinc800 : AppColors.zinc100;
    final dayNumColor = isToday
        ? Colors.white
        : (inMonth ? AppColors.zinc700 : AppColors.zinc400);

    final chips = <Widget>[];
    if (eventCount > 0) {
      chips.add(_chip(
        '$eventCount 予定',
        const Color(0xFF3B82F6),
        isDark,
        event: true,
      ));
    }
    for (final title in taskTitles.take(eventCount > 0 ? 2 : 3)) {
      chips.add(_chip(title, AppColors.accent500, isDark));
    }
    final shown = chips.length;
    final overflow = (eventCount > 0 ? 1 : 0) + taskTitles.length - shown;

    return Opacity(
      opacity: inMonth ? 1 : 0.45,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: lineColor)),
            color: selected && !isToday
                ? AppColors.accent500.withValues(alpha: isDark ? 0.10 : 0.06)
                : null,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.center,
                child: Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isToday ? AppColors.accent500 : null,
                    shape: BoxShape.circle,
                    border: selected && !isToday
                        ? Border.all(color: AppColors.accent400, width: 1.5)
                        : null,
                  ),
                  child: Text(
                    '${day.day}',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: isToday ? FontWeight.w700 : FontWeight.w500,
                      color: dayNumColor,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 2),
              ...chips,
              if (overflow > 0)
                Text(
                  '+$overflow',
                  style: const TextStyle(fontSize: 9, color: AppColors.zinc400),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String text, Color color, bool isDark, {bool event = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 1.5),
      padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.22 : 0.14),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 9,
          height: 1.1,
          color: isDark
              ? (event ? const Color(0xFF93C5FD) : AppColors.accent200)
              : (event ? const Color(0xFF1D4ED8) : AppColors.accent700),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Week view (7-column time grid)
// ---------------------------------------------------------------------------

class _WeekBody extends ConsumerWidget {
  const _WeekBody({
    required this.selected,
    required this.onOpenTask,
    required this.onOpenLog,
    required this.onOpenGoogle,
    required this.onCreate,
    required this.onMoveBlock,
    required this.onResizeBlock,
    required this.onScheduleTask,
    required this.onSelectDay,
  });

  final DateTime selected;
  final void Function(Task) onOpenTask;
  final void Function(Task) onOpenLog;
  final void Function(CalendarEventDto) onOpenGoogle;
  final void Function(DateTime day, int minutes) onCreate;
  final void Function(Task task, int newStartMinutes) onMoveBlock;
  final void Function(Task task, int newEndMinutes) onResizeBlock;
  final void Function(String taskId, DateTime day, int minutes) onScheduleTask;
  final ValueChanged<DateTime> onSelectDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(todoListProvider);
    final events = ref.watch(calendarEventsProvider);
    final brightness = Theme.of(context).brightness;
    final weekStart = selected.subtract(Duration(days: selected.weekday - 1));
    final days = List.generate(7, (i) => weekStart.add(Duration(days: i)));

    final columns = [
      for (final day in days)
        TimeGridColumn(
          isToday: _isToday(day),
          highlighted: sameCalendarDay(day, selected) && !_isToday(day),
          header: _WeekDayHeader(
            day: day,
            isToday: _isToday(day),
            selected: sameCalendarDay(day, selected),
            onTap: () => onSelectDay(DateTime(day.year, day.month, day.day)),
          ),
          onTapEmptyMinutes: (m) => onCreate(day, m),
          onAcceptTask: (id, m) => onScheduleTask(id, day, m),
          blocks: _blocksForDay(
            day,
            tasks,
            events,
            brightness,
          ),
        ),
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TimeGrid(columns: columns, compactBlocks: true),
    );
  }

  List<TimeBlockData> _blocksForDay(
    DateTime day,
    List<Task> tasks,
    List<CalendarEventDto> events,
    Brightness brightness,
  ) {
    final out = <TimeBlockData>[];
    for (final t in tasks.where((t) =>
        !t.isTimeLog && t.parentId == null && sameCalendarDay(t.dueDate, day))) {
      final b = scheduledTaskBlock(
        t,
        brightness: brightness,
        onTap: () => onOpenTask(t),
        onMove: (m) => onMoveBlock(t, m),
        onResize: (m) => onResizeBlock(t, m),
      );
      if (b != null) out.add(b);
    }
    for (final t in tasks.where((t) => t.isTimeLog)) {
      final b = logBlock(
        t,
        day,
        brightness: brightness,
        onTap: () => onOpenLog(t),
        onMove: (m) => onMoveBlock(t, m),
        onResize: (m) => onResizeBlock(t, m),
      );
      if (b != null) out.add(b);
    }
    for (final e in events.where((e) => e.date == _ymd(day))) {
      final b = googleEventBlock(e, brightness: brightness, onTap: () => onOpenGoogle(e));
      if (b != null) out.add(b);
    }
    return out;
  }
}

class _WeekDayHeader extends StatelessWidget {
  const _WeekDayHeader({
    required this.day,
    required this.isToday,
    required this.selected,
    required this.onTap,
  });

  final DateTime day;
  final bool isToday;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
        child: Column(
          children: [
            Text(
              _weekdayJa(day.weekday),
              style: const TextStyle(fontSize: 10, color: AppColors.zinc400),
            ),
            const SizedBox(height: 2),
            Container(
              width: 26,
              height: 26,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isToday ? AppColors.accent500 : null,
                shape: BoxShape.circle,
                border: selected && !isToday
                    ? Border.all(color: AppColors.accent400, width: 1.5)
                    : null,
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isToday ? Colors.white : AppColors.zinc700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Day view (single-column time grid)
// ---------------------------------------------------------------------------

class _DayBody extends ConsumerWidget {
  const _DayBody({
    required this.selected,
    required this.onOpenTask,
    required this.onOpenLog,
    required this.onOpenGoogle,
    required this.onCreate,
    required this.onMoveBlock,
    required this.onResizeBlock,
    required this.onScheduleTask,
  });

  final DateTime selected;
  final void Function(Task) onOpenTask;
  final void Function(Task) onOpenLog;
  final void Function(CalendarEventDto) onOpenGoogle;
  final void Function(DateTime day, int minutes) onCreate;
  final void Function(Task task, int newStartMinutes) onMoveBlock;
  final void Function(Task task, int newEndMinutes) onResizeBlock;
  final void Function(String taskId, DateTime day, int minutes) onScheduleTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(todoListProvider);
    final events = ref.watch(calendarEventsProvider);
    final brightness = Theme.of(context).brightness;

    final blocks = <TimeBlockData>[];
    for (final t in tasks.where((t) =>
        !t.isTimeLog && t.parentId == null && sameCalendarDay(t.dueDate, selected))) {
      final b = scheduledTaskBlock(
        t,
        brightness: brightness,
        onTap: () => onOpenTask(t),
        onMove: (m) => onMoveBlock(t, m),
        onResize: (m) => onResizeBlock(t, m),
      );
      if (b != null) blocks.add(b);
    }
    for (final t in tasks.where((t) => t.isTimeLog)) {
      final b = logBlock(
        t,
        selected,
        brightness: brightness,
        onTap: () => onOpenLog(t),
        onMove: (m) => onMoveBlock(t, m),
        onResize: (m) => onResizeBlock(t, m),
      );
      if (b != null) blocks.add(b);
    }
    for (final e in events.where((e) => e.date == _ymd(selected))) {
      final b = googleEventBlock(e, brightness: brightness, onTap: () => onOpenGoogle(e));
      if (b != null) blocks.add(b);
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TimeGrid(
        columns: [
          TimeGridColumn(
            isToday: _isToday(selected),
            blocks: blocks,
            onTapEmptyMinutes: (m) => onCreate(selected, m),
            onAcceptTask: (id, m) => onScheduleTask(id, selected, m),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Selected-day agenda (used by month view)
// ---------------------------------------------------------------------------

class _DayAgenda extends ConsumerWidget {
  const _DayAgenda({
    required this.day,
    required this.onOpenTask,
    required this.onOpenLog,
    required this.onOpenGoogle,
  });

  final DateTime day;
  final void Function(Task) onOpenTask;
  final void Function(Task) onOpenLog;
  final void Function(CalendarEventDto) onOpenGoogle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S(ref.watch(appLocaleProvider));
    final tasks = ref.watch(todoListProvider);
    final events = ref.watch(calendarEventsProvider);
    final connected = ref.watch(googleConnectedProvider);

    final googleOnDay =
        connected ? events.where((e) => e.date == _ymd(day)).toList() : <CalendarEventDto>[];
    final dueOnDay = tasks
        .where((t) =>
            !t.isTimeLog && t.parentId == null && sameCalendarDay(t.dueDate, day))
        .toList()
      ..sort((a, b) => timeLogStartSortMinutes(a).compareTo(timeLogStartSortMinutes(b)));
    final logsOnDay = tasks
        .where((t) => t.isTimeLog && timeLogTouchesCalendarDay(t, day))
        .toList()
      ..sort((a, b) => timeLogStartSortMinutes(a).compareTo(timeLogStartSortMinutes(b)));

    if (googleOnDay.isEmpty && dueOnDay.isEmpty && logsOnDay.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xl),
        child: ChronogramaEmptyState(
          message: s.noEvents,
          icon: Icons.event_available_outlined,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChronogramaSectionLabel(
          '${day.month}/${day.day} (${_weekdayJa(day.weekday)})',
        ),
        for (final e in googleOnDay)
          _AgendaRow(
            time: e.isAllDay ? s.allDay : (e.startTime ?? ''),
            title: e.summary,
            color: const Color(0xFF3B82F6),
            onTap: () => onOpenGoogle(e),
          ),
        for (final t in dueOnDay)
          _AgendaRow(
            time: t.startTime ?? '—',
            title: t.title,
            color: AppColors.accent500,
            done: t.completed,
            onTap: () => onOpenTask(t),
          ),
        for (final t in logsOnDay)
          _AgendaRow(
            time: t.startTime ?? '',
            title: t.title,
            color: const Color(0xFF059669),
            done: t.completed,
            onTap: () => onOpenLog(t),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// ToDo dock (drag a task onto the week/day grid, or tap to schedule)
// ---------------------------------------------------------------------------

class _TodoDock extends ConsumerWidget {
  const _TodoDock({
    required this.day,
    required this.onSchedule,
    required this.onPickTime,
  });

  final DateTime day;

  /// Drop on grid at minutes.
  final void Function(String taskId, int minutes) onSchedule;

  /// Tap -> pick a time then schedule.
  final void Function(String taskId) onPickTime;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S(ref.watch(appLocaleProvider));
    final tasks = ref.watch(todoListProvider);
    // 未完了・ルート・非ログのうち、まだ時刻が無いタスクを「未スケジュール」として表示。
    final dock = tasks
        .where((t) =>
            !t.isTimeLog &&
            t.parentId == null &&
            !t.completed &&
            (t.startTime == null || t.startTime!.isEmpty))
        .toList();
    if (dock.isEmpty) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: (isDark ? AppColors.zinc950 : AppColors.surface),
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.zinc800 : AppColors.zinc200,
          ),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.xs, AppSpacing.lg, AppSpacing.xs),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s.todo,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: AppColors.zinc500,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: dock.length,
              separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
              itemBuilder: (context, i) {
                final t = dock[i];
                final chip = _DockChip(title: t.title);
                return LongPressDraggable<String>(
                  data: t.id,
                  rootOverlay: true,
                  feedback: Material(
                    color: Colors.transparent,
                    child: Opacity(opacity: 0.9, child: _DockChip(title: t.title)),
                  ),
                  childWhenDragging: Opacity(opacity: 0.4, child: chip),
                  child: InkWell(
                    onTap: () => onPickTime(t.id),
                    borderRadius: BorderRadius.circular(999),
                    child: chip,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DockChip extends StatelessWidget {
  const _DockChip({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.accent500.withValues(alpha: isDark ? 0.18 : 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.accent500.withValues(alpha: 0.4)),
      ),
      child: Text(
        title.isEmpty ? '(無題)' : title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: isDark ? AppColors.accent200 : AppColors.accent700,
        ),
      ),
    );
  }
}

class _AgendaRow extends StatelessWidget {
  const _AgendaRow({
    required this.time,
    required this.title,
    required this.color,
    this.done = false,
    required this.onTap,
  });

  final String time;
  final String title;
  final Color color;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Row(
          children: [
            SizedBox(
              width: 44,
              child: Text(
                time,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: AppColors.zinc500,
                    ),
              ),
            ),
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      decoration: done ? TextDecoration.lineThrough : null,
                      color: done ? AppColors.zinc400 : null,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
