import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../shared/selected_date_provider.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';

/// Calendar day (local midnight) for the Log tab.
/// タブ共有の選択日（[selectedDateProvider] のエイリアス）。
final logSelectedDateProvider = selectedDateProvider;

final logEntriesForSelectedDateProvider = Provider<List<Task>>((ref) {
  final all = ref.watch(todoListProvider);
  final day = ref.watch(logSelectedDateProvider);
  final out = all.where((t) => timeLogTouchesCalendarDay(t, day)).toList();
  out.sort((a, b) => timeLogStartSortMinutes(a).compareTo(timeLogStartSortMinutes(b)));
  return out;
});

class ActiveLogTimer {
  const ActiveLogTimer({
    required this.id,
    required this.startedAt,
    required this.title,
    required this.tag,
  });

  final String id;
  final DateTime startedAt;
  final String title;
  final String tag;
}

final activeLogTimerProvider =
    NotifierProvider<ActiveLogTimerNotifier, ActiveLogTimer?>(
  ActiveLogTimerNotifier.new,
);

class ActiveLogTimerNotifier extends Notifier<ActiveLogTimer?> {
  static const _uuid = Uuid();

  @override
  ActiveLogTimer? build() => null;

  void start({
    required String title,
    required String tag,
  }) {
    state = ActiveLogTimer(
      id: _uuid.v4(),
      startedAt: DateTime.now(),
      title: title.trim(),
      tag: tag.trim(),
    );
  }

  void clear() {
    state = null;
  }

  /// Stops timer and returns a time-log [Task] to persist, or null if idle.
  Task? stopAndBuildLog() {
    final timer = state;
    if (timer == null) return null;
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
    state = null;
    return task;
  }
}
