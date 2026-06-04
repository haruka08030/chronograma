import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../models/list_section_meta.dart';
import '../models/task_list_meta.dart';

const _listsKey = 'lists_json_v1';
const _sectionsKey = 'list_sections_json_v1';

class TaskListsRepository {
  TaskListsRepository(this._box);

  final Box<dynamic> _box;

  bool get hasEverPersistedLists => _box.containsKey(_listsKey);

  List<TaskListMeta> readLists() {
    final raw = _box.get(_listsKey);
    if (raw is! String || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => TaskListMeta.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  void saveLists(List<TaskListMeta> lists) {
    final encoded = jsonEncode(lists.map((l) => l.toJson()).toList());
    _box.put(_listsKey, encoded);
  }

  List<ListSectionMeta> readSections() {
    final raw = _box.get(_sectionsKey);
    if (raw is! String || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => ListSectionMeta.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  void saveSections(List<ListSectionMeta> sections) {
    final encoded = jsonEncode(sections.map((s) => s.toJson()).toList());
    _box.put(_sectionsKey, encoded);
  }
}
