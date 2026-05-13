import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../data/habits_repository.dart';
import '../models/habit.dart';

final habitsHiveBoxProvider = Provider<Box<dynamic>>((ref) {
  throw UnimplementedError('habitsHiveBoxProvider must be overridden in ProviderScope');
});

final habitsRepositoryProvider = Provider<HabitsRepository>((ref) {
  final box = ref.watch(habitsHiveBoxProvider);
  return HabitsRepository(box);
});

final habitsListProvider =
    NotifierProvider<HabitsListNotifier, List<Habit>>(HabitsListNotifier.new);

class HabitsListNotifier extends Notifier<List<Habit>> {
  static const _uuid = Uuid();

  HabitsRepository get _repo => ref.read(habitsRepositoryProvider);

  @override
  List<Habit> build() {
    if (!_repo.hasEverPersisted) {
      _repo.saveAll(const []);
      return const [];
    }
    return List<Habit>.from(_repo.readAll());
  }

  void _persist() {
    _repo.saveAll(state);
  }

  void replaceAll(List<Habit> habits) {
    state = List<Habit>.from(habits);
    _persist();
  }

  Habit addHabit({
    required String title,
    String color = '#f97316',
  }) {
    final now = DateTime.now().toUtc().toIso8601String();
    final habit = Habit(
      id: _uuid.v4(),
      title: title.trim(),
      color: color,
      completedDates: const [],
      createdAt: now,
      updatedAt: now,
    );
    state = [habit, ...state];
    _persist();
    return habit;
  }

  void updateHabit(Habit habit) {
    final now = DateTime.now().toUtc().toIso8601String();
    final next = habit.copyWith(updatedAt: now);
    state = [
      for (final h in state)
        if (h.id == next.id) next else h,
    ];
    _persist();
  }

  void deleteHabit(String id) {
    state = state.where((h) => h.id != id).toList();
    _persist();
  }

  void toggleHabitDate(String id, DateTime day) {
    final key = habitDateKey(day);
    final now = DateTime.now().toUtc().toIso8601String();
    state = [
      for (final h in state)
        if (h.id == id)
          h.copyWith(
            completedDates: h.completedDates.contains(key)
                ? h.completedDates.where((d) => d != key).toList()
                : [...h.completedDates, key]..sort(),
            updatedAt: now,
          )
        else
          h,
    ];
    _persist();
  }
}
