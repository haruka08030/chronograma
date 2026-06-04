import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../models/task.dart';

const _tasksKey = 'tasks_json_v1';

class TodoRepository {
  TodoRepository(this._box);

  final Box<dynamic> _box;

  /// True after [saveAll] has run at least once (including saving `[]`).
  bool get hasEverPersisted => _box.containsKey(_tasksKey);

  List<Task> readAll() {
    final raw = _box.get(_tasksKey);
    if (raw is! String || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => Task.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  void saveAll(List<Task> tasks) {
    final encoded = jsonEncode(tasks.map((t) => t.toJson()).toList());
    _box.put(_tasksKey, encoded);
  }
}
