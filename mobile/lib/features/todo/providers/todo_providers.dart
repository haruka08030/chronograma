import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import 'search_provider.dart';
import '../data/task_lists_repository.dart';
import '../data/todo_repository.dart';
import '../models/list_section_meta.dart';
import '../models/smart_view.dart';
import '../models/task.dart';
import '../models/task_list_meta.dart';
import '../models/task_priority.dart';

final hiveBoxProvider = Provider<Box<dynamic>>((ref) {
  throw UnimplementedError('hiveBoxProvider must be overridden in ProviderScope');
});

final todoRepositoryProvider = Provider<TodoRepository>((ref) {
  final box = ref.watch(hiveBoxProvider);
  return TodoRepository(box);
});

final taskListsRepositoryProvider = Provider<TaskListsRepository>((ref) {
  final box = ref.watch(hiveBoxProvider);
  return TaskListsRepository(box);
});

/// 未選択時は全リストのタスクを表示。選択時は [Task.listId] で絞り込み。
final selectedTaskListIdProvider = StateProvider<String?>((ref) => null);

final taskListsProvider =
    NotifierProvider<TaskListsNotifier, List<TaskListMeta>>(TaskListsNotifier.new);

class TaskListsNotifier extends Notifier<List<TaskListMeta>> {
  TaskListsRepository get _repo => ref.read(taskListsRepositoryProvider);

  @override
  List<TaskListMeta> build() {
    if (!_repo.hasEverPersistedLists) {
      _repo.saveLists(const []);
      return const [];
    }
    return List<TaskListMeta>.from(_repo.readLists());
  }

  void _persist() {
    _repo.saveLists(state);
  }

  void replaceAll(List<TaskListMeta> lists) {
    state = List<TaskListMeta>.from(lists);
    _persist();
  }
}

final listSectionsProvider =
    NotifierProvider<ListSectionsNotifier, List<ListSectionMeta>>(ListSectionsNotifier.new);

class ListSectionsNotifier extends Notifier<List<ListSectionMeta>> {
  TaskListsRepository get _repo => ref.read(taskListsRepositoryProvider);

  @override
  List<ListSectionMeta> build() {
    return List<ListSectionMeta>.from(_repo.readSections());
  }

  void _persist() {
    _repo.saveSections(state);
  }

  void replaceAll(List<ListSectionMeta> sections) {
    state = List<ListSectionMeta>.from(sections);
    _persist();
  }
}

final smartViewProvider =
    StateProvider<SmartView>((ref) => SmartView.today);

final filteredTasksProvider = Provider<List<Task>>((ref) {
  final all = ref
      .watch(todoListProvider)
      .where((t) => !t.isTimeLog)
      .toList();
  final listId = ref.watch(selectedTaskListIdProvider);
  final view = ref.watch(smartViewProvider);
  final q = ref.watch(searchQueryProvider).trim().toLowerCase();
  var list = filterForSmartView(all, view);
  if (listId != null) {
    list = list.where((t) => t.listId == listId).toList();
  }
  if (q.isNotEmpty) {
    list = list
        .where((t) {
          if (t.title.toLowerCase().contains(q)) return true;
          return t.tags.any((tag) => tag.toLowerCase().contains(q));
        })
        .toList();
  }
  return list;
});

final todoListProvider =
    NotifierProvider<TodoListNotifier, List<Task>>(TodoListNotifier.new);

class TodoListNotifier extends Notifier<List<Task>> {
  static const _uuid = Uuid();

  TodoRepository get _repo => ref.read(todoRepositoryProvider);

  List<Task>? _pendingUndo;
  DateTime? _undoExpiresAt;

  @override
  List<Task> build() {
    if (!_repo.hasEverPersisted) {
      _repo.saveAll(const []);
      return const [];
    }
    return List<Task>.from(_repo.readAll());
  }

  void _persist() {
    _repo.saveAll(state);
  }

  String _nowIso() => DateTime.now().toUtc().toIso8601String();

  Task _ensureTimestamps(Task t, {required bool bumpUpdated}) {
    final now = _nowIso();
    return t.copyWith(
      createdAt: t.createdAt ?? now,
      updatedAt: bumpUpdated ? now : (t.updatedAt ?? now),
    );
  }

  void addTask(Task task) {
    state = [_ensureTimestamps(task, bumpUpdated: false), ...state];
    _persist();
  }

  void addTaskQuick({
    required String title,
    DateTime? dueDate,
    TaskPriority priority = TaskPriority.medium,
  }) {
    final listId = ref.read(selectedTaskListIdProvider) ?? Task.inboxListId;
    final t = newLocalTask(
      id: _uuid.v4(),
      title: title.trim(),
      dueDate: dueDate,
      priority: priority,
      isTimeLog: false,
      listId: listId,
    );
    addTask(t);
  }

  /// Insert or update a time-log row (`isTimeLog: true`).
  void putTimeLog(Task task) {
    if (!task.isTimeLog) return;
    final normalized = _ensureTimestamps(task, bumpUpdated: true);
    final i = state.indexWhere((t) => t.id == normalized.id);
    if (i >= 0) {
      updateTask(normalized);
    } else {
      addTask(normalized);
    }
  }

  void updateTask(Task updated) {
    final next = _ensureTimestamps(updated, bumpUpdated: true);
    state = [
      for (final t in state)
        if (t.id == next.id) next else t,
    ];
    _persist();
  }

  void replaceAll(List<Task> tasks) {
    state = List<Task>.from(tasks);
    _persist();
  }

  void toggleComplete(String id) {
    state = [
      for (final t in state)
        if (t.id == id)
          _ensureTimestamps(t.copyWith(completed: !t.completed), bumpUpdated: true)
        else
          t,
    ];
    _persist();
  }

  void deleteTaskWithUndo(
    String id, {
    required void Function(String message, VoidCallback onUndo) showUndo,
  }) {
    final index = state.indexWhere((t) => t.id == id);
    if (index < 0) return;
    final task = state[index];

    state = state.where((t) => t.id != id).toList();
    _persist();

    _pendingUndo = [task];
    _undoExpiresAt = DateTime.now().add(const Duration(seconds: 8));

    showUndo('タスクを削除しました', () {
      if (_pendingUndo == null) return;
      state = [...state, ..._pendingUndo!];
      _pendingUndo = null;
      _undoExpiresAt = null;
      _persist();
    });

    Future<void>.delayed(const Duration(seconds: 8), () {
      if (_undoExpiresAt != null &&
          DateTime.now().isAfter(_undoExpiresAt!) &&
          _pendingUndo != null) {
        _pendingUndo = null;
        _undoExpiresAt = null;
      }
    });
  }

  void clearUndoIfExpired() {
    if (_undoExpiresAt != null &&
        DateTime.now().isAfter(_undoExpiresAt!) &&
        _pendingUndo != null) {
      _pendingUndo = null;
      _undoExpiresAt = null;
    }
  }
}
