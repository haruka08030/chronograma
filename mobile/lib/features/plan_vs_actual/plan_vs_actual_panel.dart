import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../design/app_colors.dart';
import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';
import '../../l10n/app_strings.dart';
import '../calendar/calendar_gcal_provider.dart';
import '../google/google_calendar_service.dart';
import '../google/google_connection_provider.dart';
import '../habits/models/habit.dart';
import '../habits/providers/habits_providers.dart';
import '../sync/sync_notifier.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';
import 'plan_vs_actual_match.dart';

const _uuid = Uuid();

Color _statusColor(MatchStatus s) {
  switch (s) {
    case MatchStatus.matched:
      return const Color(0xFF10B981);
    case MatchStatus.timeDrift:
      return const Color(0xFFF59E0B);
    case MatchStatus.plannedOnly:
      return const Color(0xFFEF4444);
    case MatchStatus.actualOnly:
      return const Color(0xFF3B82F6);
  }
}

String _statusLabel(MatchStatus s, S strings) {
  final ja = strings.isJa;
  switch (s) {
    case MatchStatus.matched:
      return ja ? '実行済み' : 'Done';
    case MatchStatus.timeDrift:
      return ja ? '時間ズレ' : 'Time drift';
    case MatchStatus.plannedOnly:
      return ja ? '未実行' : 'Not done';
    case MatchStatus.actualOnly:
      return ja ? '予定外' : 'Unplanned';
  }
}

bool _habitOccursOn(Habit h, DateTime day) {
  final freq = h.frequency;
  if (freq['type'] == 'weekly' && freq['weekdays'] is List) {
    final weekdays = (freq['weekdays'] as List).map((e) => int.tryParse('$e')).toList();
    return weekdays.contains(day.weekday);
  }
  return true; // daily
}

/// Plan vs Actual：選択日の予定／実績の突合ビュー。
class PlanVsActualPanel extends ConsumerStatefulWidget {
  const PlanVsActualPanel({super.key, required this.anchor});

  final DateTime anchor;

  @override
  ConsumerState<PlanVsActualPanel> createState() => _PlanVsActualPanelState();
}

class _PlanVsActualPanelState extends ConsumerState<PlanVsActualPanel> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fetch());
  }

  @override
  void didUpdateWidget(covariant PlanVsActualPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.anchor != widget.anchor) _fetch();
  }

  Future<void> _fetch() async {
    final start = DateTime(widget.anchor.year, widget.anchor.month, widget.anchor.day);
    await refreshCalendarEvents(ref, rangeStart: start, rangeEnd: start);
  }

  String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void _logPlanned(PlannedItem p, DateTime day) {
    final log = newLocalTask(
      id: _uuid.v4(),
      title: p.summary,
      isTimeLog: true,
      completed: true,
      dueDate: DateTime(day.year, day.month, day.day),
      startTime: p.startTime,
      endTime: p.endTime,
      listId: Task.inboxListId,
    );
    ref.read(todoListProvider.notifier).putTimeLog(log);
    if (p.source == PlannedSource.habit) {
      final habits = ref.read(habitsListProvider);
      final match = habits.where((h) => h.id == p.id);
      if (match.isNotEmpty && !match.first.completedDates.contains(habitDateKey(day))) {
        ref.read(habitsListProvider.notifier).toggleHabitDate(p.id, day);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S(ref.watch(appLocaleProvider));
    final connected = ref.watch(googleConnectedProvider);
    final events = ref.watch(calendarEventsProvider);
    final tasks = ref.watch(todoListProvider);
    final habits = ref.watch(habitsListProvider);
    final day = DateTime(widget.anchor.year, widget.anchor.month, widget.anchor.day);

    final planned = <PlannedItem>[];
    for (final t in tasks.where((t) =>
        !t.isTimeLog &&
        t.parentId == null &&
        !t.completed &&
        sameCalendarDay(t.dueDate, day) &&
        (t.startTime?.isNotEmpty ?? false) &&
        (t.endTime?.isNotEmpty ?? false))) {
      planned.add(PlannedItem(
        id: t.id,
        summary: t.title,
        startTime: t.startTime!,
        endTime: t.endTime!,
        source: PlannedSource.task,
      ));
    }
    for (final e in events.where((e) => e.date == _ymd(day) && !e.isAllDay)) {
      if ((e.startTime?.isNotEmpty ?? false) && (e.endTime?.isNotEmpty ?? false)) {
        planned.add(PlannedItem(
          id: 'g-${e.id}',
          summary: e.summary,
          startTime: e.startTime!,
          endTime: e.endTime!,
          source: PlannedSource.google,
        ));
      }
    }
    for (final h in habits.where((h) =>
        h.timeMode == HabitTimeMode.range &&
        (h.startTime?.isNotEmpty ?? false) &&
        (h.endTime?.isNotEmpty ?? false) &&
        _habitOccursOn(h, day))) {
      planned.add(PlannedItem(
        id: h.id,
        summary: h.title,
        startTime: h.startTime!,
        endTime: h.endTime!,
        source: PlannedSource.habit,
      ));
    }

    final logs = tasks
        .where((t) => t.isTimeLog && timeLogTouchesCalendarDay(t, day))
        .toList();

    final pairs = matchPlanAndActual(planned, logs);
    pairs.sort((a, b) {
      final am = _sortMinutes(a);
      final bm = _sortMinutes(b);
      return am.compareTo(bm);
    });

    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, 96),
      children: [
        if (!connected)
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(syncNotifierProvider.notifier).signInWithGoogle();
              await ref.read(googleConnectedProvider.notifier).setConnected(true);
              await _fetch();
            },
            icon: const Icon(Icons.calendar_month, size: 18),
            label: Text(s.connectGoogle),
          )
        else
          Row(
            children: [
              const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  s.googleConnected,
                  style: const TextStyle(color: Color(0xFF10B981)),
                ),
              ),
              TextButton(
                onPressed: () async {
                  final svc = GoogleCalendarService.tryCreate();
                  if (svc != null) await svc.disconnect();
                  await ref.read(googleConnectedProvider.notifier).setConnected(false);
                  ref.read(calendarEventsProvider.notifier).state = [];
                },
                child: Text(s.disconnect),
              ),
            ],
          ),
        const SizedBox(height: AppSpacing.sm),
        _Legend(strings: s),
        const SizedBox(height: AppSpacing.sm),
        if (pairs.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xl),
            child: Center(
              child: Text(
                s.isJa ? 'この日の予定・ログはありません' : 'No plan or log for this day',
                style: TextStyle(color: AppColors.zinc400),
              ),
            ),
          ),
        for (final pair in pairs) _PairRow(
          pair: pair,
          strings: s,
          onLog: pair.status == MatchStatus.plannedOnly && pair.planned != null
              ? () => _logPlanned(pair.planned!, day)
              : null,
        ),
      ],
    );
  }

  int _sortMinutes(MatchedPair p) {
    final hhmm = p.planned?.startTime ?? p.actual?.startTime ?? '99:99';
    final parts = hhmm.split(':');
    if (parts.length < 2) return 24 * 60;
    return (int.tryParse(parts[0]) ?? 24) * 60 + (int.tryParse(parts[1]) ?? 0);
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.strings});
  final S strings;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      children: [
        for (final st in MatchStatus.values)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: _statusColor(st),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                _statusLabel(st, strings),
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
      ],
    );
  }
}

class _PairRow extends StatelessWidget {
  const _PairRow({required this.pair, required this.strings, this.onLog});

  final MatchedPair pair;
  final S strings;
  final VoidCallback? onLog;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(pair.status);
    final planned = pair.planned;
    final actual = pair.actual;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      decoration: BoxDecoration(
        border: Border(left: BorderSide(color: color, width: 4)),
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _statusLabel(pair.status, strings),
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
                ),
                const SizedBox(height: 2),
                if (planned != null)
                  Text(
                    '${planned.startTime}–${planned.endTime}  ${planned.summary}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (actual != null)
                  Text(
                    '${actual.startTime}–${actual.endTime}  ${actual.title}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.zinc500,
                        ),
                  ),
              ],
            ),
          ),
          if (onLog != null)
            IconButton(
              tooltip: strings.isJa ? 'ログに記録' : 'Log it',
              icon: const Icon(Icons.add_task, size: 20),
              onPressed: onLog,
            ),
        ],
      ),
    );
  }
}
