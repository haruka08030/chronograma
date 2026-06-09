import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/design.dart';
import '../../shared/pickers/native_pickers.dart';
import '../../shared/selected_date_provider.dart';
import '../../shared/widgets/draggable_sheet.dart';
import '../todo/data/list_color_palettes.dart';
import '../todo/providers/todo_providers.dart';
import 'models/habit.dart';
import 'providers/habits_providers.dart';

/// タブ共有の選択日（[selectedDateProvider] のエイリアス）。
final habitsSelectedDateProvider = selectedDateProvider;

class HabitsScreen extends ConsumerWidget {
  const HabitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(habitsSelectedDateProvider);
    final habits = ref.watch(habitsListProvider);
    final dateKey = habitDateKey(day);

    void shiftDay(int delta) {
      ref.read(habitsSelectedDateProvider.notifier).state = DateTime(day.year, day.month, day.day + delta);
    }

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.lg, AppSpacing.xl, 96),
        children: [
          Row(
            children: [
              IconButton(onPressed: () => shiftDay(-1), icon: const Icon(Icons.chevron_left)),
              Expanded(
                child: FilledButton.tonal(
                  onPressed: () async {
                    final picked = await pickNativeDate(
                      context,
                      initialDate: day,
                      firstDate: DateTime(day.year - 2),
                      lastDate: DateTime(day.year + 3),
                    );
                    if (picked != null) {
                      ref.read(habitsSelectedDateProvider.notifier).state =
                          DateTime(picked.year, picked.month, picked.day);
                    }
                  },
                  child: Text(
                    '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              IconButton(onPressed: () => shiftDay(1), icon: const Icon(Icons.chevron_right)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton.tonalIcon(
            onPressed: () async {
              final created = await _showCreateHabitDialog(context);
              if (created == null || created.trim().isEmpty) return;
              ref.read(habitsListProvider.notifier).addHabit(title: created.trim());
            },
            icon: const Icon(Icons.add),
            label: const Text('習慣を追加'),
          ),
          const SizedBox(height: AppSpacing.xl),
          if (habits.isEmpty)
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Text(
                '習慣がまだありません。\n「習慣を追加」から作成してください。',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            )
          else
            ...habits.map(
              (habit) {
                final done = habit.completedDates.contains(dateKey);
                final scheduleLabel = _frequencyLabel(habit.frequency);
                final timeLabel = _timeLabel(habit);
                final streak = _currentStreak(habit, day);
                final subtitleParts = [
                  done ? '達成済み' : '未達成',
                  if (scheduleLabel.isNotEmpty) scheduleLabel,
                  if (timeLabel.isNotEmpty) timeLabel,
                  if (streak > 0) '🔥$streak',
                ];
                return Card(
                  margin: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ListTile(
                        leading: Icon(
                          done ? Icons.check_circle : Icons.radio_button_unchecked,
                          color: done ? hexToColor(habit.color) : null,
                        ),
                        title: Text(habit.title),
                        subtitle: Text(subtitleParts.join(' • ')),
                        trailing: Switch(
                          value: done,
                          onChanged: (_) =>
                              ref.read(habitsListProvider.notifier).toggleHabitDate(habit.id, day),
                        ),
                        onLongPress: () => _showEditHabitSheet(context, ref, habit),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
                        child: _HabitHeatmap(habit: habit, end: day),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

const _weekdayLabels = ['月', '火', '水', '木', '金', '土', '日'];

String _frequencyLabel(Map<String, dynamic> freq) {
  if (freq['type'] == 'weekly' && freq['weekdays'] is List) {
    final wd = (freq['weekdays'] as List)
        .map((e) => int.tryParse('$e'))
        .whereType<int>()
        .toList()
      ..sort();
    if (wd.isEmpty) return '毎週';
    return wd.map((d) => _weekdayLabels[(d - 1) % 7]).join('・');
  }
  return '毎日';
}

String _timeLabel(Habit h) {
  switch (h.timeMode) {
    case HabitTimeMode.none:
      return '';
    case HabitTimeMode.fixed:
      return h.startTime ?? '';
    case HabitTimeMode.range:
      return '${h.startTime ?? ''}–${h.endTime ?? ''}';
  }
}

bool _scheduledOn(Habit h, DateTime day) {
  final freq = h.frequency;
  if (freq['type'] == 'weekly' && freq['weekdays'] is List) {
    final wd = (freq['weekdays'] as List).map((e) => int.tryParse('$e')).toList();
    return wd.contains(day.weekday);
  }
  return true;
}

/// 選択日から遡って、予定日かつ達成済みが連続した日数。
int _currentStreak(Habit h, DateTime end) {
  final done = h.completedDates.toSet();
  var streak = 0;
  var cursor = DateTime(end.year, end.month, end.day);
  for (var i = 0; i < 366; i++) {
    if (_scheduledOn(h, cursor)) {
      if (done.contains(habitDateKey(cursor))) {
        streak++;
      } else {
        break;
      }
    }
    cursor = cursor.subtract(const Duration(days: 1));
  }
  return streak;
}

/// 直近28日のヒートマップ（予定日かつ達成=色、予定日未達=薄枠、予定外=ほぼ透明）。
class _HabitHeatmap extends StatelessWidget {
  const _HabitHeatmap({required this.habit, required this.end});

  final Habit habit;
  final DateTime end;

  @override
  Widget build(BuildContext context) {
    final color = hexToColor(habit.color);
    final done = habit.completedDates.toSet();
    final base = DateTime(end.year, end.month, end.day);
    final days = [for (var i = 27; i >= 0; i--) base.subtract(Duration(days: i))];

    return Row(
      children: [
        for (final d in days)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1),
              child: AspectRatio(
                aspectRatio: 1,
                child: Builder(builder: (context) {
                  final scheduled = _scheduledOn(habit, d);
                  final completed = done.contains(habitDateKey(d));
                  Color cell;
                  Border? border;
                  if (completed) {
                    cell = color.withValues(alpha: 0.85);
                  } else if (scheduled) {
                    cell = color.withValues(alpha: 0.08);
                    border = Border.all(color: color.withValues(alpha: 0.35));
                  } else {
                    cell = Theme.of(context).dividerColor.withValues(alpha: 0.12);
                  }
                  return Container(
                    decoration: BoxDecoration(
                      color: cell,
                      borderRadius: BorderRadius.circular(2),
                      border: border,
                    ),
                  );
                }),
              ),
            ),
          ),
      ],
    );
  }
}

Future<String?> _showCreateHabitDialog(BuildContext context) {
  return showDialog<String>(
    context: context,
    builder: (_) => const _CreateHabitDialog(),
  );
}

class _CreateHabitDialog extends StatefulWidget {
  const _CreateHabitDialog();

  @override
  State<_CreateHabitDialog> createState() => _CreateHabitDialogState();
}

class _CreateHabitDialogState extends State<_CreateHabitDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('習慣を追加'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'タイトル'),
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => Navigator.pop(context, _controller.text),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('キャンセル'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: const Text('追加'),
        ),
      ],
    );
  }
}

Future<void> _showEditHabitSheet(BuildContext context, WidgetRef ref, Habit habit) {
  return showDraggableBottomSheet<void>(
    context: context,
    initialChildSize: 0.55,
    builder: (_, scrollController) => _EditHabitSheet(
      habit: habit,
      scrollController: scrollController,
    ),
  );
}

class _EditHabitSheet extends ConsumerStatefulWidget {
  const _EditHabitSheet({
    required this.habit,
    required this.scrollController,
  });

  final Habit habit;
  final ScrollController scrollController;

  @override
  ConsumerState<_EditHabitSheet> createState() => _EditHabitSheetState();
}

class _EditHabitSheetState extends ConsumerState<_EditHabitSheet> {
  late final TextEditingController _controller;
  late bool _weekly;
  late Set<int> _weekdays;
  late HabitTimeMode _timeMode;
  String? _startTime;
  String? _endTime;
  late String _color;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.habit.title);
    final freq = widget.habit.frequency;
    _weekly = freq['type'] == 'weekly';
    _weekdays = _weekly && freq['weekdays'] is List
        ? (freq['weekdays'] as List)
            .map((e) => int.tryParse('$e'))
            .whereType<int>()
            .toSet()
        : {1, 2, 3, 4, 5, 6, 7};
    _timeMode = widget.habit.timeMode;
    _startTime = widget.habit.startTime;
    _endTime = widget.habit.endTime;
    _color = widget.habit.color;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  static String _fmtHm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  static TimeOfDay? _parseHm(String? s) {
    if (s == null || s.isEmpty) return null;
    final p = s.split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0]);
    final m = int.tryParse(p[1]);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h.clamp(0, 23), minute: m.clamp(0, 59));
  }

  Future<void> _pickTime({required bool isStart}) async {
    final picked = await pickNativeTime(
      context,
      initialTime: (isStart ? _parseHm(_startTime) : _parseHm(_endTime)) ??
          const TimeOfDay(hour: 9, minute: 0),
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

  void _save() {
    final freq = _weekly
        ? {'type': 'weekly', 'weekdays': (_weekdays.toList()..sort())}
        : {'type': 'daily'};
    final hasStart = _startTime != null && _startTime!.isNotEmpty;
    final hasEnd = _endTime != null && _endTime!.isNotEmpty;
    ref.read(habitsListProvider.notifier).updateHabit(
          widget.habit.copyWith(
            title: _controller.text.trim(),
            color: _color,
            frequency: freq,
            timeMode: _timeMode,
            startTime: _timeMode == HabitTimeMode.none || !hasStart ? null : _startTime,
            clearStartTime: _timeMode == HabitTimeMode.none || !hasStart,
            endTime: _timeMode == HabitTimeMode.range && hasEnd ? _endTime : null,
            clearEndTime: _timeMode != HabitTimeMode.range || !hasEnd,
          ),
        );
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final colors = paletteColors(ref.watch(listColorPaletteProvider));
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
                controller: _controller,
                decoration: const InputDecoration(labelText: 'タイトル'),
              ),
              const SizedBox(height: AppSpacing.lg),

              Text('頻度', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: AppSpacing.sm),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('毎日')),
                  ButtonSegment(value: true, label: Text('毎週')),
                ],
                selected: {_weekly},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _weekly = s.first),
              ),
              if (_weekly) ...[
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: 6,
                  children: [
                    for (var d = 1; d <= 7; d++)
                      FilterChip(
                        label: Text(_weekdayLabels[d - 1]),
                        selected: _weekdays.contains(d),
                        onSelected: (sel) => setState(() {
                          if (sel) {
                            _weekdays.add(d);
                          } else {
                            _weekdays.remove(d);
                          }
                        }),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.lg),

              Text('時間帯', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: AppSpacing.sm),
              SegmentedButton<HabitTimeMode>(
                segments: const [
                  ButtonSegment(value: HabitTimeMode.none, label: Text('なし')),
                  ButtonSegment(value: HabitTimeMode.fixed, label: Text('時刻')),
                  ButtonSegment(value: HabitTimeMode.range, label: Text('範囲')),
                ],
                selected: {_timeMode},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _timeMode = s.first),
              ),
              if (_timeMode != HabitTimeMode.none) ...[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pickTime(isStart: true),
                        icon: const Icon(Icons.schedule_outlined, size: 18),
                        label: Text(_timeMode == HabitTimeMode.range
                            ? '開始 ${_startTime ?? '--:--'}'
                            : (_startTime ?? '時刻')),
                      ),
                    ),
                    if (_timeMode == HabitTimeMode.range) ...[
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickTime(isStart: false),
                          icon: const Icon(Icons.schedule, size: 18),
                          label: Text('終了 ${_endTime ?? '--:--'}'),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.lg),

              Text('色', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final c in colors)
                    GestureDetector(
                      onTap: () => setState(() => _color = c),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: hexToColor(c),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: c.toLowerCase() == _color.toLowerCase()
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context).dividerColor,
                            width: c.toLowerCase() == _color.toLowerCase() ? 3 : 1,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),

              FilledButton(onPressed: _save, child: const Text('保存')),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                onPressed: () {
                  ref.read(habitsListProvider.notifier).deleteHabit(widget.habit.id);
                  Navigator.pop(context);
                },
                child: const Text('削除'),
              ),
        ],
      ),
    );
  }
}
