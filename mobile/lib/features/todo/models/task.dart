import 'smart_view.dart';
import 'task_priority.dart';

class Task {
  /// Web `INBOX_LIST_ID` / Supabase 既定リストと同じ。
  static const String inboxListId = '__inbox__';

  const Task({
    required this.id,
    required this.title,
    this.completed = false,
    this.dueDate,
    this.endDate,
    this.priority = TaskPriority.medium,
    this.tags = const [],
    this.isTimeLog = false,
    this.startTime,
    this.endTime,
    this.description = '',
    this.listId = inboxListId,
    this.parentId,
    this.sectionId,
    this.sortOrder = 0,
    this.recurrence,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String title;
  final bool completed;
  final DateTime? dueDate;
  /// Web `tasks.end_date`（終了日。null は開始日と同日）。
  final DateTime? endDate;
  final TaskPriority priority;
  final List<String> tags;
  /// Activity / time log row (same row as Web `tasks.is_time_log`).
  final bool isTimeLog;
  /// `HH:mm` (local), Web と同型。
  final String? startTime;
  final String? endTime;
  final String description;
  /// Supabase `tasks.list_id`
  final String listId;
  /// Supabase `tasks.parent_id`（ルートは null）
  final String? parentId;
  /// Supabase `tasks.section_id`
  final String? sectionId;
  /// Supabase `tasks.sort_order`
  final int sortOrder;
  /// Web `tasks.recurrence` と同形の JSON（未編集時は null のまま round-trip）
  final Map<String, dynamic>? recurrence;
  /// ISO 8601（UTC 推奨）。未設定のローカル行は同期時に補完。
  final String? createdAt;
  final String? updatedAt;

  Task copyWith({
    String? id,
    String? title,
    bool? completed,
    DateTime? dueDate,
    DateTime? endDate,
    TaskPriority? priority,
    List<String>? tags,
    bool? isTimeLog,
    String? startTime,
    String? endTime,
    String? description,
    String? listId,
    String? parentId,
    String? sectionId,
    int? sortOrder,
    Map<String, dynamic>? recurrence,
    String? createdAt,
    String? updatedAt,
    bool clearDueDate = false,
    bool clearEndDate = false,
    bool clearStartTime = false,
    bool clearEndTime = false,
    bool clearParentId = false,
    bool clearSectionId = false,
    bool clearRecurrence = false,
  }) {
    return Task(
      id: id ?? this.id,
      title: title ?? this.title,
      completed: completed ?? this.completed,
      dueDate: clearDueDate ? null : (dueDate ?? this.dueDate),
      endDate: clearEndDate ? null : (endDate ?? this.endDate),
      priority: priority ?? this.priority,
      tags: tags ?? this.tags,
      isTimeLog: isTimeLog ?? this.isTimeLog,
      startTime: clearStartTime ? null : (startTime ?? this.startTime),
      endTime: clearEndTime ? null : (endTime ?? this.endTime),
      description: description ?? this.description,
      listId: listId ?? this.listId,
      parentId: clearParentId ? null : (parentId ?? this.parentId),
      sectionId: clearSectionId ? null : (sectionId ?? this.sectionId),
      sortOrder: sortOrder ?? this.sortOrder,
      recurrence: clearRecurrence ? null : (recurrence ?? this.recurrence),
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'completed': completed,
        'dueDate': dueDate?.toIso8601String(),
        'endDate': endDate?.toIso8601String(),
        'priority': priority.name,
        'tags': tags,
        'isTimeLog': isTimeLog,
        'startTime': startTime,
        'endTime': endTime,
        'description': description,
        'listId': listId,
        if (parentId != null) 'parentId': parentId,
        if (sectionId != null) 'sectionId': sectionId,
        'sortOrder': sortOrder,
        if (recurrence != null) 'recurrence': recurrence,
        if (createdAt != null) 'createdAt': createdAt,
        if (updatedAt != null) 'updatedAt': updatedAt,
      };

  static TaskPriority _priorityFromJson(String? raw) {
    switch (raw) {
      case 'none':
        return TaskPriority.none;
      case 'low':
        return TaskPriority.low;
      case 'high':
        return TaskPriority.high;
      case 'medium':
      default:
        return TaskPriority.medium;
    }
  }

  static Map<String, dynamic>? _recurrenceFromJson(dynamic raw) {
    if (raw is! Map) return null;
    return Map<String, dynamic>.from(raw);
  }

  static DateTime? _parseDateField(dynamic v) {
    if (v == null) return null;
    final s = v.toString();
    final head = s.split('T').first;
    final parts = head.split('-');
    if (parts.length == 3) {
      final y = int.tryParse(parts[0]);
      final m = int.tryParse(parts[1]);
      final d = int.tryParse(parts[2]);
      if (y != null && m != null && d != null) {
        return DateTime(y, m, d);
      }
    }
    return DateTime.tryParse(s);
  }

  factory Task.fromJson(Map<String, dynamic> json) {
    final isTimeLogRaw = json['isTimeLog'] ?? json['is_time_log'];
    final listRaw = json['listId'] ?? json['list_id'];
    final parentRaw = json['parentId'] ?? json['parent_id'];
    final sectionRaw = json['sectionId'] ?? json['section_id'];
    final sortRaw = json['sortOrder'] ?? json['sort_order'];
    final dueRaw = json['dueDate'] ?? json['due_date'];
    final endRaw = json['endDate'] ?? json['end_date'];
    return Task(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      completed: json['completed'] as bool? ?? false,
      dueDate: _parseDateField(dueRaw),
      endDate: _parseDateField(endRaw),
      priority: _priorityFromJson(json['priority'] as String?),
      tags: (json['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      isTimeLog: isTimeLogRaw == true,
      startTime: json['startTime'] as String? ?? json['start_time'] as String?,
      endTime: json['endTime'] as String? ?? json['end_time'] as String?,
      description: json['description'] as String? ?? '',
      listId: listRaw is String && listRaw.isNotEmpty ? listRaw : inboxListId,
      parentId: parentRaw as String?,
      sectionId: sectionRaw as String?,
      sortOrder: switch (sortRaw) {
        final int i => i,
        final String s => int.tryParse(s) ?? 0,
        _ => int.tryParse('$sortRaw') ?? 0,
      },
      recurrence: _recurrenceFromJson(json['recurrence']),
      createdAt: json['createdAt'] as String? ?? json['created_at'] as String?,
      updatedAt: json['updatedAt'] as String? ?? json['updated_at'] as String?,
    );
  }
}

String _isoUtcNow() => DateTime.now().toUtc().toIso8601String();

/// 新規ローカルタスク用のタイムスタンプ付きインスタンス（未ログイン時の Hive 用）。
Task newLocalTask({
  required String id,
  required String title,
  bool completed = false,
  DateTime? dueDate,
  DateTime? endDate,
  TaskPriority priority = TaskPriority.medium,
  List<String> tags = const [],
  bool isTimeLog = false,
  String? startTime,
  String? endTime,
  String description = '',
  String listId = Task.inboxListId,
  String? parentId,
  String? sectionId,
  int sortOrder = 0,
  Map<String, dynamic>? recurrence,
}) {
  final now = _isoUtcNow();
  return Task(
    id: id,
    title: title,
    completed: completed,
    dueDate: dueDate,
    endDate: endDate,
    priority: priority,
    tags: tags,
    isTimeLog: isTimeLog,
    startTime: startTime,
    endTime: endTime,
    description: description,
    listId: listId,
    parentId: parentId,
    sectionId: sectionId,
    sortOrder: sortOrder,
    recurrence: recurrence,
    createdAt: now,
    updatedAt: now,
  );
}

DateTime startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

DateTime endOfDay(DateTime d) => DateTime(d.year, d.month, d.day, 23, 59, 59, 999);

/// Same calendar day (local), for matching log [dueDate] to a selected day.
bool sameCalendarDay(DateTime? a, DateTime b) {
  if (a == null) return false;
  return a.year == b.year && a.month == b.month && a.day == b.day;
}

/// タイムログがその暦日と重なる（開始日〜終了日の範囲、終了日未指定は開始日のみ）。
bool timeLogTouchesCalendarDay(Task t, DateTime day) {
  if (!t.isTimeLog || t.dueDate == null || t.startTime == null || t.endTime == null) {
    return false;
  }
  final endCal = t.endDate ?? t.dueDate!;
  final d = DateTime(day.year, day.month, day.day);
  final ds = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
  final de = DateTime(endCal.year, endCal.month, endCal.day);
  return !d.isBefore(ds) && !d.isAfter(de);
}

int timeLogStartSortMinutes(Task t) {
  final s = t.startTime;
  if (s == null || s.isEmpty) return 24 * 60;
  final parts = s.split(':');
  if (parts.length < 2) return 24 * 60;
  final h = int.tryParse(parts[0].trim()) ?? 0;
  final m = int.tryParse(parts[1].trim()) ?? 0;
  if (h < 0 || h > 47) return 24 * 60;
  return h * 60 + m.clamp(0, 59);
}

/// Filters for smart views (incomplete-first semantics). Caller should pass only non–time-log tasks for To‑Do.
List<Task> filterForSmartView(List<Task> tasks, SmartView view) {
  final now = DateTime.now();
  final sod = startOfDay(now);
  final eod = endOfDay(now);

  bool overdue(Task t) {
    if (t.completed || t.dueDate == null) return false;
    return t.dueDate!.isBefore(sod);
  }

  bool dueToday(Task t) {
    if (t.completed || t.dueDate == null) return false;
    final d = t.dueDate!;
    return !d.isBefore(sod) && !d.isAfter(eod);
  }

  bool upcoming(Task t) {
    if (t.completed || t.dueDate == null) return false;
    return t.dueDate!.isAfter(eod);
  }

  switch (view) {
    case SmartView.all:
      final open = tasks.where((t) => !t.completed).toList();
      final done = tasks.where((t) => t.completed).toList();
      return [...open, ...done];
    case SmartView.today:
      return tasks
          .where((t) => !t.completed && (dueToday(t) || overdue(t)))
          .toList();
    case SmartView.upcoming:
      return tasks.where((t) => !t.completed && upcoming(t)).toList();
    case SmartView.overdue:
      return tasks.where((t) => !t.completed && overdue(t)).toList();
  }
}
