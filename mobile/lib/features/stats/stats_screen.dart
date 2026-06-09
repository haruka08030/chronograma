import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/design.dart';
import '../../l10n/app_strings.dart';
import '../habits/models/habit.dart';
import '../habits/providers/habits_providers.dart';
import '../todo/data/list_color_palettes.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';

class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(todoListProvider);
    final tasks = all.where((t) => !t.isTimeLog).toList();
    final logs = all.where((t) => t.isTimeLog).toList();
    final lists = ref.watch(taskListsProvider);
    final habits = ref.watch(habitsListProvider);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final weekAgo = now.subtract(const Duration(days: 7));

    var completedWeek = 0;
    var high = 0;
    var medium = 0;
    var low = 0;
    final byList = <String, int>{};

    for (final t in tasks) {
      if (t.completed) {
        final at = t.completedAt != null ? DateTime.tryParse(t.completedAt!) : null;
        if (at != null && at.isAfter(weekAgo)) completedWeek++;
      }
      switch (t.priority.name) {
        case 'high':
          high++;
        case 'medium':
          medium++;
        case 'low':
          low++;
        default:
          break;
      }
      byList[t.listId] = (byList[t.listId] ?? 0) + 1;
    }

    // 直近7日の完了数（completedAt の暦日でカウント）。
    final last7 = [for (var i = 6; i >= 0; i--) today.subtract(Duration(days: i))];
    final perDay = {for (final d in last7) habitDateKey(d): 0};
    for (final t in tasks.where((t) => t.completed && t.completedAt != null)) {
      final at = DateTime.tryParse(t.completedAt!);
      if (at == null) continue;
      final key = habitDateKey(DateTime(at.year, at.month, at.day));
      if (perDay.containsKey(key)) perDay[key] = perDay[key]! + 1;
    }

    // 今週のログ合計時間（分）。
    final weekStart = today.subtract(Duration(days: today.weekday - 1));
    var weekLogMinutes = 0;
    for (final t in logs) {
      if (t.dueDate == null) continue;
      final d = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
      if (d.isBefore(weekStart)) continue;
      final s = parseHhmmToMinutes(t.startTime);
      final e = parseHhmmToMinutes(t.endTime);
      if (s == null || e == null) continue;
      final dur = e - s;
      weekLogMinutes += dur > 0 ? dur : dur + 24 * 60;
    }

    final habitsTodayDone =
        habits.where((h) => h.completedDates.contains(habitDateKey(today))).length;

    String listName(String id) {
      if (id == Task.inboxListId) return '未分類';
      final m = lists.where((l) => l.id == id);
      return m.isNotEmpty ? m.first.name : id;
    }

    final sortedLists = byList.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Scaffold(
      appBar: AppBar(
        title: Text(
          S(ref.watch(appLocaleProvider)).stats,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.lg,
          AppSpacing.xl,
          AppSpacing.xl,
        ),
        children: [
          Row(
            children: [
              Expanded(child: _MetricCard(label: '7日完了', value: '$completedWeek')),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _MetricCard(
                  label: '未完了',
                  value: '${tasks.where((t) => !t.completed).length}',
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  label: '今週ログ',
                  value: '${weekLogMinutes ~/ 60}h${(weekLogMinutes % 60).toString().padLeft(2, '0')}',
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _MetricCard(
                  label: '今日の習慣',
                  value: '$habitsTodayDone/${habits.length}',
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('直近7日の完了数', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          _WeekBarChart(
            days: last7,
            values: [for (final d in last7) perDay[habitDateKey(d)] ?? 0],
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('優先度', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          _PriorityBar(high: high, medium: medium, low: low),
          const SizedBox(height: AppSpacing.lg),
          Text('リスト別', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          ...sortedLists.map(
            (e) => ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                Icons.circle,
                size: 12,
                color: () {
                  final m = lists.where((l) => l.id == e.key);
                  return m.isNotEmpty ? hexToColor(m.first.color) : AppColors.zinc400;
                }(),
              ),
              title: Text(listName(e.key)),
              trailing: Text('${e.value}'),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
          ],
        ),
      ),
    );
  }
}

class _WeekBarChart extends StatelessWidget {
  const _WeekBarChart({required this.days, required this.values});
  final List<DateTime> days;
  final List<int> values;

  @override
  Widget build(BuildContext context) {
    final maxV = values.fold<int>(1, (m, v) => v > m ? v : m);
    const weekdayLabels = ['月', '火', '水', '木', '金', '土', '日'];
    final primary = Theme.of(context).colorScheme.primary;

    return SizedBox(
      height: 120,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var i = 0; i < days.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text('${values[i]}', style: Theme.of(context).textTheme.labelSmall),
                    const SizedBox(height: 2),
                    Container(
                      height: (values[i] / maxV) * 80 + 2,
                      decoration: BoxDecoration(
                        color: primary.withValues(alpha: 0.8),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      weekdayLabels[(days[i].weekday - 1) % 7],
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.zinc500,
                          ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PriorityBar extends StatelessWidget {
  const _PriorityBar({required this.high, required this.medium, required this.low});
  final int high;
  final int medium;
  final int low;

  @override
  Widget build(BuildContext context) {
    Widget seg(int count, Color color, String label) {
      if (count == 0) return const SizedBox.shrink();
      return Expanded(
        flex: count,
        child: Container(
          height: 28,
          color: color,
          alignment: Alignment.center,
          child: Text(
            '$label $count',
            style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Row(
        children: [
          seg(high, AppColors.priorityHigh, '高'),
          seg(medium, AppColors.priorityMedium, '中'),
          seg(low, AppColors.priorityLow, '低'),
          if (high + medium + low == 0)
            Expanded(
              child: Container(
                height: 28,
                color: AppColors.zinc200,
                alignment: Alignment.center,
                child: const Text('データなし', style: TextStyle(fontSize: 11)),
              ),
            ),
        ],
      ),
    );
  }
}
