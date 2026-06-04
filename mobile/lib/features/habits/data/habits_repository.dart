import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../models/habit.dart';

const _habitsKey = 'habits_json_v1';

class HabitsRepository {
  HabitsRepository(this._box);

  final Box<dynamic> _box;

  bool get hasEverPersisted => _box.containsKey(_habitsKey);

  List<Habit> readAll() {
    final raw = _box.get(_habitsKey);
    if (raw is! String || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => Habit.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  void saveAll(List<Habit> habits) {
    final encoded = jsonEncode(habits.map((h) => h.toJson()).toList());
    _box.put(_habitsKey, encoded);
  }
}
