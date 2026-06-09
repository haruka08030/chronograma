import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../core/parse_quick_add.dart';
import '../../../core/recurrence_utils.dart';
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

const _timeLogTagPresetsKey = 'time_log_tag_presets_v1';

/// 活動ログ用のタグ候補（Web `timeLogTagPresets` 相当）。1 行 1 タグで設定保存。
final timeLogTagPresetsProvider =
    NotifierProvider<TimeLogTagPresetsNotifier, List<String>>(
        TimeLogTagPresetsNotifier.new);

class TimeLogTagPresetsNotifier extends Notifier<List<String>> {
  Box<dynamic> get _box => ref.read(hiveBoxProvider);

  @override
  List<String> build() {
    final raw = _box.get(_timeLogTagPresetsKey);
    if (raw is List) {
      return raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    }
    return const [];
  }

  void setFromText(String text) {
    final list = text
        .split(RegExp(r'[\n,]'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    // 重複除去（順序維持）。
    final seen = <String>{};
    final deduped = [
      for (final t in list)
        if (seen.add(t.toLowerCase())) t,
    ];
    state = deduped;
    _box.put(_timeLogTagPresetsKey, deduped);
  }
}

const _listColorPaletteKey = 'list_color_palette_v1';

/// リスト/習慣の色チップに使うパレット ID（Web `listColorPaletteId` 相当）。
final listColorPaletteProvider =
    NotifierProvider<ListColorPaletteNotifier, String>(ListColorPaletteNotifier.new);

class ListColorPaletteNotifier extends Notifier<String> {
  Box<dynamic> get _box => ref.read(hiveBoxProvider);

  @override
  String build() {
    final raw = _box.get(_listColorPaletteKey);
    return raw is String && raw.isNotEmpty ? raw : 'pastel-rainbow';
  }

  void set(String id) {
    state = id;
    _box.put(_listColorPaletteKey, id);
  }
}

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

  void addList({required String name, String color = '#6366f1'}) {
    final maxOrder = state.isEmpty
        ? 0
        : state.map((l) => l.sortOrder).reduce((a, b) => a > b ? a : b) + 1;
    final list = TaskListMeta(
      id: const Uuid().v4(),
      name: name.trim(),
      color: color,
      sortOrder: maxOrder,
    );
    state = [...state, list];
    _persist();
  }

  void updateList(TaskListMeta updated) {
    state = [
      for (final l in state)
        if (l.id == updated.id) updated else l,
    ];
    _persist();
  }

  void deleteList(String id) {
    if (id == Task.inboxListId) return;
    state = state.where((l) => l.id != id).toList();
    _persist();
  }

  void reorderLists(int oldIndex, int newIndex) {
    if (oldIndex < newIndex) newIndex -= 1;
    final next = List<TaskListMeta>.from(state);
    final item = next.removeAt(oldIndex);
    next.insert(newIndex, item);
    state = [
      for (var i = 0; i < next.length; i++)
        next[i].copyWith(sortOrder: i),
    ];
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

  void addSection({required String listId, String name = ''}) {
    final inList = state.where((s) => s.listId == listId).toList();
    final maxOrder = inList.isEmpty
        ? 0
        : inList.map((s) => s.sortOrder).reduce((a, b) => a > b ? a : b) + 1;
    final sec = ListSectionMeta(
      id: const Uuid().v4(),
      listId: listId,
      name: name,
      sortOrder: maxOrder,
    );
    state = [...state, sec];
    _persist();
  }

  void updateSection(ListSectionMeta updated) {
    state = [
      for (final s in state)
        if (s.id == updated.id) updated else s,
    ];
    _persist();
  }

  void deleteSection(String id) {
    state = state.where((s) => s.id != id).toList();
    _persist();
  }

  void reorderSections(String listId, int oldIndex, int newIndex) {
    final inList = state.where((s) => s.listId == listId).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    if (oldIndex < newIndex) newIndex -= 1;
    final item = inList.removeAt(oldIndex);
    inList.insert(newIndex, item);
    final ids = inList.map((s) => s.id).toSet();
    final others = state.where((s) => !ids.contains(s.id)).toList();
    state = [
      ...others,
      for (var i = 0; i < inList.length; i++)
        inList[i].copyWith(sortOrder: i),
    ];
    _persist();
  }
}

final smartViewProvider =
    StateProvider<SmartView>((ref) => SmartView.today);

/// 一括操作用の選択タスク ID 集合（空＝選択モード解除）。
final taskSelectionProvider =
    NotifierProvider<TaskSelectionNotifier, Set<String>>(TaskSelectionNotifier.new);

class TaskSelectionNotifier extends Notifier<Set<String>> {
  @override
  Set<String> build() => <String>{};

  void toggle(String id) {
    final next = Set<String>.from(state);
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    state = next;
  }

  void clear() => state = <String>{};
}

/// Root tasks only (for tree display).
List<Task> rootTasksForList(List<Task> all, {String? listId}) {
  var list = all.where((t) => !t.isTimeLog && t.parentId == null).toList();
  if (listId != null) {
    list = list.where((t) => t.listId == listId).toList();
  }
  list.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  return list;
}

List<Task> childrenOf(List<Task> all, String parentId) {
  return all
      .where((t) => t.parentId == parentId && !t.isTimeLog)
      .toList()
    ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
}

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

  Task _normalizeCompletedAt(Task before, Task after) {
    if (before.completed == after.completed) return after;
    final now = _nowIso();
    if (after.completed) {
      return after.copyWith(completedAt: after.completedAt ?? now);
    }
    return after.copyWith(completedAt: null);
  }

  void addTask(Task task) {
    state = [_ensureTimestamps(task, bumpUpdated: false), ...state];
    _persist();
  }

  void addTaskQuick({
    required String title,
    DateTime? dueDate,
    TaskPriority priority = TaskPriority.medium,
    List<String> tags = const [],
    bool localeJa = true,
  }) {
    final parsed = parseQuickAddTitle(title, localeJa: localeJa);
    final listId = ref.read(selectedTaskListIdProvider) ?? Task.inboxListId;
    final t = newLocalTask(
      id: _uuid.v4(),
      title: parsed.title,
      dueDate: parsed.dueDate ?? dueDate,
      priority: priority,
      isTimeLog: false,
      listId: listId,
      tags: parsed.tags.isNotEmpty ? parsed.tags : tags,
    );
    addTask(t);
  }

  void addSubtask(String parentId, String title) {
    final parent = state.firstWhere((t) => t.id == parentId);
    final siblings = state.where((t) => t.parentId == parentId).toList();
    final maxOrder = siblings.isEmpty
        ? 0
        : siblings.map((t) => t.sortOrder).reduce((a, b) => a > b ? a : b) + 1;
    addTask(
      newLocalTask(
        id: _uuid.v4(),
        title: title.trim(),
        listId: parent.listId,
        parentId: parentId,
        sortOrder: maxOrder,
      ),
    );
  }

  void reorderRootTasks(String listId, int oldIndex, int newIndex) {
    final roots = rootTasksForList(state, listId: listId);
    if (oldIndex < newIndex) newIndex -= 1;
    final item = roots.removeAt(oldIndex);
    roots.insert(newIndex, item);
    final orderMap = {for (var i = 0; i < roots.length; i++) roots[i].id: i};
    state = [
      for (final t in state)
        if (orderMap.containsKey(t.id))
          t.copyWith(sortOrder: orderMap[t.id]!)
        else
          t,
    ];
    _persist();
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
    Task? current;
    for (final t in state) {
      if (t.id == updated.id) {
        current = t;
        break;
      }
    }
    final merged = current == null ? updated : _normalizeCompletedAt(current, updated);
    final next = _ensureTimestamps(merged, bumpUpdated: true);
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
    final task = state.firstWhere((t) => t.id == id);
    final willComplete = !task.completed;
    var next = [
      for (final t in state)
        if (t.id == id)
          _ensureTimestamps(
            _normalizeCompletedAt(t, t.copyWith(completed: willComplete)),
            bumpUpdated: true,
          )
        else
          t,
    ];
    if (willComplete &&
        task.recurrence != null &&
        task.dueDate != null) {
      final ymd = taskDueDateYmd(task.dueDate);
      final nextYmd = nextDueDateYmd(ymd, task.recurrence!);
      if (nextYmd != null) {
        final spawned = newLocalTask(
          id: _uuid.v4(),
          title: task.title,
          dueDate: parseDueYmd(nextYmd),
          priority: task.priority,
          listId: task.listId,
          parentId: task.parentId,
          sectionId: task.sectionId,
          tags: task.tags,
          recurrence: task.recurrence,
          sortOrder: task.sortOrder,
        );
        next = [...next, _ensureTimestamps(spawned, bumpUpdated: false)];
      }
    }
    state = next;
    _persist();
  }

  void deleteListAndReassign(String listId) {
    if (listId == Task.inboxListId) return;
    state = [
      for (final t in state)
        if (t.listId == listId) t.copyWith(listId: Task.inboxListId) else t,
    ];
    ref.read(taskListsProvider.notifier).deleteList(listId);
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

  Set<String> _withDescendants(Iterable<String> ids) {
    final result = <String>{...ids};
    var changed = true;
    while (changed) {
      changed = false;
      for (final t in state) {
        if (t.parentId != null &&
            result.contains(t.parentId) &&
            !result.contains(t.id)) {
          result.add(t.id);
          changed = true;
        }
      }
    }
    return result;
  }

  void bulkSetCompleted(Set<String> ids, bool completed) {
    if (ids.isEmpty) return;
    state = [
      for (final t in state)
        if (ids.contains(t.id))
          _ensureTimestamps(
            _normalizeCompletedAt(t, t.copyWith(completed: completed)),
            bumpUpdated: true,
          )
        else
          t,
    ];
    _persist();
  }

  void bulkMoveToList(Set<String> ids, String listId) {
    if (ids.isEmpty) return;
    final all = _withDescendants(ids);
    state = [
      for (final t in state)
        if (all.contains(t.id))
          _ensureTimestamps(
            t.copyWith(listId: listId, clearSectionId: true),
            bumpUpdated: true,
          )
        else
          t,
    ];
    _persist();
  }

  void bulkSetPriority(Set<String> ids, TaskPriority priority) {
    if (ids.isEmpty) return;
    state = [
      for (final t in state)
        if (ids.contains(t.id))
          _ensureTimestamps(t.copyWith(priority: priority), bumpUpdated: true)
        else
          t,
    ];
    _persist();
  }

  void bulkSetDue(Set<String> ids, DateTime? due) {
    if (ids.isEmpty) return;
    state = [
      for (final t in state)
        if (ids.contains(t.id))
          _ensureTimestamps(
            due == null
                ? t.copyWith(
                    clearDueDate: true,
                    clearStartTime: true,
                    clearEndTime: true,
                    clearRecurrence: true,
                  )
                : t.copyWith(dueDate: due),
            bumpUpdated: true,
          )
        else
          t,
    ];
    _persist();
  }

  void bulkDeleteWithUndo(
    Set<String> ids, {
    required void Function(String message, VoidCallback onUndo) showUndo,
  }) {
    if (ids.isEmpty) return;
    final all = _withDescendants(ids);
    final removed = state.where((t) => all.contains(t.id)).toList();
    if (removed.isEmpty) return;

    state = state.where((t) => !all.contains(t.id)).toList();
    _persist();

    _pendingUndo = removed;
    _undoExpiresAt = DateTime.now().add(const Duration(seconds: 8));

    showUndo('${ids.length}件を削除しました', () {
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
