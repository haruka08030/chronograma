import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';

/// Calendar day (local midnight) for the Log tab.
final logSelectedDateProvider = StateProvider<DateTime>((ref) {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
});

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
}
